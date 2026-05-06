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
 * Get a live reconciliation dashboard for billing operations.
 */
export async function getBillingReconciliationDashboard(filters: {
    periodStart: string;
    periodEnd: string;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const cdrTotals = await billingDb.query(
        `SELECT call_type,
                COUNT(*) AS call_count,
                COALESCE(SUM(duration_seconds), 0) AS duration_seconds,
                COALESCE(SUM(total_charge), 0) AS total_charge
         FROM billing_cdrs
         WHERE start_time >= $1
           AND start_time < $2
         GROUP BY call_type
         ORDER BY call_type`,
        [filters.periodStart, filters.periodEnd]
    );
    const invoiceTotals = await billingDb.query(
        `SELECT status,
                COUNT(*) AS invoice_count,
                COALESCE(SUM(total), 0) AS total
         FROM invoices
         WHERE billing_period_start >= $1
           AND billing_period_start < $2
         GROUP BY status
         ORDER BY status`,
        [filters.periodStart, filters.periodEnd]
    );
    const paymentTotals = await billingDb.query(
        `SELECT provider, status,
                COUNT(*) AS payment_count,
                COALESCE(SUM(amount), 0) AS total
         FROM billing_payments
         WHERE created_at >= $1
           AND created_at < $2
         GROUP BY provider, status
         ORDER BY provider, status`,
        [filters.periodStart, filters.periodEnd]
    );
    const adjustmentTotals = await billingDb.query(
        `SELECT reason, status,
                COUNT(*) AS adjustment_count,
                COALESCE(SUM(amount), 0) AS total
         FROM billing_adjustments
         WHERE created_at >= $1
           AND created_at < $2
         GROUP BY reason, status
         ORDER BY reason, status`,
        [filters.periodStart, filters.periodEnd]
    );
    const webhookHealth = await billingDb.query(
        `SELECT processing_status,
                COUNT(*) AS event_count
         FROM stripe_webhook_events
         WHERE received_at >= $1
           AND received_at < $2
         GROUP BY processing_status`,
        [filters.periodStart, filters.periodEnd]
    );

    return {
        periodStart: filters.periodStart,
        periodEnd: filters.periodEnd,
        generatedAt: new Date(),
        cdrTotals: cdrTotals.rows,
        invoiceTotals: invoiceTotals.rows,
        paymentTotals: paymentTotals.rows,
        adjustmentTotals: adjustmentTotals.rows,
        webhookHealth: webhookHealth.rows,
    };
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
