/**
 * Reconciliation Service Tests
 */

jest.mock('../../src/lib/billing-db', () => ({
    isBillingDbReady: jest.fn().mockReturnValue(false),
    query: jest.fn(),
    getClient: jest.fn(),
    transaction: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
}));

jest.mock('../../src/billing/cdr-service', () => ({
    getCdrsForPeriod: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/billing/audit-service', () => ({
    logBillingEvent: jest.fn().mockResolvedValue(undefined),
}));

import * as billingDb from '../../src/lib/billing-db';
import { runMonthlyReconciliation, getReconciliationReport, resolveVariance } from '../../src/billing/reconciliation-service';

describe('reconciliation-service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when billing is not configured', () => {
        it('runMonthlyReconciliation returns null', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await runMonthlyReconciliation(2025, 1, 'vrs');
            expect(result).toBeNull();
        });

        it('getReconciliationReport returns empty array', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await getReconciliationReport(2025, 1);
            expect(result).toEqual([]);
        });
    });

    describe('when billing is configured', () => {
        beforeEach(() => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(true);
        });

        it('runMonthlyReconciliation creates a reconciliation record', async () => {
            (billingDb.query as jest.Mock).mockResolvedValue({
                rows: [{
                    id: 'recon-1',
                    created_at: new Date().toISOString(),
                }],
            });

            const result = await runMonthlyReconciliation(2025, 1, 'vrs', 1000);
            expect(result).not.toBeNull();
            expect(result!.callType).toBe('vrs');
            expect(result!.actualTotal).toBe(1000);
            expect(result!.status).toBe('unmatched');
        });

        it('resolveVariance updates the record', async () => {
            (billingDb.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 1 });

            await resolveVariance('recon-1', 'Rate adjustment', 'admin-1');
            expect(billingDb.query).toHaveBeenCalledTimes(1);
        });
    });
});
