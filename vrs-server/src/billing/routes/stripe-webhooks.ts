/**
 * Stripe webhook routes.
 *
 * Mounted before express.json() so Stripe signature verification receives the
 * exact raw request body.
 */

import express, { Request, Response } from 'express';
import { handleStripeWebhook } from '../stripe-webhook-service';

export const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
        const signature = req.header('stripe-signature') || '';
        const result = await handleStripeWebhook(req.body, signature);
        if (!result.processed && result.reason === 'billing_not_configured') {
            return res.status(503).json(result);
        }
        res.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Stripe webhook processing failed';
        res.status(400).json({ error: message });
    }
});
