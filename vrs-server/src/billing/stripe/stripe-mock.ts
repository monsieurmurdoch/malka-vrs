/**
 * Mock Stripe Provider
 *
 * In-memory stub for development and testing.
 * Mimics the StripeProvider interface without making real API calls.
 */

import type { StripeProvider, StripeCustomer, StripeInvoice, StripePaymentResult, WebhookEvent } from './stripe-interface';

export class MockStripeProvider implements StripeProvider {
    private customers = new Map<string, StripeCustomer>();
    private invoices = new Map<string, StripeInvoice>();
    private paymentIntents = new Map<string, StripePaymentResult>();
    private idCounter = 0;

    private nextId(prefix: string): string {
        this.idCounter++;
        return `${prefix}_mock_${this.idCounter}`;
    }

    async createCustomer(params: {
        name: string;
        email: string;
        metadata?: Record<string, string>;
    }): Promise<StripeCustomer> {
        const id = this.nextId('cus');
        const customer: StripeCustomer = { id, name: params.name, email: params.email };
        this.customers.set(id, customer);
        return customer;
    }

    async createInvoice(params: {
        customerId: string;
        items: { description: string; quantity: number; unitAmount: number; total: number }[];
        currency?: string;
        dueDate?: Date;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice> {
        const id = this.nextId('in');
        const total = params.items.reduce((sum, item) => sum + item.total, 0);
        const invoice: StripeInvoice = {
            id,
            customerId: params.customerId,
            status: 'draft',
            total,
        };
        this.invoices.set(id, invoice);
        return invoice;
    }

    async getInvoice(invoiceId: string): Promise<StripeInvoice | null> {
        return this.invoices.get(invoiceId) || null;
    }

    async createPaymentIntent(params: {
        amount: number;
        currency: string;
        customerId: string;
        metadata?: Record<string, string>;
    }): Promise<StripePaymentResult> {
        const id = this.nextId('pi');
        const result: StripePaymentResult = {
            id,
            status: 'requires_payment_method',
            clientSecret: `${id}_secret_mock`,
        };
        this.paymentIntents.set(id, result);
        return result;
    }

    async verifyWebhookSignature(_payload: string, _signature: string): Promise<WebhookEvent> {
        let payload: Record<string, unknown> = {};
        try {
            payload = JSON.parse(_payload || '{}');
        } catch {
            payload = {};
        }

        return {
            id: String(payload.id || this.nextId('evt')),
            livemode: Boolean(payload.livemode),
            type: String(payload.type || 'invoice.paid'),
            data: (payload.data && typeof payload.data === 'object'
                ? (payload.data as { object?: Record<string, unknown> }).object
                : undefined) || { mock: true },
        };
    }
}
