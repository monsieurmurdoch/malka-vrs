/**
 * Billing Admin Routes
 *
 * Express router for admin billing endpoints.
 * All routes require admin authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as billingDb from '../../lib/billing-db';
import { getCdrs, getCdrById, getCdrStatusHistory, transitionCdrStatus } from '../cdr-service';
import { getRateTiers, createRateTier, deactivateRateTier } from '../rate-service';
import { generateMonthlyAggregation, formatTrsSubmission, markTrsSubmitted, reconcileTrsPayment } from '../vrs-billing-pipeline';
import {
    bulkGenerateAndSendInvoices,
    createCorporateAccount,
    generateInvoice,
    getCorporateAccount,
    getCorporateAccounts,
    getCorporateBillingSummary,
    getCorporateInvoiceRecipients,
    issueInvoice,
    markInvoicePaid,
    replaceCorporateInvoiceRecipients,
    runDueInvoiceAutomation,
    sendInvoice,
} from '../vri-billing-pipeline';
import { runMonthlyReconciliation, getReconciliationReport, resolveVariance } from '../reconciliation-service';
import { getAuditLog } from '../audit-service';
import { TrsFormatter } from '../formatters/trs-formatter';
import { CsvFormatter } from '../formatters/csv-formatter';
import { JsonFormatter } from '../formatters/json-formatter';
import type { BillingFormatter } from '../formatters/formatter-interface';
import type { CallType, BillingStatus } from '../config';

export const router = Router();

function single(value: unknown): string {
    if (Array.isArray(value)) {
        return value[0] ? String(value[0]) : '';
    }
    return value === undefined || value === null ? '' : String(value);
}

function queryNumber(value: unknown, fallback: number = 0): number {
    const parsed = parseInt(single(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validateBody(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const details: Record<string, string> = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || '_root';
                if (!details[key]) details[key] = issue.message;
            }
            res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details });
            return;
        }
        req.body = result.data;
        next();
    };
}

const text = z.string().min(1).max(500).transform(value => value.replace(/<[^>]*>/g, '').trim());
const optionalText = text.optional();
const dateText = z.string().min(1).max(40);
const emptyBody = z.object({}).passthrough();
const monthPeriodSchema = z.object({
    year: z.coerce.number().int().min(2020).max(2100),
    month: z.coerce.number().int().min(1).max(12)
});
const rateTierSchema = z.object({
    callType: z.enum(['vrs', 'vri']),
    label: text,
    perMinuteRate: z.coerce.number().nonnegative(),
    effectiveFrom: dateText,
    effectiveTo: dateText.optional().nullable(),
    fccOrderRef: optionalText
});
const cdrTransitionSchema = z.object({
    toStatus: text,
    reason: optionalText
});
const trsMarkSubmittedSchema = monthPeriodSchema.extend({
    trsSubmissionId: text
});
const trsReconcileSchema = monthPeriodSchema.extend({
    paymentAmount: z.coerce.number().nonnegative()
});
const corporateAccountSchema = z.object({}).passthrough();
const emailText = z.string().email().max(320).transform(value => value.trim().toLowerCase());
const invoiceRecipientSchema = z.object({
    id: z.string().uuid().optional(),
    recipientType: z.enum(['to', 'cc', 'bcc']),
    name: optionalText,
    email: emailText,
    isPrimary: z.coerce.boolean().optional(),
    isActive: z.coerce.boolean().optional()
});
const invoiceRecipientsSchema = z.object({
    recipients: z.array(invoiceRecipientSchema).max(50)
});
const invoicePeriodSchema = z.object({
    periodStart: dateText,
    periodEnd: dateText
});
const invoiceIssueSchema = z.object({
    send: z.coerce.boolean().optional()
}).passthrough();
const invoiceSendSchema = z.object({
    forceResend: z.coerce.boolean().optional()
}).passthrough();
const invoiceBulkSendSchema = invoicePeriodSchema.extend({
    corporateAccountIds: z.array(z.string().uuid()).min(1).max(250),
    autoGenerate: z.coerce.boolean().optional(),
    issueAndSend: z.coerce.boolean().optional()
});
const invoiceAutoRunSchema = z.object({
    asOfDate: dateText.optional(),
    autoSend: z.coerce.boolean().optional()
}).passthrough();
const invoicePaymentSchema = z.object({
    stripePaymentId: text
});
const reconciliationRunSchema = monthPeriodSchema.extend({
    callType: z.enum(['vrs', 'vri']),
    actualTotal: z.coerce.number().nonnegative()
});
const reconciliationResolveSchema = z.object({
    reason: text
});

// ─── Rate Tiers ────────────────────────────────────────────

/** GET /api/billing/rate-tiers — List rate tiers */
router.get('/rate-tiers', async (_req: Request, res: Response) => {
    try {
        const filters: { callType?: CallType; isActive?: boolean } = {};
        if (_req.query.callType) filters.callType = single(_req.query.callType) as CallType;
        if (_req.query.isActive !== undefined) filters.isActive = single(_req.query.isActive) === 'true';

        const tiers = await getRateTiers(filters);
        res.json(tiers);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch rate tiers' });
    }
});

