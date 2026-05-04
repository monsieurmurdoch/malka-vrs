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
    BulkInvoiceSendInput,
    BulkInvoiceSendResult,
    CorporateAccount,
    CreateCorporateAccountInput,
    Invoice,
    InvoiceRecipient,
    InvoiceSendEvent,
    InvoiceSendResult,
    SendInvoiceOptions,
    UpsertInvoiceRecipientInput,
} from './types';

const { sendInvoiceEmail } = require('../../lib/email-service');

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

    await replaceCorporateInvoiceRecipients(id, [
        {
            recipientType: 'to',
            name: input.billingContactName,
            email: input.billingContactEmail,
            isPrimary: true,
            isActive: true,
        },
        ...(input.invoiceRecipients || []),
    ], input.createdBy);

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

export async function getCorporateInvoiceRecipients(corporateAccountId: string): Promise<InvoiceRecipient[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const result = await billingDb.query(
        `SELECT * FROM corporate_account_invoice_recipients
         WHERE corporate_account_id = $1 AND is_active = true
         ORDER BY
            CASE recipient_type WHEN 'to' THEN 1 WHEN 'cc' THEN 2 ELSE 3 END,
            is_primary DESC,
            email`,
        [corporateAccountId]
    );

    return result.rows.map(mapInvoiceRecipientRow);
}

