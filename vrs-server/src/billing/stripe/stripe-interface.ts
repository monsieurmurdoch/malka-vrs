/**
 * Stripe Provider Interface
 *
 * Defines the contract for payment processing operations.
 * Implemented by both the mock (dev/test) and live (production) providers.
 */

export interface InvoiceItem {
    description: string;
    quantity: number;
    unitAmount: number;  // in cents
    total: number;       // in cents
}

export interface StripeCustomer {
    id: string;
    name: string;
    email: string;
}

export interface StripeInvoice {
    id: string;
    customerId: string;
    status: string;
    total: number;       // in cents
    hostedUrl?: string;
    pdfUrl?: string;
    sentAt?: string;
    paidAt?: string;
}

export interface StripePortalSession {
    url: string;
}

export interface StripePaymentResult {
    id: string;
    status: string;
    clientSecret?: string;
}

export interface StripeCreditNote {
    id: string;
    status: string;
    amount: number;
}

export interface WebhookEvent {
    id?: string;
    livemode?: boolean;
    type: string;
    data: Record<string, unknown>;
}

export interface StripeProvider {
    /** Create a customer in the payment system */
    createCustomer(params: {
        name: string;
        email: string;
        metadata?: Record<string, string>;
    }): Promise<StripeCustomer>;

    /** Create an invoice for a customer */
    createInvoice(params: {
        customerId: string;
        items: InvoiceItem[];
        currency?: string;
        dueDate?: Date;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice>;

    /** Finalize/send an existing invoice through the payment provider */
    sendInvoice(params: {
        invoiceId: string;
        metadata?: Record<string, string>;
    }): Promise<StripeInvoice>;

    /** Retrieve an existing invoice */
    getInvoice(invoiceId: string): Promise<StripeInvoice | null>;

    /** Create a customer billing portal session */
    createCustomerPortalSession(params: {
        customerId: string;
        returnUrl: string;
    }): Promise<StripePortalSession>;

    /** Create a setup intent for collecting future payment methods */
    createSetupIntent(params: {
        customerId: string;
        usage?: 'on_session' | 'off_session';
        metadata?: Record<string, string>;
    }): Promise<StripePaymentResult>;

    /** Create a payment intent */
    createPaymentIntent(params: {
        amount: number;      // in cents
        currency: string;
        customerId: string;
        metadata?: Record<string, string>;
    }): Promise<StripePaymentResult>;

    /** Create a credit note against an invoice */
    createCreditNote(params: {
        invoiceId: string;
        amount: number;
        reason?: string;
        metadata?: Record<string, string>;
    }): Promise<StripeCreditNote>;

    /** Verify a webhook signature and parse the event */
    verifyWebhookSignature(payload: string, signature: string): Promise<WebhookEvent>;
}
