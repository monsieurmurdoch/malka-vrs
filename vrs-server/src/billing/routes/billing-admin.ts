/**
 * Billing Admin Routes
 *
 * Express router for admin billing endpoints.
 * All routes require admin authentication.
 */

import { Router, Request, Response } from 'express';
import * as billingDb from '../../lib/billing-db';
import { getCdrs, getCdrById, getCdrStatusHistory, transitionCdrStatus } from '../cdr-service';
import { getRateTiers, createRateTier, deactivateRateTier } from '../rate-service';
import { generateMonthlyAggregation, formatTrsSubmission, markTrsSubmitted, reconcileTrsPayment } from '../vrs-billing-pipeline';
import { getCorporateAccounts, getCorporateAccount, createCorporateAccount, generateInvoice, issueInvoice, markInvoicePaid, getCorporateBillingSummary } from '../vri-billing-pipeline';
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
