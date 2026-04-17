/**
 * VRI Billing Pipeline
 *
 * Handles corporate client billing for VRI (Video Remote Interpreting):
 * - Corporate account management
 * - Invoice generation
 * - Stripe payment integration
 * - Payment tracking
 */

import * as billingDb from '../lib/billing-db';
import { logBillingEvent } from './audit-service';
import { getCdrsForPeriod, transitionCdrStatus } from './cdr-service';
import { createStripeProvider } from './stripe/stripe-factory';
import { v4 as uuidv4 } from 'uuid';
import type {
    CorporateAccount,
    CreateCorporateAccountInput,
    Invoice,
    BillingCdr,
} from './types';

// ─── Corporate Account Management ──────────────────────────

/**
 * Create a new corporate account.
 */
export async function createCorporateAccount(
    input: CreateCorporateAccountInput
): Promise<CorporateAccount | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const id = uuidv4();

    await billingDb.query(
        `INSERT INTO corporate_accounts (
            id, organization_name, billing_contact_name, billing_contact_email,
            billing_contact_phone, payment_method, contract_type, contracted_rate_tier_id,
            billing_day, address_line1, address_line2, city, state, zip, country, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
            id,
            input.organizationName,
            input.billingContactName,
            input.billingContactEmail,
            input.billingContactPhone || null,
            input.paymentMethod || 'invoice',
            input.contractType,
            input.contractedRateTierId || null,
            input.billingDay || 1,
            input.addressLine1 || null,
            input.addressLine2 || null,
            input.city || null,
            input.state || null,
            input.zip || null,
            input.country || 'US',
            input.notes || null,
            input.createdBy || null,
        ]
    );

    // Create Stripe customer if payment method is stripe
    if (input.paymentMethod === 'stripe') {
        try {
            const stripe = createStripeProvider();
            const customer = await stripe.createCustomer({
                name: input.organizationName,
                email: input.billingContactEmail,
                metadata: { corporateAccountId: id },
            });
            await billingDb.query(
                'UPDATE corporate_accounts SET stripe_customer_id = $1 WHERE id = $2',
                [customer.id, id]
            );
        } catch (err) {
            console.error('[VRI Billing] Failed to create Stripe customer:', err);
        }
    }

    await logBillingEvent('corporate_account_created', 'corporate_account', id, {
        organizationName: input.organizationName,
        contractType: input.contractType,
    });

    return getCorporateAccount(id);
}

/**
 * Get a corporate account by ID.
 */
export async function getCorporateAccount(id: string): Promise<CorporateAccount | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        'SELECT * FROM corporate_accounts WHERE id = $1',
        [id]
    );

    if (result.rows.length === 0) return null;
    return mapCorporateRow(result.rows[0]);
}

/**
 * List all active corporate accounts.
 */
export async function getCorporateAccounts(): Promise<CorporateAccount[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const result = await billingDb.query(
        'SELECT * FROM corporate_accounts WHERE is_active = true ORDER BY organization_name'
    );

    return result.rows.map(mapCorporateRow);
}

// ─── Invoice Generation ────────────────────────────────────

/**
 * Generate an invoice for a corporate account for a billing period.
 */
export async function generateInvoice(
    corporateAccountId: string,
    periodStart: string,
    periodEnd: string,
    performedBy?: string
): Promise<Invoice | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const account = await getCorporateAccount(corporateAccountId);
    if (!account) throw new Error(`Corporate account ${corporateAccountId} not found`);

    // Get VRI CDRs for this account in the period
    const cdrs = await billingDb.query(
        `SELECT * FROM billing_cdrs
         WHERE corporate_account_id = $1
           AND call_type = 'vri'
           AND start_time >= $2
           AND start_time < $3
         ORDER BY start_time`,
        [corporateAccountId, periodStart, periodEnd]
    );

    const subtotal = cdrs.rows.reduce((sum, row: Record<string, unknown>) => sum + parseFloat(row.total_charge as string), 0);
    const tax = 0; // Tax calculation can be added later
    const total = subtotal + tax;

    // Generate invoice number
    const invoiceNumber = `VRI-${Date.now()}-${corporateAccountId.slice(0, 8)}`;

    const result = await billingDb.query<{ id: string; created_at: string }>(
        `INSERT INTO invoices (
            corporate_account_id, invoice_number,
            billing_period_start, billing_period_end,
            subtotal, tax, total, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, created_at`,
        [
            corporateAccountId,
            invoiceNumber,
            periodStart,
            periodEnd,
            subtotal,
            tax,
            total,
            'draft',
            performedBy || null,
        ]
    );

    const invoiceId = result.rows[0].id;

    // Link CDRs to this invoice
    await billingDb.query(
        `UPDATE billing_cdrs SET invoice_id = $1
         WHERE corporate_account_id = $2
           AND call_type = 'vri'
           AND start_time >= $3
           AND start_time < $4`,
        [invoiceId, corporateAccountId, periodStart, periodEnd]
    );

    await logBillingEvent('invoice_generated', 'invoice', invoiceId, {
        corporateAccountId,
        invoiceNumber,
        periodStart,
        periodEnd,
        subtotal,
        total,
        cdrCount: cdrs.rows.length,
    });

    return {
        id: invoiceId,
        corporateAccountId,
        invoiceNumber,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        subtotal,
        tax,
        total,
        status: 'draft',
        stripeInvoiceId: null,
        stripePaymentIntentId: null,
        issuedAt: null,
        dueDate: null,
        paidAt: null,
        createdAt: new Date(result.rows[0].created_at),
        createdBy: performedBy || null,
    };
}

/**
 * Issue an invoice (change status to 'issued').
 * If the account uses Stripe, creates a Stripe invoice.
 */
export async function issueInvoice(
    invoiceId: string,
    performedBy?: string
): Promise<Invoice | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const invResult = await billingDb.query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoiceId]
    );
    if (invResult.rows.length === 0) return null;

    const invoiceRow = invResult.rows[0];
    const account = await getCorporateAccount(invoiceRow.corporate_account_id);

    let stripeInvoiceId: string | null = null;
    let dueDate: string | null = null;

    // Send to Stripe if applicable
    if (account?.paymentMethod === 'stripe' && account.stripeCustomerId) {
        try {
            const stripe = createStripeProvider();
            const dueDateObj = new Date();
            dueDateObj.setDate(dueDateObj.getDate() + 30);
            dueDate = dueDateObj.toISOString().slice(0, 10);

            const stripeInvoice = await stripe.createInvoice({
                customerId: account.stripeCustomerId,
                items: [{
                    description: `VRI Services: ${invoiceRow.billing_period_start} to ${invoiceRow.billing_period_end}`,
                    quantity: 1,
                    unitAmount: Math.round(invoiceRow.total * 100),
                    total: Math.round(invoiceRow.total * 100),
                }],
                dueDate: dueDateObj,
                metadata: { invoiceId },
            });
            stripeInvoiceId = stripeInvoice.id;
        } catch (err) {
            console.error('[VRI Billing] Failed to create Stripe invoice:', err);
        }
    }

    await billingDb.query(
        `UPDATE invoices SET status = 'issued', issued_at = NOW(), due_date = $1, stripe_invoice_id = $2
         WHERE id = $3`,
        [dueDate, stripeInvoiceId, invoiceId]
    );

    await logBillingEvent('invoice_issued', 'invoice', invoiceId, {
        stripeInvoiceId,
        performedBy,
    });

    return null; // Caller should re-fetch if needed
}

/**
 * Get billing summary for a corporate account (dashboard data).
 */
export async function getCorporateBillingSummary(
    corporateAccountId: string
): Promise<{
    account: CorporateAccount | null;
    recentInvoices: Invoice[];
    totalCallsThisMonth: number;
    totalChargeThisMonth: number;
}> {
    if (!billingDb.isBillingDbReady()) {
        return {
            account: null,
            recentInvoices: [],
            totalCallsThisMonth: 0,
            totalChargeThisMonth: 0,
        };
    }

    const account = await getCorporateAccount(corporateAccountId);

    const invoices = await billingDb.query(
        `SELECT * FROM invoices WHERE corporate_account_id = $1 ORDER BY created_at DESC LIMIT 12`,
        [corporateAccountId]
    );

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const stats = await billingDb.query<{
        total_calls: string;
        total_charge: string;
    }>(
        `SELECT COUNT(*) as total_calls, COALESCE(SUM(total_charge), 0) as total_charge
         FROM billing_cdrs
         WHERE corporate_account_id = $1 AND call_type = 'vri' AND start_time >= $2`,
        [corporateAccountId, monthStart]
    );

    return {
        account,
        recentInvoices: invoices.rows.map(mapInvoiceRow),
        totalCallsThisMonth: parseInt(stats.rows[0]?.total_calls || '0', 10),
        totalChargeThisMonth: parseFloat(stats.rows[0]?.total_charge || '0'),
    };
}

/**
 * Mark an invoice as paid.
 */
export async function markInvoicePaid(
    invoiceId: string,
    stripePaymentId?: string,
    performedBy?: string
): Promise<void> {
    if (!billingDb.isBillingDbReady()) return;

    await billingDb.query(
        `UPDATE invoices SET status = 'paid', paid_at = NOW(), stripe_payment_intent_id = $1
         WHERE id = $2`,
        [stripePaymentId || null, invoiceId]
    );

    // Transition CDRs linked to this invoice to 'paid'
    const cdrs = await billingDb.query<{ id: string }>(
        'SELECT id FROM billing_cdrs WHERE invoice_id = $1',
        [invoiceId]
    );

    for (const cdr of cdrs.rows) {
        try {
            await transitionCdrStatus(cdr.id, 'paid', performedBy, `Invoice ${invoiceId} paid`);
        } catch (err) {
            console.error(`[VRI Billing] Failed to transition CDR ${cdr.id}:`, err);
        }
    }

    await logBillingEvent('invoice_paid', 'invoice', invoiceId, {
        stripePaymentId,
        cdrCount: cdrs.rows.length,
        performedBy,
    });
}

// ─── Row Mappers ───────────────────────────────────────────

function mapCorporateRow(row: Record<string, unknown>): CorporateAccount {
    return {
        id: row.id as string,
        organizationName: row.organization_name as string,
        billingContactName: row.billing_contact_name as string,
        billingContactEmail: row.billing_contact_email as string,
        billingContactPhone: row.billing_contact_phone as string | null,
        stripeCustomerId: row.stripe_customer_id as string | null,
        paymentMethod: row.payment_method as 'invoice' | 'stripe' | 'wire',
        contractType: row.contract_type as 'monthly' | 'per_call' | 'quarterly',
        contractedRateTierId: row.contracted_rate_tier_id as string | null,
        billingDay: row.billing_day as number,
        addressLine1: row.address_line1 as string | null,
        addressLine2: row.address_line2 as string | null,
        city: row.city as string | null,
        state: row.state as string | null,
        zip: row.zip as string | null,
        country: row.country as string,
        notes: row.notes as string | null,
        isActive: row.is_active as boolean,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        createdBy: row.created_by as string | null,
    };
}

function mapInvoiceRow(row: Record<string, unknown>): Invoice {
    return {
        id: row.id as string,
        corporateAccountId: row.corporate_account_id as string,
        invoiceNumber: row.invoice_number as string,
        billingPeriodStart: row.billing_period_start as string,
        billingPeriodEnd: row.billing_period_end as string,
        subtotal: parseFloat(row.subtotal as string),
        tax: parseFloat(row.tax as string),
        total: parseFloat(row.total as string),
        status: row.status as Invoice['status'],
        stripeInvoiceId: row.stripe_invoice_id as string | null,
        stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
        issuedAt: row.issued_at ? new Date(row.issued_at as string) : null,
        dueDate: row.due_date as string | null,
        paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    };
}
