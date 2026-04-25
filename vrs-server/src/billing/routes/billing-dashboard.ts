/**
 * Corporate Billing Dashboard Routes
 *
 * Express router for corporate client billing dashboard.
 * Requires corporate account authentication.
 */

import { Router, Request, Response } from 'express';
import * as billingDb from '../../lib/billing-db';
import { getCdrs } from '../cdr-service';
import { getCorporateBillingSummary, getCorporateAccount } from '../vri-billing-pipeline';

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
