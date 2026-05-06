/**
 * CDR (Call Detail Record) Service
 *
 * Creates append-only billing records when calls end.
 * Manages status transitions through a separate audit table.
 * No update or delete operations on CDRs themselves.
 */

import * as billingDb from '../lib/billing-db';
import { createModuleLogger } from '../lib/logger';
import { loadBillingConfig, type BillingStatus, type CallType } from './config';
import { getEffectiveRate } from './rate-service';
import { logBillingEvent } from './audit-service';
import type {
    BillingCdr,
    CreateCdrInput,
    CdrStatusTransition,
    CdrQueryFilters,
} from './types';

const log = createModuleLogger('cdr');

/**
 * Create a CDR when a call ends.
 * Resolves the effective rate, calculates the charge, and inserts the record.
 * Best-effort: logs and returns null on failure.
 */
export async function createCdr(input: CreateCdrInput): Promise<BillingCdr | null> {
    if (!billingDb.isBillingDbReady()) return null;

    try {
        const existing = await billingDb.query(
            'SELECT * FROM billing_cdrs WHERE call_id = $1 ORDER BY created_at DESC LIMIT 1',
            [input.callId]
        );

        if (existing.rows[0]) {
            return mapCdrRow(existing.rows[0]);
        }

        const { rateTierId, perMinuteRate } = await getEffectiveRate(
            input.callType,
            input.startTime,
            {
                corporateAccountId: input.corporateAccountId || null,
                languagePair: input.language || null,
            }
        );

        const durationMinutes = input.durationSeconds / 60;
        const totalCharge = Math.round(durationMinutes * perMinuteRate * 100) / 100;

        const result = await billingDb.query<{ id: string; created_at: string }>(
            `INSERT INTO billing_cdrs (
                call_id, call_type, caller_id, interpreter_id,
                start_time, end_time, duration_seconds,
                caller_number, callee_number, language,
                rate_tier_id, per_minute_rate, total_charge,
                billing_status, corporate_account_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id, created_at`,
            [
                input.callId,
                input.callType,
                input.callerId || null,
                input.interpreterId || null,
                input.startTime.toISOString(),
                input.endTime.toISOString(),
                input.durationSeconds,
                input.callerNumber || null,
                input.calleeNumber || null,
                input.language || null,
                rateTierId,
                perMinuteRate,
                totalCharge,
                'pending',
                input.corporateAccountId || null,
                JSON.stringify({}),
            ]
        );

        const cdrId = result.rows[0].id;
        const createdAt = new Date(result.rows[0].created_at);

        await logBillingEvent('cdr_created', 'cdr', cdrId, {
            callId: input.callId,
            callType: input.callType,
            durationSeconds: input.durationSeconds,
            perMinuteRate,
            totalCharge,
        });

        return {
            id: cdrId,
            callId: input.callId,
            callType: input.callType,
            callerId: input.callerId || null,
            interpreterId: input.interpreterId || null,
            startTime: input.startTime,
            endTime: input.endTime,
            durationSeconds: input.durationSeconds,
            callerNumber: input.callerNumber || null,
            calleeNumber: input.calleeNumber || null,
            language: input.language || null,
            rateTierId,
            perMinuteRate,
            totalCharge,
            billingStatus: 'pending',
            trsSubmissionId: null,
            corporateAccountId: input.corporateAccountId || null,
            invoiceId: null,
            metadata: {},
            createdAt,
        };
    } catch (err) {
        log.error({ err, callId: input.callId }, 'Failed to create CDR for call');
        return null;
    }
}

/**
 * Transition a CDR's billing status.
 * Inserts a record into billing_cdr_status_transitions.
 * Valid transitions enforced by database CHECK constraint.
 */
