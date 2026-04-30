/**
 * Billing Admin Routes
 *
 * Express router for admin billing endpoints.
 * All routes require admin authentication.
 */

import { Router, Request, Response } from 'express';
import * as billingDb from '../../lib/billing-db';
import { getCdrs, getCdrById, getCdrStatusHistory, transitionCdrStatus } from '../cdr-service';
import {
    createRateTier,
    createVriRateOverride,
    deactivateRateTier,
    getRateTiers,
    listBillingRateTemplates,
    listVriRateOverrides,
} from '../rate-service';
import { generateMonthlyAggregation, formatTrsSubmission, markTrsSubmitted, reconcileTrsPayment } from '../vrs-billing-pipeline';
import {
    createCorporateAccount,
    createCorporatePaymentMethodSetup,
    createCorporatePortalSession,
    createInvoiceCreditNote,
    generateInvoice,
    getAdminBillingDashboard,
    getCorporateAccount,
    getCorporateAccounts,
    getCorporateBillingSummary,
    getCorporateUsageCsv,
    getCorporateUsageSummary,
    issueInvoice,
    markInvoicePaid,
    recordInvoicePayment,
} from '../vri-billing-pipeline';
import {
    createManagerNote,
    createContractorInvoice,
    createPayRate,
    createPayoutBatch,
    createScheduleWindow,
    approvePayoutBatch,
    exportPayoutBatchCsv,
    generatePayablesForPeriod,
    generateWeeklyUtilizationSummary,
    getVendorProfile,
    listContractorInvoices,
    listManagerNotes,
    listPayables,
    listPayRates,
    listPayoutBatches,
    markPayoutBatchPaid,
    listScheduleWindows,
    listUtilizationSummaries,
    recordAvailabilitySession,
    recordBreakSession,
    upsertVendorProfile,
} from '../interpreter-operations-service';
import {
    runMonthlyReconciliation,
    getReconciliationReport,
    resolveVariance,
    getBillingReconciliationDashboard,
} from '../reconciliation-service';
import { getAuditLog } from '../audit-service';
import { replayStripeWebhookEvent } from '../stripe-webhook-service';
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
router.post('/rate-tiers', async (req: Request, res: Response) => {
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

/** GET /api/billing/rate-templates — Future service/language billing templates */
router.get('/rate-templates', async (req: Request, res: Response) => {
    try {
        const templates = await listBillingRateTemplates({
            serviceMode: req.query.serviceMode ? single(req.query.serviceMode) : undefined,
            currency: req.query.currency ? single(req.query.currency) : undefined,
        });
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch rate templates' });
    }
});

/** GET /api/billing/vri-rate-overrides — List VRI rate overrides */
router.get('/vri-rate-overrides', async (req: Request, res: Response) => {
    try {
        const overrides = await listVriRateOverrides({
            corporateAccountId: req.query.corporateAccountId ? single(req.query.corporateAccountId) : undefined,
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            currency: req.query.currency ? single(req.query.currency) : undefined,
            isActive: req.query.isActive !== undefined ? single(req.query.isActive) === 'true' : undefined,
        });
        res.json(overrides);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch VRI rate overrides' });
    }
});

/** POST /api/billing/vri-rate-overrides — Create VRI rate override */
router.post('/vri-rate-overrides', async (req: Request, res: Response) => {
    try {
        const override = await createVriRateOverride({
            ...req.body,
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!override) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(override);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create VRI rate override' });
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
router.post('/cdrs/:id/transition', async (req: Request, res: Response) => {
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
router.post('/vrs/aggregate', async (req: Request, res: Response) => {
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
router.post('/vrs/mark-submitted', async (req: Request, res: Response) => {
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
router.post('/vrs/reconcile', async (req: Request, res: Response) => {
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
router.post('/corporate', async (req: Request, res: Response) => {
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

/** POST /api/billing/corporate/:id/invoices — Generate invoice */
router.post('/corporate/:id/invoices', async (req: Request, res: Response) => {
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

/** GET /api/billing/corporate/:id/usage — Corporate usage summary or CSV */
router.get('/corporate/:id/usage', async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const periodEnd = req.query.periodEnd
            ? single(req.query.periodEnd)
            : now.toISOString().slice(0, 10);
        const periodStart = req.query.periodStart
            ? single(req.query.periodStart)
            : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

        if (single(req.query.format) === 'csv') {
            const csv = await getCorporateUsageCsv(single(req.params.id), periodStart, periodEnd);
            if (!csv) return res.status(503).json({ error: 'Billing not configured' });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="vri-usage-${single(req.params.id)}.csv"`);
            return res.send(csv);
        }

        const summary = await getCorporateUsageSummary(single(req.params.id), periodStart, periodEnd);
        if (!summary) return res.status(404).json({ error: 'Usage not found' });
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch corporate usage' });
    }
});

/** POST /api/billing/corporate/:id/portal-session — Stripe billing portal session */
router.post('/corporate/:id/portal-session', async (req: Request, res: Response) => {
    try {
        const session = await createCorporatePortalSession({
            corporateAccountId: single(req.params.id),
            returnUrl: req.body.returnUrl,
        });
        if (!session) return res.status(503).json({ error: 'Billing not configured' });
        res.json(session);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create portal session' });
    }
});

/** POST /api/billing/corporate/:id/payment-method-setup — Stripe setup intent */
router.post('/corporate/:id/payment-method-setup', async (req: Request, res: Response) => {
    try {
        const setup = await createCorporatePaymentMethodSetup({
            corporateAccountId: single(req.params.id),
            usage: req.body.usage,
        });
        if (!setup) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(setup);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create payment method setup' });
    }
});

/** POST /api/billing/invoices/:id/issue — Issue an invoice */
router.post('/invoices/:id/issue', async (req: Request, res: Response) => {
    try {
        await issueInvoice(
            single(req.params.id),
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to issue invoice' });
    }
});

/** POST /api/billing/invoices/:id/credit-notes — Create credit note/adjustment */
router.post('/invoices/:id/credit-notes', async (req: Request, res: Response) => {
    try {
        const note = await createInvoiceCreditNote({
            invoiceId: single(req.params.id),
            amount: Number(req.body.amount),
            reason: req.body.reason || 'billing_adjustment',
            metadata: req.body.metadata || {},
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!note) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(note);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create credit note' });
    }
});

/** POST /api/billing/invoices/:id/pay — Mark invoice as paid */
router.post('/invoices/:id/pay', async (req: Request, res: Response) => {
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

/** POST /api/billing/invoices/:id/payments — Record manual/offline invoice payment */
router.post('/invoices/:id/payments', async (req: Request, res: Response) => {
    try {
        await recordInvoicePayment({
            invoiceId: single(req.params.id),
            amount: Number(req.body.amount),
            currency: req.body.currency,
            provider: req.body.provider || 'manual',
            providerPaymentId: req.body.providerPaymentId,
            status: req.body.status || 'succeeded',
            metadata: req.body.metadata || {},
            performedBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to record invoice payment' });
    }
});

/** GET /api/billing/admin-dashboard — Admin billing dashboard summary */
router.get('/admin-dashboard', async (_req: Request, res: Response) => {
    try {
        const dashboard = await getAdminBillingDashboard();
        if (!dashboard) return res.status(503).json({ error: 'Billing not configured' });
        res.json(dashboard);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch admin billing dashboard' });
    }
});

// ─── Interpreter Operations ────────────────────────────────

/** GET /api/billing/interpreter-utilization — Weekly interpreter utilization summaries */
router.get('/interpreter-utilization', async (req: Request, res: Response) => {
    try {
        const summaries = await listUtilizationSummaries({
            interpreterId: req.query.interpreterId ? single(req.query.interpreterId) : undefined,
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            weekStart: req.query.weekStart ? single(req.query.weekStart) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(summaries);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch interpreter utilization' });
    }
});

/** POST /api/billing/interpreter-utilization/generate — Generate weekly utilization summary */
router.post('/interpreter-utilization/generate', async (req: Request, res: Response) => {
    try {
        const summary = await generateWeeklyUtilizationSummary({
            interpreterId: req.body.interpreterId,
            tenantId: req.body.tenantId,
            weekStart: req.body.weekStart,
        });
        if (!summary) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(summary);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to generate utilization summary' });
    }
});

/** POST /api/billing/interpreters/payables/generate — Generate draft interpreter payables from CDRs */
router.post('/interpreters/payables/generate', async (req: Request, res: Response) => {
    try {
        const result = await generatePayablesForPeriod({
            periodStart: req.body.periodStart,
            periodEnd: req.body.periodEnd,
            tenantId: req.body.tenantId,
            interpreterId: req.body.interpreterId,
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        res.json(result);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to generate interpreter payables' });
    }
});

/** GET /api/billing/interpreter-payout-batches — List payout batches */
router.get('/interpreter-payout-batches', async (req: Request, res: Response) => {
    try {
        const batches = await listPayoutBatches({
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            status: req.query.status ? single(req.query.status) : undefined,
            periodStart: req.query.periodStart ? single(req.query.periodStart) : undefined,
            periodEnd: req.query.periodEnd ? single(req.query.periodEnd) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(batches);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch payout batches' });
    }
});

/** POST /api/billing/interpreter-payout-batches — Create payout batch */
router.post('/interpreter-payout-batches', async (req: Request, res: Response) => {
    try {
        const batch = await createPayoutBatch({
            periodStart: req.body.periodStart,
            periodEnd: req.body.periodEnd,
            tenantId: req.body.tenantId,
            currency: req.body.currency,
            metadata: req.body.metadata || {},
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!batch) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(batch);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create payout batch' });
    }
});

/** POST /api/billing/interpreter-payout-batches/:id/approve — Approve payout batch */
router.post('/interpreter-payout-batches/:id/approve', async (req: Request, res: Response) => {
    try {
        const batch = await approvePayoutBatch(
            single(req.params.id),
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        if (!batch) return res.status(404).json({ error: 'Payout batch not found' });
        res.json(batch);
    } catch (err) {
        res.status(500).json({ error: 'Failed to approve payout batch' });
    }
});

/** POST /api/billing/interpreter-payout-batches/:id/pay — Mark payout batch paid */
router.post('/interpreter-payout-batches/:id/pay', async (req: Request, res: Response) => {
    try {
        const batch = await markPayoutBatchPaid(
            single(req.params.id),
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        if (!batch) return res.status(404).json({ error: 'Payout batch not found' });
        res.json(batch);
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark payout batch paid' });
    }
});

/** GET /api/billing/interpreter-payout-batches/:id/export — Export payout CSV */
router.get('/interpreter-payout-batches/:id/export', async (req: Request, res: Response) => {
    try {
        const csv = await exportPayoutBatchCsv(
            single(req.params.id),
            (req as any).user?.id // eslint-disable-line @typescript-eslint/no-explicit-any
        );
        if (!csv) return res.status(503).json({ error: 'Billing not configured' });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="payout-${single(req.params.id)}.csv"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Failed to export payout batch' });
    }
});

/** GET /api/billing/interpreters/:id/schedule-windows — Interpreter schedule windows */
router.get('/interpreters/:id/schedule-windows', async (req: Request, res: Response) => {
    try {
        const windows = await listScheduleWindows({
            interpreterId: single(req.params.id),
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            fromDate: req.query.fromDate ? single(req.query.fromDate) : undefined,
            toDate: req.query.toDate ? single(req.query.toDate) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(windows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schedule windows' });
    }
});

/** POST /api/billing/interpreters/:id/schedule-windows — Create interpreter schedule window */
router.post('/interpreters/:id/schedule-windows', async (req: Request, res: Response) => {
    try {
        const window = await createScheduleWindow({
            ...req.body,
            interpreterId: single(req.params.id),
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!window) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(window);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create schedule window' });
    }
});

/** POST /api/billing/interpreters/:id/availability-sessions — Record availability/busy/offline time */
router.post('/interpreters/:id/availability-sessions', async (req: Request, res: Response) => {
    try {
        const session = await recordAvailabilitySession({
            ...req.body,
            interpreterId: single(req.params.id),
        });
        if (!session) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(session);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to record availability session' });
    }
});

/** POST /api/billing/interpreters/:id/break-sessions — Record interpreter break time */
router.post('/interpreters/:id/break-sessions', async (req: Request, res: Response) => {
    try {
        const session = await recordBreakSession({
            ...req.body,
            interpreterId: single(req.params.id),
        });
        if (!session) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(session);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to record break session' });
    }
});

/** GET /api/billing/interpreters/:id/payables — Interpreter payables */
router.get('/interpreters/:id/payables', async (req: Request, res: Response) => {
    try {
        const payables = await listPayables({
            interpreterId: single(req.params.id),
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            status: req.query.status ? single(req.query.status) : undefined,
            periodStart: req.query.periodStart ? single(req.query.periodStart) : undefined,
            periodEnd: req.query.periodEnd ? single(req.query.periodEnd) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(payables);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch interpreter payables' });
    }
});

/** GET /api/billing/interpreters/:id/vendor-profile — Interpreter vendor/payment profile */
router.get('/interpreters/:id/vendor-profile', async (req: Request, res: Response) => {
    try {
        const profile = await getVendorProfile(single(req.params.id));
        if (!profile) return res.status(404).json({ error: 'Vendor profile not found' });
        res.json(profile);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vendor profile' });
    }
});

/** PUT /api/billing/interpreters/:id/vendor-profile — Upsert interpreter vendor/payment profile */
router.put('/interpreters/:id/vendor-profile', async (req: Request, res: Response) => {
    try {
        const profile = await upsertVendorProfile({
            ...req.body,
            interpreterId: single(req.params.id),
        });
        if (!profile) return res.status(503).json({ error: 'Billing not configured' });
        res.json(profile);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to upsert vendor profile' });
    }
});

/** GET /api/billing/interpreters/:id/pay-rates — Interpreter pay rates */
router.get('/interpreters/:id/pay-rates', async (req: Request, res: Response) => {
    try {
        const rates = await listPayRates(single(req.params.id));
        res.json(rates);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch interpreter pay rates' });
    }
});

/** POST /api/billing/interpreters/:id/pay-rates — Create interpreter pay rate */
router.post('/interpreters/:id/pay-rates', async (req: Request, res: Response) => {
    try {
        const rate = await createPayRate({
            ...req.body,
            interpreterId: single(req.params.id),
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!rate) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(rate);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create interpreter pay rate' });
    }
});

/** GET /api/billing/interpreters/:id/contractor-invoices — Contractor invoices */
router.get('/interpreters/:id/contractor-invoices', async (req: Request, res: Response) => {
    try {
        const invoices = await listContractorInvoices({
            interpreterId: single(req.params.id),
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            status: req.query.status ? single(req.query.status) : undefined,
            periodStart: req.query.periodStart ? single(req.query.periodStart) : undefined,
            periodEnd: req.query.periodEnd ? single(req.query.periodEnd) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch contractor invoices' });
    }
});

/** POST /api/billing/interpreters/:id/contractor-invoices — Generate contractor invoice */
router.post('/interpreters/:id/contractor-invoices', async (req: Request, res: Response) => {
    try {
        const invoice = await createContractorInvoice({
            interpreterId: single(req.params.id),
            periodStart: req.body.periodStart,
            periodEnd: req.body.periodEnd,
            tenantId: req.body.tenantId,
            currency: req.body.currency,
            metadata: req.body.metadata || {},
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!invoice) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(invoice);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create contractor invoice' });
    }
});

/** GET /api/billing/manager-notes/:entityType/:entityId — Admin manager notes */
router.get('/manager-notes/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
        const notes = await listManagerNotes({
            entityType: single(req.params.entityType),
            entityId: single(req.params.entityId),
            tenantId: req.query.tenantId ? single(req.query.tenantId) : undefined,
            limit: req.query.limit ? queryNumber(req.query.limit, 100) : undefined,
        });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch manager notes' });
    }
});

/** POST /api/billing/manager-notes/:entityType/:entityId — Create admin manager note */
router.post('/manager-notes/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
        const note = await createManagerNote({
            ...req.body,
            entityType: single(req.params.entityType),
            entityId: single(req.params.entityId),
            createdBy: (req as any).user?.id, // eslint-disable-line @typescript-eslint/no-explicit-any
        });
        if (!note) return res.status(503).json({ error: 'Billing not configured' });
        res.status(201).json(note);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to create manager note' });
    }
});

// ─── Reconciliation ────────────────────────────────────────

/** POST /api/billing/reconciliation/run — Run reconciliation */
router.post('/reconciliation/run', async (req: Request, res: Response) => {
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

/** GET /api/billing/reconciliation-dashboard — Live reconciliation dashboard */
router.get('/reconciliation-dashboard', async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const periodEnd = req.query.periodEnd
            ? single(req.query.periodEnd)
            : now.toISOString();
        const periodStart = req.query.periodStart
            ? single(req.query.periodStart)
            : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
        const dashboard = await getBillingReconciliationDashboard({ periodStart, periodEnd });
        if (!dashboard) return res.status(503).json({ error: 'Billing not configured' });
        res.json(dashboard);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reconciliation dashboard' });
    }
});

/** POST /api/billing/reconciliation/:id/resolve — Resolve variance */
router.post('/reconciliation/:id/resolve', async (req: Request, res: Response) => {
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

/** POST /api/billing/webhooks/stripe/:eventId/replay — Replay recorded Stripe webhook */
router.post('/webhooks/stripe/:eventId/replay', async (req: Request, res: Response) => {
    try {
        const result = await replayStripeWebhookEvent(single(req.params.eventId));
        if (!result.processed) return res.status(404).json(result);
        res.json(result);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        res.status(400).json({ error: err.message || 'Failed to replay Stripe webhook' });
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