/** POST /api/billing/rate-tiers — Create a rate tier */
router.post('/rate-tiers', validateBody(rateTierSchema), async (req: Request, res: Response) => {
    try {
        const tier = await createRateTier({
            callType: req.body.callType,
            label: req.body.label,
            perMinuteRate: req.body.perMinuteRate,
            effectiveFrom: req.body.effectiveFrom,
            effectiveTo: req.body.effectiveTo,
            fccOrderRef: req.body.fccOrderRef,
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.status(201).json(tier);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create rate tier' });
    }
});

/** DELETE /api/billing/rate-tiers/:id — Deactivate a rate tier */
router.delete('/rate-tiers/:id', async (req: Request, res: Response) => {
    try {
        await deactivateRateTier(single(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to deactivate rate tier' });
    }
});

// ─── CDRs ──────────────────────────────────────────────────

/** GET /api/billing/cdrs — Query CDRs */
router.get('/cdrs', async (req: Request, res: Response) => {
    try {
        const filters: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (req.query.callType) filters.callType = single(req.query.callType) as CallType;
        if (req.query.billingStatus) filters.billingStatus = single(req.query.billingStatus) as BillingStatus;
        if (req.query.fromDate) filters.fromDate = single(req.query.fromDate);
        if (req.query.toDate) filters.toDate = single(req.query.toDate);
        if (req.query.corporateAccountId) filters.corporateAccountId = single(req.query.corporateAccountId);
        if (req.query.limit) filters.limit = queryNumber(req.query.limit);
        if (req.query.offset) filters.offset = queryNumber(req.query.offset);

        const cdrs = await getCdrs(filters);
        res.json(cdrs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CDRs' });
    }
});

/** GET /api/billing/cdrs/:id — Get CDR detail + status history */
router.get('/cdrs/:id', async (req: Request, res: Response) => {
    try {
        const cdrId = single(req.params.id);
        const cdr = await getCdrById(cdrId);
        if (!cdr) return res.status(404).json({ error: 'CDR not found' });

        const history = await getCdrStatusHistory(cdrId);
        res.json({ cdr, statusHistory: history });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CDR' });
    }
});

/** POST /api/billing/cdrs/:id/transition — Transition CDR status */
router.post('/cdrs/:id/transition', validateBody(cdrTransitionSchema), async (req: Request, res: Response) => {
    try {
        await transitionCdrStatus(
            single(req.params.id),
            req.body.toStatus,
            (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
            req.body.reason
        );
        res.json({ success: true });
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to transition CDR status' });
    }
});

// ─── VRS / TRS Fund ────────────────────────────────────────

/** POST /api/billing/vrs/aggregate — Generate monthly VRS aggregation */
router.post('/vrs/aggregate', validateBody(monthPeriodSchema), async (req: Request, res: Response) => {
    try {
        const { year, month } = req.body;
        const agg = await generateMonthlyAggregation(
            year,
            month,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json(agg);
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate aggregation' });
    }
});

/** GET /api/billing/vrs/export — Export VRS CDRs for TRS submission */
router.get('/vrs/export', async (req: Request, res: Response) => {
    try {
        const year = queryNumber(req.query.year);
        const month = queryNumber(req.query.month);
        const format = single(req.query.format) || 'trs';

        const formatter: BillingFormatter = format === 'csv'
            ? new CsvFormatter()
            : format === 'json'
            ? new JsonFormatter()
            : new TrsFormatter();

        const output = await formatTrsSubmission(year, month, formatter);
        if (!output) return res.status(503).json({ error: 'Billing not configured' });

        res.setHeader('Content-Type', formatter.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="trs-export-${year}-${month}.${formatter.fileExtension}"`);
        res.send(output);
    } catch (err) {
        res.status(500).json({ error: 'Failed to export TRS data' });
    }
});

/** POST /api/billing/vrs/mark-submitted — Mark VRS CDRs as submitted */
router.post('/vrs/mark-submitted', validateBody(trsMarkSubmittedSchema), async (req: Request, res: Response) => {
    try {
        const { year, month, trsSubmissionId } = req.body;
        const count = await markTrsSubmitted(
            year,
            month,
            trsSubmissionId,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json({ success: true, cdrCount: count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark as submitted' });
    }
});

/** POST /api/billing/vrs/reconcile — Reconcile TRS payment */
router.post('/vrs/reconcile', validateBody(trsReconcileSchema), async (req: Request, res: Response) => {
    try {
        const { year, month, paymentAmount } = req.body;
        const result = await reconcileTrsPayment(
            year,
            month,
            paymentAmount,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to reconcile' });
    }
});

// ─── VRI / Corporate ───────────────────────────────────────

/** GET /api/billing/corporate — List corporate accounts */
router.get('/corporate', async (_req: Request, res: Response) => {
    try {
        const accounts = await getCorporateAccounts();
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch corporate accounts' });
    }
});

/** POST /api/billing/corporate — Create corporate account */
router.post('/corporate', validateBody(corporateAccountSchema), async (req: Request, res: Response) => {
    try {
        const account = await createCorporateAccount({
            ...req.body,
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.status(201).json(account);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create corporate account' });
    }
});

/** GET /api/billing/corporate/:id — Get corporate account */
router.get('/corporate/:id', async (req: Request, res: Response) => {
    try {
        const account = await getCorporateAccount(single(req.params.id));
        if (!account) return res.status(404).json({ error: 'Account not found' });
        res.json(account);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch account' });
    }
});

/** GET /api/billing/corporate/:id/invoice-recipients — Get invoice recipients */
router.get('/corporate/:id/invoice-recipients', async (req: Request, res: Response) => {
    try {
        const recipients = await getCorporateInvoiceRecipients(single(req.params.id));
        res.json({ recipients });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch invoice recipients' });
    }
});

/** PUT /api/billing/corporate/:id/invoice-recipients — Replace invoice recipients */
router.put('/corporate/:id/invoice-recipients', validateBody(invoiceRecipientsSchema), async (req: Request, res: Response) => {
    try {
        const recipients = await replaceCorporateInvoiceRecipients(
            single(req.params.id),
            req.body.recipients,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json({ recipients });
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to update invoice recipients' });
    }
});

/** POST /api/billing/corporate/:id/invoices — Generate invoice */
router.post('/corporate/:id/invoices', validateBody(invoicePeriodSchema), async (req: Request, res: Response) => {
    try {
        const invoice = await generateInvoice(
            single(req.params.id),
            req.body.periodStart,
            req.body.periodEnd,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        if (!invoice) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(invoice);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to generate invoice' });
    }
});

/** POST /api/billing/invoices/:id/issue — Issue an invoice */
router.post('/invoices/:id/issue', validateBody(invoiceIssueSchema), async (req: Request, res: Response) => {
    try {
        const invoiceId = single(req.params.id);
        const performedBy = (req as any).user?.id; // eslint-disable-line @typescript-eslint/no-explicit-any
        const invoice = await issueInvoice(invoiceId, performedBy);
        if (req.body.send) {
            const sendResult = await sendInvoice(invoiceId, {
                performedBy,
                deliveryMode: 'manual',
            });
            res.json({ success: sendResult.sent, invoice: sendResult.invoice, sendResult });
            return;
        }
        res.json({ success: true, invoice });
    } catch (err) {
        res.status(500).json({ error: 'Failed to issue invoice' });
    }
});

/** POST /api/billing/invoices/:id/send — Send an issued/draft invoice */
router.post('/invoices/:id/send', validateBody(invoiceSendSchema), async (req: Request, res: Response) => {
    try {
        const result = await sendInvoice(single(req.params.id), {
            performedBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
            deliveryMode: 'manual',
            forceResend: req.body.forceResend,
        });
        res.status(result.status === 'failed' ? 400 : 200).json(result);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(500).json({ error: err.message || 'Failed to send invoice' });
    }
});

/** POST /api/billing/invoices/bulk-send — Generate and send invoices for selected clients */
router.post('/invoices/bulk-send', validateBody(invoiceBulkSendSchema), async (req: Request, res: Response) => {
    try {
        const result = await bulkGenerateAndSendInvoices({
            corporateAccountIds: req.body.corporateAccountIds,
            periodStart: req.body.periodStart,
            periodEnd: req.body.periodEnd,
            autoGenerate: req.body.autoGenerate,
            issueAndSend: req.body.issueAndSend,
            performedBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.json(result);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(500).json({ error: err.message || 'Failed to bulk send invoices' });
    }
});

/** POST /api/billing/invoices/auto-run — Run due invoice automation immediately */
router.post('/invoices/auto-run', validateBody(invoiceAutoRunSchema), async (req: Request, res: Response) => {
    try {
        const result = await runDueInvoiceAutomation({
            asOfDate: req.body.asOfDate,
            autoSend: req.body.autoSend,
            performedBy: (req as any).user?.id || 'admin-auto-run', // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.json(result);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(500).json({ error: err.message || 'Failed to run invoice automation' });
    }
});

/** POST /api/billing/invoices/:id/pay — Mark invoice as paid */
router.post('/invoices/:id/pay', validateBody(invoicePaymentSchema), async (req: Request, res: Response) => {
    try {
        await markInvoicePaid(
            single(req.params.id),
            req.body.stripePaymentId,
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark invoice as paid' });
    }
});

// ─── Reconciliation ────────────────────────────────────────

/** POST /api/billing/reconciliation/run — Run reconciliation */
router.post('/reconciliation/run', validateBody(reconciliationRunSchema), async (req: Request, res: Response) => {
    try {
        const { year, month, callType, actualTotal } = req.body;
        const record = await runMonthlyReconciliation(year, month, callType, actualTotal);
        res.json(record);
    } catch (err) {
        res.status(500).json({ error: 'Failed to run reconciliation' });
    }
});

/** GET /api/billing/reconciliation — Get reconciliation report */
router.get('/reconciliation', async (req: Request, res: Response) => {
    try {
        const year = queryNumber(req.query.year);
        const month = queryNumber(req.query.month);
        const report = await getReconciliationReport(year, month);
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reconciliation' });
    }
});

/** POST /api/billing/reconciliation/:id/resolve — Resolve variance */
router.post('/reconciliation/:id/resolve', validateBody(reconciliationResolveSchema), async (req: Request, res: Response) => {
    try {
        await resolveVariance(
            single(req.params.id),
            req.body.reason,
            (req as any).user?.id || 'system' // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to resolve variance' });
    }
});

// ─── Audit Log ─────────────────────────────────────────────

/** GET /api/billing/audit — Query audit log */
router.get('/audit', async (req: Request, res: Response) => {
    try {
        const filters: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (req.query.action) filters.action = single(req.query.action);
        if (req.query.entityType) filters.entityType = single(req.query.entityType);
        if (req.query.fromDate) filters.fromDate = single(req.query.fromDate);
        if (req.query.toDate) filters.toDate = single(req.query.toDate);
        if (req.query.limit) filters.limit = queryNumber(req.query.limit);

        const entries = await getAuditLog(filters);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});

// ─── Billing Status ────────────────────────────────────────

/** GET /api/billing/status — Billing subsystem status */
router.get('/status', (_req: Request, res: Response) => {
    res.json({
        enabled: billingDb.isBillingDbReady(),
        postgres: billingDb.isBillingDbReady() ? 'connected' : 'not configured',
    });
});
