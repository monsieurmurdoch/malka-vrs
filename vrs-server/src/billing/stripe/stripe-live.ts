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
            this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
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
                currency: 'usd',
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
        };
    }

    async sendInvoice(params: {
        invoiceId: string;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice> {
        let invoice = await this.stripe.invoices.retrieve(params.invoiceId);

        if (invoice.status === 'draft') {
            if (params.metadata && Object.keys(params.metadata).length > 0) {
                await this.stripe.invoices.update(params.invoiceId, {
                    metadata: {
                        ...(invoice.metadata || {}),
                        ...params.metadata,
                    },
                });
            }

            invoice = await this.stripe.invoices.finalizeInvoice(params.invoiceId);
        }

        const sent = await this.stripe.invoices.sendInvoice(params.invoiceId);

        return {
            id: sent.id,
            customerId: sent.customer as string,
            status: sent.status,
            total: sent.total,
            hostedUrl: sent.hosted_invoice_url || undefined,
            sentAt: new Date().toISOString(),
            paidAt: sent.status_transitions?.paid_at
                ? new Date(sent.status_transitions.paid_at * 1000).toISOString()
                : undefined,
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
            type: event.type,
            data: event.data.object as Record<string, unknown>,
        };
    }
}
