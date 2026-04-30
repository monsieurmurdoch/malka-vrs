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
    AdminBillingDashboard,
    CorporateAccount,
    CorporateUsageSummary,
    CreateCorporateAccountInput,
    Invoice,
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
            id, tenant_id, organization_name, billing_contact_name, billing_contact_email,
            billing_contact_phone, payment_method, contract_type, contracted_rate_tier_id,
            billing_day, currency, tax_id, payment_terms_days, stripe_price_id, stripe_subscription_id,
            address_line1, address_line2, city, state, zip, country, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
            id,
            input.tenantId || null,
            input.organizationName,
            input.billingContactName,
            input.billingContactEmail,
            input.billingContactPhone || null,
            input.paymentMethod || 'invoice',
            input.contractType,
            input.contractedRateTierId || null,
            input.billingDay || 1,
            (input.currency || 'USD').toUpperCase(),
            input.taxId || null,
            input.paymentTermsDays || 30,
            input.stripePriceId || null,
            input.stripeSubscriptionId || null,
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
        `SELECT c.*
         FROM billing_cdrs c
         LEFT JOIN billing_invoice_items bii ON bii.cdr_id = c.id
         WHERE c.corporate_account_id = $1
           AND c.call_type = 'vri'
           AND c.start_time >= $2
           AND c.start_time < $3
           AND bii.id IS NULL
         ORDER BY c.start_time`,
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
            subtotal, tax, total, currency, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at`,
        [
            corporateAccountId,
            invoiceNumber,
            periodStart,
            periodEnd,
            subtotal,
            tax,
            total,
            account.currency,
            'draft',
            performedBy || null,
        ]
    );

    const invoiceId = result.rows[0].id;

    for (const row of cdrs.rows) {
        const durationMinutes = Math.ceil(Number(row.duration_seconds || 0) / 60);
        const totalCharge = parseFloat(row.total_charge as string);
        await billingDb.query(
            `INSERT INTO billing_invoice_items (
                invoice_id, cdr_id, description, quantity, unit_amount, total, currency, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (cdr_id) WHERE cdr_id IS NOT NULL DO NOTHING`,
            [
                invoiceId,
                row.id,
                `VRI interpreter minutes: ${new Date(row.start_time as string).toISOString()}`,
                durationMinutes,
                parseFloat(row.per_minute_rate as string),
                totalCharge,
                account.currency,
                JSON.stringify({ callId: row.call_id, language: row.language || null }),
            ]
        );
    }

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
        currency: account.currency,
        status: 'draft',
        stripeInvoiceId: null,
        stripePaymentIntentId: null,
        stripeHostedInvoiceUrl: null,
        stripeInvoicePdfUrl: null,
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
    let stripeHostedInvoiceUrl: string | null = null;
    let stripeInvoicePdfUrl: string | null = null;
    let dueDate: string | null = null;

    // Send to Stripe if applicable
    if (account?.paymentMethod === 'stripe' && account.stripeCustomerId) {
        try {
            const stripe = createStripeProvider();
            const dueDateObj = new Date();
            dueDateObj.setDate(dueDateObj.getDate() + (account.paymentTermsDays || 30));
            dueDate = dueDateObj.toISOString().slice(0, 10);

            const itemRows = await billingDb.query(
                'SELECT description, quantity, unit_amount, total FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at',
                [invoiceId]
            );
            const stripeInvoice = await stripe.createInvoice({
                customerId: account.stripeCustomerId,
                currency: account.currency.toLowerCase(),
                items: itemRows.rows.map((item: Record<string, unknown>) => ({
                    description: item.description as string,
                    quantity: Number(item.quantity || 1),
                    unitAmount: Math.round(parseFloat(item.unit_amount as string) * 100),
                    total: Math.round(parseFloat(item.total as string) * 100),
                })),
                dueDate: dueDateObj,
                metadata: { invoiceId },
            });
            const sentInvoice = await stripe.sendInvoice(stripeInvoice.id);
            stripeInvoiceId = sentInvoice.id;
            stripeHostedInvoiceUrl = sentInvoice.hostedUrl || stripeInvoice.hostedUrl || null;
            stripeInvoicePdfUrl = sentInvoice.pdfUrl || stripeInvoice.pdfUrl || null;
            await billingDb.query(
                `UPDATE invoices
                 SET stripe_hosted_invoice_url = $1,
                     stripe_invoice_pdf_url = $2
                 WHERE id = $3`,
                [stripeHostedInvoiceUrl, stripeInvoicePdfUrl, invoiceId]
            );
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
        stripeHostedInvoiceUrl,
        stripeInvoicePdfUrl,
        performedBy,
    });

    const updated = await billingDb.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    return updated.rows[0] ? mapInvoiceRow(updated.rows[0]) : null;
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

export async function getCorporateUsageSummary(
    corporateAccountId: string,
    periodStart: string,
    periodEnd: string
): Promise<CorporateUsageSummary | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const account = await getCorporateAccount(corporateAccountId);
    if (!account) return null;

    const totals = await usageTotals(corporateAccountId, periodStart, periodEnd);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

    return {
        accountId: corporateAccountId,
        periodStart,
        periodEnd,
        totalCalls: totals.totalCalls,
        totalMinutes: totals.totalMinutes,
        totalCharge: totals.totalCharge,
        currency: account.currency,
        day: await usageTotals(corporateAccountId, today, periodEnd),
        week: await usageTotals(corporateAccountId, weekStart.toISOString().slice(0, 10), periodEnd),
        month: await usageTotals(corporateAccountId, monthStart, periodEnd),
    };
}

async function usageTotals(
    corporateAccountId: string,
    periodStart: string,
    periodEnd: string
): Promise<{ totalCalls: number; totalMinutes: number; totalCharge: number }> {
    const result = await billingDb.query<{
        total_calls: string;
        total_seconds: string;
        total_charge: string;
    }>(
        `SELECT COUNT(*) AS total_calls,
                COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                COALESCE(SUM(total_charge), 0) AS total_charge
         FROM billing_cdrs
         WHERE corporate_account_id = $1
           AND call_type = 'vri'
           AND start_time >= $2
           AND start_time < $3`,
        [corporateAccountId, periodStart, periodEnd]
    );

    const row = result.rows[0] || { total_calls: '0', total_seconds: '0', total_charge: '0' };
    return {
        totalCalls: parseInt(row.total_calls || '0', 10),
        totalMinutes: Math.round((parseInt(row.total_seconds || '0', 10) / 60) * 100) / 100,
        totalCharge: parseFloat(row.total_charge || '0'),
    };
}

export async function getCorporateUsageCsv(
    corporateAccountId: string,
    periodStart: string,
    periodEnd: string
): Promise<string | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `SELECT call_id, start_time, end_time, duration_seconds, language,
                per_minute_rate, total_charge
         FROM billing_cdrs
         WHERE corporate_account_id = $1
           AND call_type = 'vri'
           AND start_time >= $2
           AND start_time < $3
         ORDER BY start_time`,
        [corporateAccountId, periodStart, periodEnd]
    );

    const lines = [
        'call_id,start_time,end_time,duration_seconds,language,per_minute_rate,total_charge',
        ...result.rows.map((row: Record<string, unknown>) => [
            row.call_id,
            row.start_time,
            row.end_time,
            row.duration_seconds,
            row.language || '',
            row.per_minute_rate,
            row.total_charge,
        ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ];
    return `${lines.join('\n')}\n`;
}

export async function getAdminBillingDashboard(): Promise<AdminBillingDashboard | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const counts = await billingDb.query<{ status: string; count: string; total: string }>(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM invoices
         GROUP BY status`
    );
    const accounts = await billingDb.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM corporate_accounts WHERE is_active = true`
    );
    const recent = await billingDb.query(
        `SELECT * FROM invoices ORDER BY created_at DESC LIMIT 20`
    );

    const invoiceStatusCounts: Record<string, number> = {};
    const totals = {
        draft: 0,
        issued: 0,
        paid: 0,
        overdue: 0,
        cancelled: 0,
        outstanding: 0,
    };

    for (const row of counts.rows) {
        const status = row.status as keyof typeof totals;
        const total = parseFloat(row.total || '0');
        invoiceStatusCounts[row.status] = parseInt(row.count || '0', 10);
        if (status in totals) totals[status] = total;
        if (row.status === 'issued' || row.status === 'overdue') totals.outstanding += total;
    }

    return {
        generatedAt: new Date(),
        invoiceStatusCounts,
        totals,
        activeCorporateAccounts: parseInt(accounts.rows[0]?.count || '0', 10),
        recentInvoices: recent.rows.map(mapInvoiceRow),
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
        `SELECT cdr_id AS id
         FROM billing_invoice_items
         WHERE invoice_id = $1 AND cdr_id IS NOT NULL`,
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

export async function recordInvoicePayment(input: {
    invoiceId: string;
    amount: number;
    currency?: string;
    provider?: string;
    providerPaymentId?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    performedBy?: string;
}): Promise<void> {
    if (!billingDb.isBillingDbReady()) return;

    await billingDb.query(
        `INSERT INTO billing_payments (
            invoice_id, provider, provider_payment_id, amount, currency, status,
            received_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [
            input.invoiceId,
            input.provider || 'manual',
            input.providerPaymentId || null,
            input.amount,
            (input.currency || 'USD').toUpperCase(),
            input.status || 'succeeded',
            JSON.stringify(input.metadata || {}),
        ]
    );

    if ((input.status || 'succeeded') === 'succeeded') {
        await markInvoicePaid(input.invoiceId, input.providerPaymentId, input.performedBy);
    }
}

