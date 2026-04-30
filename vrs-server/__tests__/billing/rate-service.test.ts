/**
 * Rate Service Tests
 */

jest.mock('../../src/lib/billing-db', () => ({
    isBillingDbReady: jest.fn().mockReturnValue(false),
    query: jest.fn(),
    getClient: jest.fn(),
    transaction: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
}));

import * as billingDb from '../../src/lib/billing-db';
import { getEffectiveRate, getRateTiers, createRateTier } from '../../src/billing/rate-service';

describe('rate-service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when billing is not configured', () => {
        it('getEffectiveRate returns default VRS rate', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await getEffectiveRate('vrs');
            expect(result.perMinuteRate).toBe(3.5);
            expect(result.rateTierId).toBeNull();
        });

        it('getEffectiveRate returns default VRI rate', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await getEffectiveRate('vri');
            expect(result.perMinuteRate).toBe(1.00);
            expect(result.rateTierId).toBeNull();
        });

        it('getRateTiers returns empty array', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await getRateTiers();
            expect(result).toEqual([]);
        });
    });

    describe('when billing is configured', () => {
        beforeEach(() => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(true);
        });

        it('getEffectiveRate queries for active tier', async () => {
            (billingDb.query as jest.Mock).mockResolvedValueOnce({
                rows: [{ id: 'tier-uuid', per_minute_rate: '4.2500' }],
            });

            const result = await getEffectiveRate('vrs', new Date('2025-06-15'));
            expect(result.perMinuteRate).toBe(4.25);
            expect(result.rateTierId).toBe('tier-uuid');
        });

        it('getEffectiveRate falls back when no tier found', async () => {
            (billingDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

            const result = await getEffectiveRate('vrs');
            expect(result.perMinuteRate).toBe(3.5);
            expect(result.rateTierId).toBeNull();
        });

        it('createRateTier inserts and returns a tier', async () => {
            (billingDb.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 1 });

            const tier = await createRateTier({
                callType: 'vrs',
                label: 'FY2026 VRS Rate',
                perMinuteRate: 3.75,
                effectiveFrom: '2026-01-01',
                fccOrderRef: 'FCC-26-001',
            });

            expect(tier.callType).toBe('vrs');
            expect(tier.perMinuteRate).toBe(3.75);
            expect(tier.label).toBe('FY2026 VRS Rate');
            expect(billingDb.query).toHaveBeenCalledTimes(1);
        });
    });
});
