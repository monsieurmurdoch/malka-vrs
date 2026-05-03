/**
 * Billing Configuration
 *
 * Reads all billing-related settings from environment variables.
 * Billing is entirely opt-in: if BILLING_PG_HOST is not set, the
 * subsystem remains inert and all billing operations become no-ops.
 */

export type CallType = 'vrs' | 'vri';
export type BillingStatus = 'pending' | 'submitted' | 'paid' | 'disputed' | 'write_off';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
export type ReconciliationStatus = 'matched' | 'unmatched' | 'disputed';
export type StripeMode = 'live' | 'mock' | 'test';

export interface PostgresConfig {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    poolMax: number;
    ssl: boolean;
}

export interface StripeConfig {
    mode: StripeMode;
    secretKey?: string;
    webhookSecret?: string;
}

export interface BillingRatesConfig {
    defaultVrsRatePerMinute: number;
    defaultVriRatePerMinute: number;
}

export interface BillingConfig {
    enabled: boolean;
    postgres: PostgresConfig;
    stripe: StripeConfig;
    rates: BillingRatesConfig;
}

let cachedConfig: BillingConfig | null = null;

export function loadBillingConfig(): BillingConfig {
    if (cachedConfig) return cachedConfig;

    const pgHost = process.env.BILLING_PG_HOST || '';

    cachedConfig = {
        enabled: !!pgHost,
        postgres: {
            host: pgHost,
            port: parseInt(process.env.BILLING_PG_PORT || '5432', 10),
            database: process.env.BILLING_PG_DATABASE || 'vrs_billing',
            user: process.env.BILLING_PG_USER || 'vrs_billing',
            password: process.env.BILLING_PG_PASSWORD || '',
            poolMax: parseInt(process.env.BILLING_PG_POOL_MAX || '10', 10),
            ssl: process.env.BILLING_PG_SSL === 'true',
        },
        stripe: {
            mode: (process.env.BILLING_STRIPE_MODE as StripeMode) || 'mock',
            secretKey: process.env.BILLING_STRIPE_SECRET_KEY,
            webhookSecret: process.env.BILLING_STRIPE_WEBHOOK_SECRET,
        },
        rates: {
            defaultVrsRatePerMinute: parseFloat(process.env.BILLING_DEFAULT_VRS_RATE || '3.50'),
            defaultVriRatePerMinute: parseFloat(process.env.BILLING_DEFAULT_VRI_RATE || '4.95'),
        },
    };

    return cachedConfig;
}

export function resetBillingConfig(): void {
    cachedConfig = null;
}
