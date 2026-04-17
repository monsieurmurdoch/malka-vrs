/**
 * Reconciliation Service
 *
 * Automated reconciliation checks comparing billing records
 * to payments received (both VRS/TRS Fund and VRI/Corporate).
 */

import * as billingDb from '../lib/billing-db';
import { logBillingEvent } from './audit-service';
import { getCdrsForPeriod } from './cdr-service';
import type { CallType } from './config';
import type { ReconciliationRecord } from './types';

/**
 * Run monthly reconciliation for a call type.
 * Compares CDR totals to payments/submissions.
 */
export async function runMonthlyReconciliation(
    year: number,
    month: number,
    callType: CallType,
    actualTotal?: number
): Promise<ReconciliationRecord | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const cdrs = await getCdrsForPeriod(callType, year, month);
    const expectedTotal = cdrs.reduce((sum, c) => sum + c.totalCharge, 0);
    const resolvedActual = actualTotal ?? 0;
    const variance = Math.round((resolvedActual - expectedTotal) * 100) / 100;

    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const status = Math.abs(variance) < 0.01 ? 'matched' : 'unmatched';

    const result = await billingDb.query<{ id: string; created_at: string }>(
        `INSERT INTO billing_reconciliation (
            reconciliation_date, call_type, expected_total, actual_total,
            variance, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (reconciliation_date, call_type)
        DO UPDATE SET
            expected_total = EXCLUDED.expected_total,
            actual_total = EXCLUDED.actual_total,
            variance = EXCLUDED.variance,
            status = EXCLUDED.status
        RETURNING id, created_at`,
        [dateStr, callType, expectedTotal, resolvedActual, variance, status]
    );

    const record: ReconciliationRecord = {
        id: result.rows[0].id,
        reconciliationDate: dateStr,
        callType,
        expectedTotal,
        actualTotal: resolvedActual,
        variance,
        varianceReason: null,
        status: status as 'matched' | 'unmatched',
        resolvedAt: null,
        resolvedBy: null,
        notes: null,
        createdAt: new Date(result.rows[0].created_at),
    };

    await logBillingEvent('reconciliation_run', 'reconciliation', record.id, {
        callType,
        year,
        month,
        expectedTotal,
        actualTotal: resolvedActual,
        variance,
        status,
    });

    return record;
}

/**
 * Get reconciliation report for a period.
 */
export async function getReconciliationReport(
    year: number,
    month: number
): Promise<ReconciliationRecord[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;

    const result = await billingDb.query(
        'SELECT * FROM billing_reconciliation WHERE reconciliation_date = $1 ORDER BY call_type',
        [dateStr]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        reconciliationDate: row.reconciliation_date as string,
        callType: row.call_type as CallType,
        expectedTotal: parseFloat(row.expected_total as string),
        actualTotal: row.actual_total ? parseFloat(row.actual_total as string) : null,
        variance: row.variance ? parseFloat(row.variance as string) : null,
        varianceReason: row.variance_reason as string | null,
        status: row.status as 'matched' | 'unmatched' | 'disputed',
        resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
        resolvedBy: row.resolved_by as string | null,
        notes: row.notes as string | null,
        createdAt: new Date(row.created_at as string),
    }));
}

/**
 * Resolve a variance by providing a reason.
 */
export async function resolveVariance(
    reconciliationId: string,
    reason: string,
    resolvedBy: string
): Promise<void> {
    if (!billingDb.isBillingDbReady()) return;

    await billingDb.query(
        `UPDATE billing_reconciliation
         SET variance_reason = $1, resolved_at = NOW(), resolved_by = $2, status = 'matched'
         WHERE id = $3`,
        [reason, resolvedBy, reconciliationId]
    );

    await logBillingEvent('variance_resolved', 'reconciliation', reconciliationId, {
        reason,
        resolvedBy,
    });
}