export async function createCorporatePortalSession(input: {
    corporateAccountId: string;
    returnUrl: string;
}): Promise<{ url: string } | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const account = await getCorporateAccount(input.corporateAccountId);
    if (!account) throw new Error(`Corporate account ${input.corporateAccountId} not found`);
    if (!account.stripeCustomerId) throw new Error('Corporate account does not have a Stripe customer');

    const provider = createStripeProvider();
    return provider.createCustomerPortalSession({
        customerId: account.stripeCustomerId,
        returnUrl: input.returnUrl,
    });
}

export async function createCorporatePaymentMethodSetup(input: {
    corporateAccountId: string;
    usage?: 'on_session' | 'off_session';
}): Promise<{ id: string; status: string; clientSecret?: string } | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const account = await getCorporateAccount(input.corporateAccountId);
    if (!account) throw new Error(`Corporate account ${input.corporateAccountId} not found`);
    if (!account.stripeCustomerId) throw new Error('Corporate account does not have a Stripe customer');

    const provider = createStripeProvider();
    return provider.createSetupIntent({
        customerId: account.stripeCustomerId,
        usage: input.usage || 'off_session',
        metadata: { corporateAccountId: input.corporateAccountId },
    });
}

export async function createInvoiceCreditNote(input: {
    invoiceId: string;
    amount: number;
    reason: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `SELECT i.*, ca.payment_method
         FROM invoices i
         LEFT JOIN corporate_accounts ca ON ca.id = i.corporate_account_id
         WHERE i.id = $1`,
        [input.invoiceId]
    );
    if (!result.rows[0]) throw new Error(`Invoice ${input.invoiceId} not found`);

    const invoice = result.rows[0];
    const currency = String(invoice.currency || 'USD').toUpperCase();
    let providerCreditNoteId: string | null = null;
    let providerStatus = 'issued';

    if (invoice.payment_method === 'stripe' && invoice.stripe_invoice_id) {
        const provider = createStripeProvider();
        const creditNote = await provider.createCreditNote({
            invoiceId: invoice.stripe_invoice_id as string,
            amount: Math.round(input.amount * 100),
            reason: input.reason,
            metadata: { invoiceId: input.invoiceId },
        });
        providerCreditNoteId = creditNote.id;
        providerStatus = creditNote.status || providerStatus;
    }

    const note = await billingDb.query(
        `INSERT INTO billing_credit_notes (
            invoice_id, provider, provider_credit_note_id, amount, currency, reason,
            status, created_by, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
            input.invoiceId,
            invoice.payment_method === 'stripe' ? 'stripe' : 'manual',
            providerCreditNoteId,
            input.amount,
            currency,
            input.reason,
            providerStatus,
            input.createdBy || null,
            JSON.stringify(input.metadata || {}),
        ]
    );

    await billingDb.query(
        `INSERT INTO billing_adjustments (
            invoice_id, amount, currency, reason, status, created_by, metadata
        ) VALUES ($1, $2, $3, $4, 'approved', $5, $6)`,
        [
            input.invoiceId,
            input.amount * -1,
            currency,
            input.reason,
            input.createdBy || null,
            JSON.stringify({
                source: 'credit_note',
                creditNoteId: note.rows[0].id,
                providerCreditNoteId,
            }),
        ]
    );

    await logBillingEvent('invoice_credit_note_created', 'invoice', input.invoiceId, {
        amount: input.amount,
        currency,
        reason: input.reason,
        providerCreditNoteId,
    }, input.createdBy || null);

    return mapGenericJson(note.rows[0]);
}

// ─── Row Mappers ───────────────────────────────────────────

function mapCorporateRow(row: Record<string, unknown>): CorporateAccount {
    return {
        id: row.id as string,
        tenantId: row.tenant_id as string | null,
        organizationName: row.organization_name as string,
        billingContactName: row.billing_contact_name as string,
        billingContactEmail: row.billing_contact_email as string,
        billingContactPhone: row.billing_contact_phone as string | null,
        stripeCustomerId: row.stripe_customer_id as string | null,
        stripePriceId: row.stripe_price_id as string | null,
        stripeSubscriptionId: row.stripe_subscription_id as string | null,
        paymentMethod: row.payment_method as 'invoice' | 'stripe' | 'wire',
        contractType: row.contract_type as 'monthly' | 'per_call' | 'quarterly',
        contractedRateTierId: row.contracted_rate_tier_id as string | null,
        billingDay: row.billing_day as number,
        currency: (row.currency as string) || 'USD',
        taxId: row.tax_id as string | null,
        paymentTermsDays: row.payment_terms_days as number || 30,
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
        currency: (row.currency as string) || 'USD',
        status: row.status as Invoice['status'],
        stripeInvoiceId: row.stripe_invoice_id as string | null,
        stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
        stripeHostedInvoiceUrl: row.stripe_hosted_invoice_url as string | null,
        stripeInvoicePdfUrl: row.stripe_invoice_pdf_url as string | null,
        issuedAt: row.issued_at ? new Date(row.issued_at as string) : null,
        dueDate: row.due_date as string | null,
        paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    };
}

function mapGenericJson(row: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (key === 'metadata' && typeof value === 'string') {
            try {
                mapped[key] = JSON.parse(value);
            } catch {
                mapped[key] = {};
            }
        } else {
            mapped[key] = value;
        }
    }
    return mapped;
}