export async function transitionCdrStatus(
    cdrId: string,
    toStatus: BillingStatus,
    performedBy?: string,
    reason?: string
): Promise<void> {
    if (!billingDb.isBillingDbReady()) return;

    // Get current status
    const cdrResult = await billingDb.query<{ current_status: BillingStatus }>(
        `SELECT COALESCE(
            (
                SELECT to_status
                FROM billing_cdr_status_transitions
                WHERE cdr_id = billing_cdrs.id
                ORDER BY transitioned_at DESC
                LIMIT 1
            ),
            billing_status
        ) AS current_status
        FROM billing_cdrs
        WHERE id = $1`,
        [cdrId]
    );

    if (cdrResult.rows.length === 0) {
        throw new Error(`CDR ${cdrId} not found`);
    }

    const fromStatus = cdrResult.rows[0].current_status;

    await billingDb.query(
        `INSERT INTO billing_cdr_status_transitions (cdr_id, from_status, to_status, transitioned_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [cdrId, fromStatus, toStatus, performedBy || null, reason || null]
    );

    await logBillingEvent('status_transitioned', 'cdr', cdrId, {
        fromStatus,
        toStatus,
        performedBy,
        reason,
    });
}

/**
 * Get CDR status history (full chain of custody).
 */
export async function getCdrStatusHistory(cdrId: string): Promise<CdrStatusTransition[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const result = await billingDb.query(
        `SELECT id, cdr_id, from_status, to_status, transitioned_at, transitioned_by, reason
         FROM billing_cdr_status_transitions
         WHERE cdr_id = $1
         ORDER BY transitioned_at`,
        [cdrId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        cdrId: row.cdr_id as string,
        fromStatus: row.from_status as BillingStatus,
        toStatus: row.to_status as BillingStatus,
        transitionedAt: new Date(row.transitioned_at as string),
        transitionedBy: row.transitioned_by as string | null,
        reason: row.reason as string | null,
    }));
}

/**
 * Get a single CDR by ID.
 */
export async function getCdrById(id: string): Promise<BillingCdr | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(`${cdrSelectSql()} WHERE c.id = $1`, [id]);
    if (result.rows.length === 0) return null;

    return mapCdrRow(result.rows[0]);
}

/**
 * Query CDRs with filters.
 */
export async function getCdrs(filters: CdrQueryFilters): Promise<BillingCdr[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.callType) {
        conditions.push(`c.call_type = $${paramIdx++}`);
        params.push(filters.callType);
    }
    if (filters.billingStatus) {
        conditions.push(`COALESCE(latest_transition.to_status, c.billing_status) = $${paramIdx++}`);
        params.push(filters.billingStatus);
    }
    if (filters.fromDate) {
        conditions.push(`c.start_time >= $${paramIdx++}`);
        params.push(filters.fromDate);
    }
    if (filters.toDate) {
        conditions.push(`c.start_time < $${paramIdx++}`);
        params.push(filters.toDate);
    }
    if (filters.corporateAccountId) {
        conditions.push(`c.corporate_account_id = $${paramIdx++}`);
        params.push(filters.corporateAccountId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    params.push(limit, offset);

    const result = await billingDb.query(
        `${cdrSelectSql()} ${where} ORDER BY c.start_time DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        params
    );

    return result.rows.map(mapCdrRow);
}

/**
 * Get CDRs for a specific month and call type (used by aggregation pipeline).
 */
export async function getCdrsForPeriod(
    callType: CallType,
    year: number,
    month: number
): Promise<BillingCdr[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    return getCdrs({
        callType,
        fromDate: startDate,
        toDate: endDate,
        limit: 100000,
    });
}

function cdrSelectSql(): string {
    return `SELECT c.*,
        COALESCE(latest_transition.to_status, c.billing_status) AS current_status
     FROM billing_cdrs c
     LEFT JOIN LATERAL (
        SELECT to_status
        FROM billing_cdr_status_transitions
        WHERE cdr_id = c.id
        ORDER BY transitioned_at DESC
        LIMIT 1
     ) latest_transition ON true`;
}

function mapCdrRow(row: Record<string, unknown>): BillingCdr {
    return {
        id: row.id as string,
        callId: row.call_id as string,
        callType: row.call_type as CallType,
        callerId: row.caller_id as string | null,
        interpreterId: row.interpreter_id as string | null,
        startTime: new Date(row.start_time as string),
        endTime: new Date(row.end_time as string),
        durationSeconds: row.duration_seconds as number,
        callerNumber: row.caller_number as string | null,
        calleeNumber: row.callee_number as string | null,
        language: row.language as string | null,
        rateTierId: row.rate_tier_id as string | null,
        perMinuteRate: parseFloat(row.per_minute_rate as string),
        totalCharge: parseFloat(row.total_charge as string),
        billingStatus: (row.current_status || row.billing_status) as BillingStatus,
        trsSubmissionId: row.trs_submission_id as string | null,
        corporateAccountId: row.corporate_account_id as string | null,
        invoiceId: row.invoice_id as string | null,
        metadata: (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown>,
        createdAt: new Date(row.created_at as string),
    };
}
