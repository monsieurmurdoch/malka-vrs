/**
 * Stripe webhook service
 *
 * Verifies and records Stripe events, then maps payment lifecycle events onto
 * internal invoice/CDR status without mutating immutable CDR rows.
 */

import crypto from 'crypto';
import * as billingDb from '../lib/billing-db';
import { logBillingEvent } from './audit-service';
import { createStripeProvider } from './stripe/stripe-factory';
import type { WebhookEvent } from './stripe/stripe-interface';
import { markInvoicePaid } from './vri-billing-pipeline';

export interface StripeWebhookResult {
    processed: boolean;
    duplicate?: boolean;
    eventId?: string;
    eventType?: string;
    reason?: string;
}

function normalizePayload(payload: string | Buffer): string {
    return Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
}

function eventObject(event: WebhookEvent): Record<string, unknown> {
    return event.data || {};
}

function eventObjectString(event: WebhookEvent, key: string): string | null {
    const value = eventObject(event)[key];
    return typeof value === 'string' && value.trim() ? value : null;
}

function fallbackEventId(event: WebhookEvent, rawPayload: string): string {
    const objectId = eventObjectString(event, 'id') || 'unknown';
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex').slice(0, 24);
    return `${event.type}:${objectId}:${hash}`;
}

async function recordWebhookEvent(eventId: string, event: WebhookEvent): Promise<boolean> {
    const result = await billingDb.query(
        `INSERT INTO stripe_webhook_events (
            stripe_event_id, event_type, livemode, payload, processing_status
        ) VALUES ($1, $2, $3, $4, 'received')
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id`,
        [
            eventId,
            event.type,
            Boolean(event.livemode),
            JSON.stringify({ id: event.id || null, type: event.type, data: event.data }),
        ]
    );

    return result.rows.length > 0;
}

async function markWebhookStatus(
    eventId: string,
    status: 'processed' | 'failed' | 'ignored',
    error?: string
): Promise<void> {
    await billingDb.query(
        `UPDATE stripe_webhook_events
         SET processing_status = $2,
             processing_error = $3,
             processed_at = NOW()
         WHERE stripe_event_id = $1`,
        [eventId, status, error || null]
    );
}

async function getInvoiceIdByStripeInvoiceId(stripeInvoiceId: string): Promise<string | null> {
    const result = await billingDb.query(
        'SELECT id FROM invoices WHERE stripe_invoice_id = $1 LIMIT 1',
        [stripeInvoiceId]
    );
    return result.rows[0]?.id || null;
}

async function updateInvoiceFromStripeEvent(event: WebhookEvent, status: string): Promise<string | null> {
    const stripeInvoiceId = eventObjectString(event, 'id');
    if (!stripeInvoiceId) return null;

    const hostedUrl = eventObjectString(event, 'hosted_invoice_url');
    const pdfUrl = eventObjectString(event, 'invoice_pdf');
    const result = await billingDb.query(
        `UPDATE invoices
         SET status = $2,
             stripe_hosted_invoice_url = COALESCE($3, stripe_hosted_invoice_url),
             stripe_invoice_pdf_url = COALESCE($4, stripe_invoice_pdf_url)
         WHERE stripe_invoice_id = $1
         RETURNING id`,
        [stripeInvoiceId, status, hostedUrl, pdfUrl]
    );

    return result.rows[0]?.id || null;
}

async function recordPayment(event: WebhookEvent, status: string): Promise<void> {
    const stripeInvoiceId = eventObjectString(event, 'id');
    if (!stripeInvoiceId) return;

    const invoiceId = await getInvoiceIdByStripeInvoiceId(stripeInvoiceId);
    if (!invoiceId) return;

    const amountPaid = Number(eventObject(event).amount_paid || eventObject(event).amount_due || 0) / 100;
    const currency = String(eventObject(event).currency || 'usd').toUpperCase();
    const paymentId = eventObjectString(event, 'payment_intent')
        || eventObjectString(event, 'charge')
        || eventObjectString(event, 'id');

    await billingDb.query(
        `INSERT INTO billing_payments (
            invoice_id, provider, provider_payment_id, amount, currency, status,
            received_at, metadata
        ) VALUES ($1, 'stripe', $2, $3, $4, $5, NOW(), $6)`,
        [
            invoiceId,
            paymentId,
            amountPaid,
            currency,
            status,
            JSON.stringify({ stripeInvoiceId, eventType: event.type }),
        ]
    );
}

async function applyStripeEvent(event: WebhookEvent): Promise<void> {
    const stripeInvoiceId = eventObjectString(event, 'id');

    switch (event.type) {
        case 'invoice.paid': {
            if (!stripeInvoiceId) return;
            const invoiceId = await getInvoiceIdByStripeInvoiceId(stripeInvoiceId);
            if (!invoiceId) return;

            await markInvoicePaid(
                invoiceId,
                eventObjectString(event, 'payment_intent') || eventObjectString(event, 'charge') || stripeInvoiceId,
                'stripe:webhook'
            );
            await recordPayment(event, 'succeeded');
            return;
        }

        case 'invoice.payment_failed':
            await recordPayment(event, 'failed');
            await logBillingEvent('stripe_payment_failed', 'invoice', stripeInvoiceId, {
                eventType: event.type,
                stripeInvoiceId,
            }, 'stripe:webhook');
            return;

        case 'invoice.finalized': {
            const invoiceId = await updateInvoiceFromStripeEvent(event, 'issued');
            await logBillingEvent('stripe_invoice_finalized', 'invoice', invoiceId || stripeInvoiceId, {
                stripeInvoiceId,
            }, 'stripe:webhook');
            return;
        }

        case 'invoice.voided': {
            const invoiceId = await updateInvoiceFromStripeEvent(event, 'cancelled');
            await logBillingEvent('stripe_invoice_voided', 'invoice', invoiceId || stripeInvoiceId, {
                stripeInvoiceId,
            }, 'stripe:webhook');
            return;
        }

        case 'invoice.marked_uncollectible': {
            const invoiceId = await updateInvoiceFromStripeEvent(event, 'overdue');
            await logBillingEvent('stripe_invoice_uncollectible', 'invoice', invoiceId || stripeInvoiceId, {
                stripeInvoiceId,
            }, 'stripe:webhook');
            return;
        }

        default:
            await logBillingEvent('stripe_event_ignored', 'stripe_event', event.id || null, {
                eventType: event.type,
            }, 'stripe:webhook');
    }
}

export async function handleStripeWebhook(
    payload: string | Buffer,
    signature: string
): Promise<StripeWebhookResult> {
    if (!billingDb.isBillingDbReady()) {
        return { processed: false, reason: 'billing_not_configured' };
    }

    const rawPayload = normalizePayload(payload);
    const provider = createStripeProvider();
    const event = await provider.verifyWebhookSignature(rawPayload, signature);
    const eventId = event.id || fallbackEventId(event, rawPayload);
    const inserted = await recordWebhookEvent(eventId, event);

    if (!inserted) {
        return { processed: true, duplicate: true, eventId, eventType: event.type };
    }

    try {
        await applyStripeEvent(event);
        await markWebhookStatus(eventId, 'processed');
        return { processed: true, eventId, eventType: event.type };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markWebhookStatus(eventId, 'failed', message);
        throw err;
    }
}
