/**
 * Stripe Factory
 *
 * Creates the appropriate Stripe provider based on configuration.
 * Returns MockStripeProvider for development, LiveStripeProvider for production.
 */

import { loadBillingConfig } from '../config';
import type { StripeProvider } from './stripe-interface';
import { MockStripeProvider } from './stripe-mock';
import { LiveStripeProvider } from './stripe-live';

let instance: StripeProvider | null = null;

export function createStripeProvider(): StripeProvider {
    if (instance) return instance;

    const config = loadBillingConfig();

    if (config.stripe.mode === 'live' && config.stripe.secretKey) {
        instance = new LiveStripeProvider(config.stripe.secretKey);
    } else {
        instance = new MockStripeProvider();
    }

    return instance;
}

export function resetStripeProvider(): void {
    instance = null;
}
