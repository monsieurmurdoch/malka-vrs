/**
 * Corporate Billing Dashboard Routes
 *
 * Express router for corporate client billing dashboard.
 * Requires corporate account authentication.
 */

import { Router, Request, Response } from 'express';
import * as billingDb from '../../lib/billing-db';
import { getCdrs } from '../cdr-service';
import {
    getCorporateAccount,
    getCorporateBillingSummary,
    getCorporateUsageCsv,
    getCorporateUsageSummary,
} from '../vri-billing-pipeline';

export const router = Router();

function single(value: unknown): string {
    if (Array.isArray(value)) {
        return value[0] ? String(value[0]) : '';
    }
    return value === undefined || value === null ? '' : String(value);
}

function queryNumber(value: unknown, fallback: number): number {
    const parsed = parseInt(single(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// ─── Dashboard ─────────────────────────────────────────────

/** GET /api/billing/dashboard/:accountId — Corporate billing summary */
router.get('/dashboard/:accountId', async (req: Request, res: Response) => {
    try {
        if (!billingDb.isBillingDbReady()) {
            return res.status(503).json({ error: 'Billing not configured' });
        }

        const summary = await getCorporateBillingSummary(single(req.params.accountId));
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch billing summary' });
    }
});

/** GET /api/billing/dashboard/:accountId/cdrs — Corporate CDR history */
router.get('/dashboard/:accountId/cdrs', async (req: Request, res: Response) => {
    try {
        if (!billingDb.isBillingDbReady()) {
            return res.status(503).json({ error: 'Billing not configured' });
        }

        const limit = queryNumber(req.query.limit, 50);
        const offset = queryNumber(req.query.offset, 0);

        const cdrs = await getCdrs({
            corporateAccountId: single(req.params.accountId),
            callType: 'vri',
            limit,
            offset,
        });
        res.json(cdrs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch CDRs' });
    }
});

/** GET /api/billing/dashboard/:accountId/usage — Corporate usage summary / CSV */
router.get('/dashboard/:accountId/usage', async (req: Request, res: Response) => {
    try {
        if (!billingDb.isBillingDbReady()) {
            return res.status(503).json({ error: 'Billing not configured' });
        }

        const now = new Date();
        const periodStart = req.query.periodStart
            ? single(req.query.periodStart)
            : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
        const periodEnd = req.query.periodEnd
            ? single(req.query.periodEnd)
            : now.toISOString().slice(0, 10);

        if (single(req.query.format) === 'csv') {
            const csv = await getCorporateUsageCsv(single(req.params.accountId), periodStart, periodEnd);
            if (!csv) return res.status(404).json({ error: 'Usage not found' });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="vri-usage-${single(req.params.accountId)}.csv"`);
            return res.send(csv);
        }

        const summary = await getCorporateUsageSummary(single(req.params.accountId), periodStart, periodEnd);
        if (!summary) return res.status(404).json({ error: 'Usage not found' });
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch usage summary' });
    }
});

/** GET /api/billing/dashboard/:accountId/profile — Corporate account profile */
router.get('/dashboard/:accountId/profile', async (req: Request, res: Response) => {
    try {
        if (!billingDb.isBillingDbReady()) {
            return res.status(503).json({ error: 'Billing not configured' });
        }

        const account = await getCorporateAccount(single(req.params.accountId));
        if (!account) return res.status(404).json({ error: 'Account not found' });

        // Don't expose sensitive fields
        res.json({
            id: account.id,
            tenantId: account.tenantId,
            organizationName: account.organizationName,
            billingContactName: account.billingContactName,
            billingContactEmail: account.billingContactEmail,
            contractType: account.contractType,
            billingDay: account.billingDay,
            country: account.country,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch account' });
    }
});
