/**
 * VRS Billing Pipeline
 *
 * Handles TRS Fund billing for VRS (Video Relay Service) calls:
 * - Monthly aggregation of VRS CDRs
 * - TRS Fund submission formatting
 * - Status transitions for TRS submissions
 * - Payment reconciliation
 */

import * as billingDb from '../lib/billing-db';
import { createModuleLogger } from '../lib/logger';
import { logBillingEvent } from './audit-service';
import { getCdrsForPeriod, transitionCdrStatus } from './cdr-service';
import type { MonthlyAggregation, BillingCdr, BillingExportData } from './types';
import type { BillingFormatter } from './formatters/formatter-interface';

const log = createModuleLogger('vrs-billing');

/**
 * Generate monthly aggregation for VRS calls.
 */
export async function generateMonthlyAggregation(
    year: number,
    month: number,
    performedBy?: string
): Promise<MonthlyAggregation | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const cdrs = await getCdrsForPeriod('vrs', year, month);
    const totalCalls = cdrs.length;
    const totalMinutes = cdrs.reduce((sum, c) => sum + c.durationSeconds / 60, 0);
    const totalCharge = cdrs.reduce((sum, c) => sum + c.totalCharge, 0);
    const avgDuration = totalCalls > 0
        ? cdrs.reduce((sum, c) => sum + c.durationSeconds, 0) / totalCalls
        : 0;

    // Upsert aggregation
    const result = await billingDb.query<{ id: string; generated_at: string }>(
        `INSERT INTO monthly_billing_aggregations (
            call_type, period_year, period_month,
            total_calls, total_minutes, total_charge,
            avg_duration_seconds, generated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (call_type, period_year, period_month)
        DO UPDATE SET
            total_calls = EXCLUDED.total_calls,
            total_minutes = EXCLUDED.total_minutes,
            total_charge = EXCLUDED.total_charge,
            avg_duration_seconds = EXCLUDED.avg_duration_seconds,
            generated_by = EXCLUDED.generated_by,
            generated_at = NOW()
        RETURNING id, generated_at`,
        ['vrs', year, month, totalCalls, totalMinutes, totalCharge, avgDuration, performedBy || null]
    );

    const aggId = result.rows[0].id;

    await logBillingEvent('aggregation_generated', 'monthly_aggregation', aggId, {
        callType: 'vrs',
        year,
        month,
        totalCalls,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        totalCharge,
    });

    return {
        id: aggId,
        callType: 'vrs',
        periodYear: year,
        periodMonth: month,
        totalCalls,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        totalCharge,
        avgDurationSeconds: Math.round(avgDuration * 100) / 100,
        trsSubmissionId: null,
        trsSubmittedAt: null,
        generatedAt: new Date(result.rows[0].generated_at),
        generatedBy: performedBy || null,
    };
}

/**
 * Format a TRS Fund submission for a given aggregation period.
 */
export async function formatTrsSubmission(
    year: number,
    month: number,
    formatter: BillingFormatter
): Promise<string | Buffer | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const cdrs = await getCdrsForPeriod('vrs', year, month);
    const totalCharge = cdrs.reduce((sum, c) => sum + c.totalCharge, 0);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const exportData: BillingExportData = {
        records: cdrs,
        metadata: {
            exportDate: new Date().toISOString(),
            callType: 'vrs',
            periodStart: startDate,
            periodEnd: endDate,
            totalRecords: cdrs.length,
            totalCharge,
            generatedBy: null,
        },
    };

    return formatter.format(exportData);
}

/**
 * Mark all VRS CDRs in a period as submitted to the TRS Fund.
 */
export async function markTrsSubmitted(
    year: number,
    month: number,
    trsSubmissionId: string,
    performedBy?: string
): Promise<number> {
    if (!billingDb.isBillingDbReady()) return 0;

    const cdrs = await getCdrsForPeriod('vrs', year, month);
    let transitioned = 0;

    for (const cdr of cdrs) {
        if (cdr.billingStatus === 'pending') {
            try {
                await transitionCdrStatus(cdr.id, 'submitted', performedBy, `TRS submission ${trsSubmissionId}`);
                transitioned++;
            } catch (err) {
                log.error({ err, cdrId: cdr.id, trsSubmissionId }, 'Failed to transition CDR for TRS submission');
            }
        }
    }

    // Update the aggregation record
    await billingDb.query(
        `UPDATE monthly_billing_aggregations
         SET trs_submission_id = $1, trs_submitted_at = NOW()
         WHERE call_type = 'vrs' AND period_year = $2 AND period_month = $3`,
        [trsSubmissionId, year, month]
    );

    await logBillingEvent('trs_submitted', 'monthly_aggregation', null, {
        trsSubmissionId,
        year,
        month,
        cdrCount: transitioned,
        performedBy,
    });

    return transitioned;
}

/**
 * Reconcile a TRS payment against submitted CDRs.
 */
export async function reconcileTrsPayment(
    year: number,
    month: number,
    paymentAmount: number,
    performedBy?: string
): Promise<{ expected: number; actual: number; variance: number }> {
    if (!billingDb.isBillingDbReady()) {
        return { expected: 0, actual: paymentAmount, variance: paymentAmount };
    }

    const cdrs = await getCdrsForPeriod('vrs', year, month);
    const expectedTotal = cdrs.reduce((sum, c) => sum + c.totalCharge, 0);
    const variance = Math.round((paymentAmount - expectedTotal) * 100) / 100;

    // Transition all submitted CDRs to paid
    for (const cdr of cdrs) {
        if (cdr.billingStatus === 'submitted') {
            try {
                await transitionCdrStatus(cdr.id, 'paid', performedBy, 'TRS payment received');
            } catch (err) {
                log.error({ err, cdrId: cdr.id, year, month }, 'Failed to transition CDR for TRS payment');
            }
        }
    }

    // Record reconciliation
    const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    await billingDb.query(
        `INSERT INTO billing_reconciliation (reconciliation_date, call_type, expected_total, actual_total, variance, status, resolved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (reconciliation_date, call_type)
         DO UPDATE SET actual_total = EXCLUDED.actual_total, variance = EXCLUDED.variance, status = 'matched', resolved_at = NOW(), resolved_by = EXCLUDED.resolved_by`,
        [dateStr, 'vrs', expectedTotal, paymentAmount, variance, 'matched', performedBy || null]
    );

    await logBillingEvent('reconciliation_completed', 'reconciliation', null, {
        callType: 'vrs',
        year,
        month,
        expectedTotal,
        actualTotal: paymentAmount,
        variance,
    });

    return { expected: expectedTotal, actual: paymentAmount, variance };
}
