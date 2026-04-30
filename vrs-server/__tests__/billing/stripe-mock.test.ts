/**
 * Stripe Mock Provider Tests
 */

import { MockStripeProvider } from '../../src/billing/stripe/stripe-mock';

describe('MockStripeProvider', () => {
    let provider: MockStripeProvider;

    beforeEach(() => {
        provider = new MockStripeProvider();
    });

    it('creates a customer', async () => {
        const customer = await provider.createCustomer({
            name: 'Test Corp',
            email: 'billing@testcorp.com',
        });

        expect(customer.id).toMatch(/^cus_mock_/);
        expect(customer.name).toBe('Test Corp');
        expect(customer.email).toBe('billing@testcorp.com');
    });

    it('creates an invoice', async () => {
        const customer = await provider.createCustomer({
            name: 'Test Corp',
            email: 'billing@testcorp.com',
        });

        const invoice = await provider.createInvoice({
            customerId: customer.id,
            items: [{
                description: 'VRI Services',
                quantity: 1,
                unitAmount: 15000, // $150.00 in cents
                total: 15000,
            }],
        });

        expect(invoice.id).toMatch(/^in_mock_/);
        expect(invoice.customerId).toBe(customer.id);
        expect(invoice.total).toBe(15000);
        expect(invoice.status).toBe('draft');
    });

    it('retrieves an invoice by id', async () => {
        const customer = await provider.createCustomer({
            name: 'Test Corp',
            email: 'billing@testcorp.com',
        });

        const created = await provider.createInvoice({
            customerId: customer.id,
            items: [{ description: 'Test', quantity: 1, unitAmount: 1000, total: 1000 }],
        });

        const retrieved = await provider.getInvoice(created.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(created.id);
    });

    it('returns null for non-existent invoice', async () => {
        const result = await provider.getInvoice('in_nonexistent');
        expect(result).toBeNull();
    });

    it('creates a payment intent', async () => {
        const intent = await provider.createPaymentIntent({
            amount: 10000,
            currency: 'usd',
            customerId: 'cus_test',
        });

        expect(intent.id).toMatch(/^pi_mock_/);
        expect(intent.status).toBe('requires_payment_method');
        expect(intent.clientSecret).toBeTruthy();
    });

    it('sends invoices and returns hosted invoice links', async () => {
        const invoice = await provider.createInvoice({
            customerId: 'cus_test',
            items: [{ description: 'Test', quantity: 1, unitAmount: 1000, total: 1000 }],
        });

        const sent = await provider.sendInvoice(invoice.id);
        expect(sent.status).toBe('open');
        expect(sent.hostedUrl).toContain(invoice.id);
        expect(sent.pdfUrl).toContain(invoice.id);
    });

    it('creates billing portal sessions, setup intents, and credit notes', async () => {
        const portal = await provider.createCustomerPortalSession({
            customerId: 'cus_test',
            returnUrl: 'https://example.test/billing',
        });
        const setup = await provider.createSetupIntent({ customerId: 'cus_test' });
        const creditNote = await provider.createCreditNote({
            invoiceId: 'in_test',
            amount: 500,
            reason: 'test_credit',
        });

        expect(portal.url).toContain('cus_test');
        expect(setup.id).toMatch(/^seti_mock_/);
        expect(setup.clientSecret).toBeTruthy();
        expect(creditNote.id).toMatch(/^cn_mock_/);
        expect(creditNote.amount).toBe(500);
    });

    it('verifies webhook signature', async () => {
        const event = await provider.verifyWebhookSignature('payload', 'sig');
        expect(event.type).toBe('invoice.paid');
        expect(event.data).toEqual({ mock: true });
    });
});
