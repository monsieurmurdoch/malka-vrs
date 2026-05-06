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
            hostedUrl: `https://billing.example.test/invoices/${id}`,
        };
        this.invoices.set(id, invoice);
        return invoice;
    }

    async sendInvoice(params: {
        invoiceId: string;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice> {
        const existing = this.invoices.get(params.invoiceId);
        if (!existing) {
            throw new Error(`Mock invoice ${params.invoiceId} not found`);
        }

        const sent: StripeInvoice = {
            ...existing,
            status: 'open',
            sentAt: new Date().toISOString(),
        };
        this.invoices.set(params.invoiceId, sent);
        return sent;
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
        return {
            type: 'invoice.paid',
            data: { mock: true },
        };
    }
}
