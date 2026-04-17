/**
 * CDR Service Tests
 */

// Mock billing-db before importing anything that uses it
jest.mock('../../src/lib/billing-db', () => ({
    isBillingDbReady: jest.fn().mockReturnValue(false),
    query: jest.fn(),
    getClient: jest.fn(),
    transaction: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
}));

import * as billingDb from '../../src/lib/billing-db';
import { createCdr, getCdrs, getCdrStatusHistory, transitionCdrStatus } from '../../src/billing/cdr-service';

describe('cdr-service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when billing is not configured', () => {
        it('createCdr returns null', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await createCdr({
                callId: 'test-call-1',
                callType: 'vrs',
                startTime: new Date('2025-01-15T10:00:00Z'),
                endTime: new Date('2025-01-15T10:05:00Z'),
                durationSeconds: 300,
            });
            expect(result).toBeNull();
        });

        it('getCdrs returns empty array', async () => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(false);
            const result = await getCdrs({ callType: 'vrs' });
            expect(result).toEqual([]);
        });
    });

    describe('when billing is configured', () => {
        beforeEach(() => {
            (billingDb.isBillingDbReady as jest.Mock).mockReturnValue(true);
        });

        it('createCdr inserts a CDR with resolved rate', async () => {
            const mockCdrId = 'test-cdr-uuid';
            const mockCreatedAt = new Date().toISOString();

            // Mock rate lookup
            (billingDb.query as jest.Mock)
                .mockResolvedValueOnce({
                    rows: [{ id: 'tier-1', per_minute_rate: '3.5000' }],
                })
                // CDR insert
                .mockResolvedValueOnce({
                    rows: [{ id: mockCdrId, created_at: mockCreatedAt }],
                })
                // Audit log insert
                .mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const result = await createCdr({
                callId: 'test-call-1',
                callType: 'vrs',
                callerId: 'client-1',
                interpreterId: 'interp-1',
                startTime: new Date('2025-01-15T10:00:00Z'),
                endTime: new Date('2025-01-15T10:05:00Z'),
                durationSeconds: 300,
                callerNumber: '2125551234',
                calleeNumber: '2125555678',
                language: 'ASL',
            });

            expect(result).not.toBeNull();
            expect(result!.callId).toBe('test-call-1');
            expect(result!.callType).toBe('vrs');
            expect(result!.durationSeconds).toBe(300);
            expect(result!.perMinuteRate).toBe(3.5);
            expect(result!.totalCharge).toBe(17.5); // 5 min * $3.50
            expect(result!.billingStatus).toBe('pending');

            // Verify query was called for rate lookup and CDR insert
            expect(billingDb.query).toHaveBeenCalledTimes(3);
        });

        it('transitionCdrStatus inserts a status transition', async () => {
            (billingDb.query as jest.Mock)
                .mockResolvedValueOnce({
                    rows: [{ billing_status: 'pending' }],
                })
                .mockResolvedValueOnce({ rows: [], rowCount: 0 })
                .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // audit log

            await transitionCdrStatus('cdr-1', 'submitted', 'admin-1', 'TRS submission');

            expect(billingDb.query).toHaveBeenCalledTimes(3);
        });

        it('getCdrStatusHistory returns mapped transitions', async () => {
            const mockTransitions = [{
                id: 'trans-1',
                cdr_id: 'cdr-1',
                from_status: 'pending',
                to_status: 'submitted',
                transitioned_at: new Date().toISOString(),
                transitioned_by: 'admin-1',
                reason: 'TRS submission',
            }];

            (billingDb.query as jest.Mock).mockResolvedValueOnce({ rows: mockTransitions });

            const result = await getCdrStatusHistory('cdr-1');
            expect(result).toHaveLength(1);
            expect(result[0].fromStatus).toBe('pending');
            expect(result[0].toStatus).toBe('submitted');
        });
    });
});
