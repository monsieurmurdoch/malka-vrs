/**
 * Live Stripe Provider
 *
 * Wraps the Stripe SDK for production use.
 * Requires BILLING_STRIPE_SECRET_KEY to be set.
 */

import type { StripeProvider, StripeCustomer, StripeInvoice, StripePaymentResult, WebhookEvent } from './stripe-interface';

export class LiveStripeProvider implements StripeProvider {
    private stripe: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    constructor(secretKey: string) {
        // Dynamic import to avoid requiring stripe package in dev/test
        try {
            const Stripe = require('stripe');
            this.stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });
        } catch (err) {
            throw new Error(
                'Stripe SDK not installed. Run: npm install stripe. ' +
                'Or set BILLING_STRIPE_MODE=mock for development.'
            );
        }
    }

    async createCustomer(params: {
        name: string;
        email: string;
        metadata?: Record<string, string>;
    }): Promise<StripeCustomer> {
        const customer = await this.stripe.customers.create({
            name: params.name,
            email: params.email,
            metadata: params.metadata,
        });
        return { id: customer.id, name: params.name, email: params.email };
    }

    async createInvoice(params: {
        customerId: string;
        items: { description: string; quantity: number; unitAmount: number; total: number }[];
        currency?: string;
        dueDate?: Date;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice> {
        // Create invoice items first
        for (const item of params.items) {
            await this.stripe.invoiceItems.create({
                customer: params.customerId,
                description: item.description,
                quantity: item.quantity,
                unit_amount: item.unitAmount,
                currency: params.currency || 'usd',
            });
        }

        // Create the invoice
        const invoice = await this.stripe.invoices.create({
            customer: params.customerId,
            collection_method: 'send_invoice',
            due_date: params.dueDate ? Math.floor(params.dueDate.getTime() / 1000) : undefined,
            metadata: params.metadata,
        });

        return {
            id: invoice.id,
            customerId: params.customerId,
            status: invoice.status,
            total: invoice.total,
            hostedUrl: invoice.hosted_invoice_url || undefined,
            pdfUrl: invoice.invoice_pdf || undefined,
        };
    }

    async getInvoice(invoiceId: string): Promise<StripeInvoice | null> {
        try {
            const invoice = await this.stripe.invoices.retrieve(invoiceId);
            return {
                id: invoice.id,
                customerId: invoice.customer as string,
                status: invoice.status,
                total: invoice.total,
                hostedUrl: invoice.hosted_invoice_url || undefined,
                pdfUrl: invoice.invoice_pdf || undefined,
                paidAt: invoice.status_transitions?.paid_at
                    ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                    : undefined,
            };
        } catch {
            return null;
        }
    }

    async createPaymentIntent(params: {
        amount: number;
        currency: string;
        customerId: string;
        metadata?: Record<string, string>;
    }): Promise<StripePaymentResult> {
        const intent = await this.stripe.paymentIntents.create({
            amount: params.amount,
            currency: params.currency,
            customer: params.customerId,
            metadata: params.metadata,
        });
        return {
            id: intent.id,
            status: intent.status,
            clientSecret: intent.client_secret || undefined,
        };
    }

    async verifyWebhookSignature(payload: string, signature: string): Promise<WebhookEvent> {
        const event = this.stripe.webhooks.constructEvent(
            payload,
            signature,
            process.env.BILLING_STRIPE_WEBHOOK_SECRET || ''
        );
        return {
            id: event.id,
            livemode: Boolean(event.livemode),
            type: event.type,
            data: event.data.object as Record<string, unknown>,
        };
    }
}