export async function replaceCorporateInvoiceRecipients(
    corporateAccountId: string,
    recipients: UpsertInvoiceRecipientInput[],
    performedBy?: string
): Promise<InvoiceRecipient[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const normalized = normalizeRecipientInputs(recipients);

    await billingDb.transaction(async (client) => {
        await client.query(
            `UPDATE corporate_account_invoice_recipients
             SET is_active = false, updated_at = NOW()
             WHERE corporate_account_id = $1`,
            [corporateAccountId]
        );

        for (const recipient of normalized) {
            await client.query(
                `INSERT INTO corporate_account_invoice_recipients (
                    id, corporate_account_id, recipient_type, name, email, is_primary, is_active, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
                [
                    recipient.id || uuidv4(),
                    corporateAccountId,
                    recipient.recipientType,
                    recipient.name || null,
                    recipient.email,
                    Boolean(recipient.isPrimary),
                    performedBy || null,
                ]
            );
        }
    });

    await logBillingEvent('invoice_recipients_updated', 'corporate_account', corporateAccountId, {
        count: normalized.length,
        performedBy,
    });

    return getCorporateInvoiceRecipients(corporateAccountId);
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
        sentAt: null,
        lastSendStatus: null,
        lastSendError: null,
        stripeHostedUrl: null,
        createdAt: new Date(result.rows[0].created_at),
        createdBy: performedBy || null,
    };
}

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        'SELECT * FROM invoices WHERE id = $1',
        [invoiceId]
    );

    return result.rows[0] ? mapInvoiceRow(result.rows[0]) : null;
}

export async function findInvoiceForPeriod(
    corporateAccountId: string,
    periodStart: string,
    periodEnd: string
): Promise<Invoice | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `SELECT * FROM invoices
         WHERE corporate_account_id = $1
           AND billing_period_start = $2
           AND billing_period_end = $3
           AND status <> 'cancelled'
         ORDER BY created_at DESC
         LIMIT 1`,
        [corporateAccountId, periodStart, periodEnd]
    );

    return result.rows[0] ? mapInvoiceRow(result.rows[0]) : null;
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
    if (invoiceRow.status !== 'draft') {
        return mapInvoiceRow(invoiceRow);
    }

    const account = await getCorporateAccount(invoiceRow.corporate_account_id);

    let stripeInvoiceId: string | null = null;
    let stripeHostedUrl: string | null = null;
    let dueDate: string | null = null;

    // Send to Stripe if applicable
    if (account?.paymentMethod === 'stripe') {
        try {
            const stripe = createStripeProvider();
            let stripeCustomerId = account.stripeCustomerId;
            if (!stripeCustomerId) {
                const customer = await stripe.createCustomer({
                    name: account.organizationName,
                    email: account.billingContactEmail,
                    metadata: { corporateAccountId: account.id },
                });
                stripeCustomerId = customer.id;
                await billingDb.query(
                    'UPDATE corporate_accounts SET stripe_customer_id = $1 WHERE id = $2',
                    [stripeCustomerId, account.id]
                );
            }

            const dueDateObj = new Date();
            dueDateObj.setDate(dueDateObj.getDate() + 30);
            dueDate = dueDateObj.toISOString().slice(0, 10);

            const stripeInvoice = await stripe.createInvoice({
                customerId: stripeCustomerId,
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
            stripeHostedUrl = stripeInvoice.hostedUrl || null;
        } catch (err) {
            console.error('[VRI Billing] Failed to create Stripe invoice:', err);
        }
    }

    await billingDb.query(
        `UPDATE invoices
         SET status = 'issued',
             issued_at = NOW(),
             due_date = $1,
             stripe_invoice_id = $2,
             stripe_hosted_url = $3
         WHERE id = $4`,
        [dueDate, stripeInvoiceId, stripeHostedUrl, invoiceId]
    );

    await logBillingEvent('invoice_issued', 'invoice', invoiceId, {
        stripeInvoiceId,
        performedBy,
    });

    return getInvoice(invoiceId);
}

export async function sendInvoice(
    invoiceId: string,
    options: SendInvoiceOptions = {}
): Promise<InvoiceSendResult> {
    if (!billingDb.isBillingDbReady()) {
        return { invoice: null, event: null, sent: false, status: 'failed', message: 'Billing not configured' };
    }

    let invoice = await getInvoice(invoiceId);
    if (!invoice) {
        return { invoice: null, event: null, sent: false, status: 'failed', message: 'Invoice not found' };
    }

    if (invoice.sentAt && !options.forceResend) {
        return {
            invoice,
            event: null,
            sent: false,
            status: 'skipped',
            message: 'Invoice already sent',
        };
    }

    if (invoice.status === 'draft') {
        invoice = await issueInvoice(invoiceId, options.performedBy);
    }

    if (!invoice) {
        return { invoice: null, event: null, sent: false, status: 'failed', message: 'Invoice could not be issued' };
    }

    const account = await getCorporateAccount(invoice.corporateAccountId);
    if (!account) {
        return { invoice, event: null, sent: false, status: 'failed', message: 'Corporate account not found' };
    }

    const recipients = await resolveInvoiceRecipients(account);
    const deliveryMode = options.deliveryMode || 'manual';
    const providerResult: Record<string, unknown> = {};
    let stripeHostedUrl = invoice.stripeHostedUrl;
    let stripeSent = false;
    let smtpSent = false;
    let errorMessage: string | null = null;

    if (invoice.stripeInvoiceId) {
        try {
            const stripe = createStripeProvider();
            const stripeInvoice = await stripe.sendInvoice({
                invoiceId: invoice.stripeInvoiceId,
                metadata: { invoiceId: invoice.id, deliveryMode },
            });
            stripeHostedUrl = stripeInvoice.hostedUrl || stripeHostedUrl;
            stripeSent = true;
            providerResult.stripe = {
                invoiceId: stripeInvoice.id,
                status: stripeInvoice.status,
                hostedUrl: stripeInvoice.hostedUrl,
                sentAt: stripeInvoice.sentAt,
            };
        } catch (err) {
            errorMessage = err instanceof Error ? err.message : String(err);
            providerResult.stripe = { sent: false, error: errorMessage };
        }
    }

    const extraTo = invoice.stripeInvoiceId
        ? recipients.to.filter(email => email.toLowerCase() !== account.billingContactEmail.toLowerCase())
        : recipients.to;
    const copyTo = dedupeEmails([
        ...extraTo,
        ...(invoice.stripeInvoiceId ? recipients.cc : []),
        ...(invoice.stripeInvoiceId ? recipients.bcc : []),
        ...(invoice.stripeInvoiceId ? recipients.businessCopyEmails : []),
    ]);

    if (!invoice.stripeInvoiceId || copyTo.length > 0) {
        const emailResult = await sendInvoiceEmail({
            to: invoice.stripeInvoiceId ? copyTo : recipients.to,
            cc: invoice.stripeInvoiceId ? [] : recipients.cc,
            bcc: invoice.stripeInvoiceId ? [] : recipients.bcc,
            invoiceNumber: invoice.invoiceNumber,
            organizationName: account.organizationName,
            periodStart: invoice.billingPeriodStart,
            periodEnd: invoice.billingPeriodEnd,
            total: invoice.total,
            hostedUrl: stripeHostedUrl,
        });
        smtpSent = Boolean(emailResult.sent || emailResult.mock);
        providerResult.email = emailResult;
        if (!smtpSent && emailResult.error) {
            errorMessage = errorMessage || emailResult.error;
        }
    }

    const sent = Boolean(stripeSent || smtpSent);
    const status: InvoiceSendResult['status'] = sent && errorMessage ? 'partial' : sent ? 'sent' : 'failed';
    const event = await recordInvoiceSendEvent({
        invoice,
        account,
        deliveryMode,
        status,
        stripeHostedUrl,
        recipients,
        providerResult,
        errorMessage,
        performedBy: options.performedBy,
    });

    await billingDb.query(
        `UPDATE invoices
         SET sent_at = CASE WHEN $1::text IN ('sent', 'partial') THEN NOW() ELSE sent_at END,
             last_send_status = $1,
             last_send_error = $2,
             stripe_hosted_url = COALESCE($3, stripe_hosted_url)
         WHERE id = $4`,
        [status, errorMessage, stripeHostedUrl, invoice.id]
    );

    await logBillingEvent('invoice_sent', 'invoice', invoice.id, {
        status,
        deliveryMode,
        stripeSent,
        smtpSent,
        recipientTo: recipients.to,
        recipientCc: recipients.cc,
        businessCopyEmails: recipients.businessCopyEmails,
        errorMessage,
        performedBy: options.performedBy,
    });

    return {
        invoice: await getInvoice(invoice.id),
        event,
        sent,
        status,
        message: errorMessage || undefined,
    };
}

export async function bulkGenerateAndSendInvoices(
    input: BulkInvoiceSendInput
): Promise<BulkInvoiceSendResult> {
    if (!billingDb.isBillingDbReady()) {
        return {
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            requestedAccountIds: input.corporateAccountIds,
            generated: 0,
            sent: 0,
            skipped: input.corporateAccountIds.length,
            failed: 0,
            results: input.corporateAccountIds.map(id => ({
                corporateAccountId: id,
                invoiceId: null,
                status: 'skipped',
                message: 'Billing not configured',
            })),
        };
    }

    const results: BulkInvoiceSendResult['results'] = [];
    let generated = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const corporateAccountId of input.corporateAccountIds) {
        try {
            let invoice = await findInvoiceForPeriod(corporateAccountId, input.periodStart, input.periodEnd);
            let wasGenerated = false;

            if (!invoice && input.autoGenerate !== false) {
                invoice = await generateInvoice(corporateAccountId, input.periodStart, input.periodEnd, input.performedBy);
                if (invoice) {
                    wasGenerated = true;
                    generated++;
                }
            }

            if (!invoice) {
                skipped++;
                results.push({
                    corporateAccountId,
                    invoiceId: null,
                    status: 'skipped',
                    message: 'No invoice exists for this period',
                });
                continue;
            }

            if (input.issueAndSend === false) {
                results.push({
                    corporateAccountId,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    status: wasGenerated ? 'generated' : 'skipped',
                    message: wasGenerated ? 'Invoice generated but not sent' : 'Existing invoice left unsent',
                });
                if (!wasGenerated) skipped++;
                continue;
            }

            const sendResult = await sendInvoice(invoice.id, {
                performedBy: input.performedBy,
                deliveryMode: 'bulk',
            });

            if (sendResult.status === 'sent' || sendResult.status === 'partial') {
                sent++;
            } else if (sendResult.status === 'skipped') {
                skipped++;
            } else {
                failed++;
            }

            results.push({
                corporateAccountId,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                status: sendResult.status === 'sent' || sendResult.status === 'partial'
                    ? 'sent'
                    : sendResult.status === 'skipped'
                        ? 'skipped'
                        : 'failed',
                message: sendResult.message,
            });
        } catch (err) {
            failed++;
            results.push({
                corporateAccountId,
                invoiceId: null,
                status: 'failed',
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        requestedAccountIds: input.corporateAccountIds,
        generated,
        sent,
        skipped,
        failed,
        results,
    };
}

export async function runDueInvoiceAutomation(options: {
    asOfDate?: string;
    autoSend?: boolean;
    performedBy?: string;
} = {}): Promise<BulkInvoiceSendResult> {
    const accounts = await getCorporateAccounts();
    const asOf = options.asOfDate ? new Date(`${options.asOfDate}T12:00:00Z`) : new Date();
    const dueAccounts = accounts.filter(account => account.billingDay <= asOf.getUTCDate());
    const period = previousCalendarMonthPeriod(asOf);

    return bulkGenerateAndSendInvoices({
        corporateAccountIds: dueAccounts.map(account => account.id),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        autoGenerate: true,
        issueAndSend: options.autoSend !== false,
        performedBy: options.performedBy || 'billing-auto-run',
    });
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

function normalizeRecipientInputs(recipients: UpsertInvoiceRecipientInput[]): UpsertInvoiceRecipientInput[] {
    const seen = new Set<string>();
    const normalized: UpsertInvoiceRecipientInput[] = [];

    for (const recipient of recipients) {
        const email = String(recipient.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            continue;
        }

        const recipientType = recipient.recipientType || 'to';
        const key = `${recipientType}:${email}`;
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        normalized.push({
            ...recipient,
            recipientType,
            email,
            isActive: recipient.isActive !== false,
        });
    }

    if (!normalized.some(recipient => recipient.recipientType === 'to' && recipient.isPrimary)) {
        const firstTo = normalized.find(recipient => recipient.recipientType === 'to');
        if (firstTo) {
            firstTo.isPrimary = true;
        }
    }

    return normalized;
}

function dedupeEmails(values: string[]): string[] {
    return values
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, all) => all.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index);
}

function configuredBusinessCopyEmails(): string[] {
    return dedupeEmails((process.env.BILLING_INVOICE_CC_EMAILS || '')
        .split(',')
        .map(value => value.trim()));
}

async function resolveInvoiceRecipients(account: CorporateAccount): Promise<{
    to: string[];
    cc: string[];
    bcc: string[];
    businessCopyEmails: string[];
}> {
    const rows = await getCorporateInvoiceRecipients(account.id);
    const to = rows.filter(row => row.recipientType === 'to').map(row => row.email);
    const cc = rows.filter(row => row.recipientType === 'cc').map(row => row.email);
    const bcc = rows.filter(row => row.recipientType === 'bcc').map(row => row.email);

    return {
        to: dedupeEmails(to.length > 0 ? to : [account.billingContactEmail]),
        cc: dedupeEmails(cc),
        bcc: dedupeEmails(bcc),
        businessCopyEmails: configuredBusinessCopyEmails(),
    };
}

async function recordInvoiceSendEvent(params: {
    invoice: Invoice;
    account: CorporateAccount;
    deliveryMode: 'manual' | 'auto' | 'bulk';
    status: 'sent' | 'partial' | 'failed' | 'skipped';
    stripeHostedUrl: string | null;
    recipients: { to: string[]; cc: string[]; bcc: string[]; businessCopyEmails: string[] };
    providerResult: Record<string, unknown>;
    errorMessage: string | null;
    performedBy?: string;
}): Promise<InvoiceSendEvent | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO invoice_send_events (
            invoice_id, corporate_account_id, delivery_mode, send_status,
            stripe_invoice_id, stripe_hosted_url, recipient_to, recipient_cc,
            recipient_bcc, business_copy_emails, provider_result, error_message, performed_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
         RETURNING *`,
        [
            params.invoice.id,
            params.account.id,
            params.deliveryMode,
            params.status,
            params.invoice.stripeInvoiceId,
            params.stripeHostedUrl,
            params.recipients.to,
            params.recipients.cc,
            params.recipients.bcc,
            params.recipients.businessCopyEmails,
            JSON.stringify(params.providerResult),
            params.errorMessage,
            params.performedBy || null,
        ]
    );

    return result.rows[0] ? mapInvoiceSendEventRow(result.rows[0]) : null;
}

function previousCalendarMonthPeriod(asOf: Date): { periodStart: string; periodEnd: string } {
    const year = asOf.getUTCFullYear();
    const month = asOf.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    return {
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd: periodEnd.toISOString().slice(0, 10),
    };
}

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

function mapInvoiceRecipientRow(row: Record<string, unknown>): InvoiceRecipient {
    return {
        id: row.id as string,
        corporateAccountId: row.corporate_account_id as string,
        recipientType: row.recipient_type as InvoiceRecipient['recipientType'],
        name: row.name as string | null,
        email: row.email as string,
        isPrimary: row.is_primary as boolean,
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
        sentAt: row.sent_at ? new Date(row.sent_at as string) : null,
        lastSendStatus: row.last_send_status as string | null,
        lastSendError: row.last_send_error as string | null,
        stripeHostedUrl: row.stripe_hosted_url as string | null,
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    };
}

function mapInvoiceSendEventRow(row: Record<string, unknown>): InvoiceSendEvent {
    return {
        id: row.id as string,
        invoiceId: row.invoice_id as string,
        corporateAccountId: row.corporate_account_id as string,
        deliveryMode: row.delivery_mode as InvoiceSendEvent['deliveryMode'],
        sendStatus: row.send_status as InvoiceSendEvent['sendStatus'],
        stripeInvoiceId: row.stripe_invoice_id as string | null,
        stripeHostedUrl: row.stripe_hosted_url as string | null,
        recipientTo: (row.recipient_to as string[]) || [],
        recipientCc: (row.recipient_cc as string[]) || [],
        recipientBcc: (row.recipient_bcc as string[]) || [],
        businessCopyEmails: (row.business_copy_emails as string[]) || [],
        providerResult: row.provider_result as Record<string, unknown>,
        errorMessage: row.error_message as string | null,
        sentAt: new Date(row.sent_at as string),
        performedBy: row.performed_by as string | null,
    };
}
