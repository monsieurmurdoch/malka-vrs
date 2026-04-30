/**
 * Interpreter operations service
 *
 * Stores schedule, utilization, payable, and manager-note records that used
 * to be flattened into admin CRM note fields.
 */

import * as billingDb from '../lib/billing-db';
import type {
    InterpreterAvailabilitySession,
    InterpreterBreakSession,
    InterpreterPayable,
    InterpreterScheduleWindow,
    InterpreterUtilizationSummary,
    ManagerNote,
} from './types';

function parseMetadata(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return {};
        }
    }
    return value as Record<string, unknown>;
}

export async function createScheduleWindow(input: {
    interpreterId: string;
    tenantId?: string;
    serviceMode?: string;
    languagePair?: string;
    startsAt: string;
    endsAt: string;
    status?: string;
    source?: string;
    createdBy?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
}): Promise<InterpreterScheduleWindow | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO interpreter_schedule_windows (
            interpreter_id, tenant_id, service_mode, language_pair, starts_at, ends_at,
            status, source, created_by, notes, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.serviceMode || 'vri',
            input.languagePair || null,
            input.startsAt,
            input.endsAt,
            input.status || 'scheduled',
            input.source || 'interpreter',
            input.createdBy || null,
            input.notes || null,
            JSON.stringify(input.metadata || {}),
        ]
    );

    return mapScheduleWindow(result.rows[0]);
}

export async function listScheduleWindows(filters: {
    interpreterId?: string;
    tenantId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
}): Promise<InterpreterScheduleWindow[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.interpreterId) {
        conditions.push(`interpreter_id = $${paramIdx++}`);
        params.push(filters.interpreterId);
    }
    if (filters.tenantId) {
        conditions.push(`tenant_id = $${paramIdx++}`);
        params.push(filters.tenantId);
    }
    if (filters.fromDate) {
        conditions.push(`ends_at >= $${paramIdx++}`);
        params.push(filters.fromDate);
    }
    if (filters.toDate) {
        conditions.push(`starts_at < $${paramIdx++}`);
        params.push(filters.toDate);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit || 100);

    const result = await billingDb.query(
        `SELECT * FROM interpreter_schedule_windows ${where}
         ORDER BY starts_at ASC
         LIMIT $${paramIdx}`,
        params
    );

    return result.rows.map(mapScheduleWindow);
}

export async function recordAvailabilitySession(input: {
    interpreterId: string;
    tenantId?: string;
    serviceMode?: string;
    languagePair?: string;
    status: string;
    source?: string;
    reason?: string;
    startedAt: string;
    endedAt?: string;
    metadata?: Record<string, unknown>;
}): Promise<InterpreterAvailabilitySession | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO interpreter_availability_sessions (
            interpreter_id, tenant_id, service_mode, language_pair, status,
            source, reason, started_at, ended_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.serviceMode || null,
            input.languagePair || null,
            input.status,
            input.source || 'system',
            input.reason || null,
            input.startedAt,
            input.endedAt || null,
            JSON.stringify(input.metadata || {}),
        ]
    );

    return mapAvailabilitySession(result.rows[0]);
}

export async function recordBreakSession(input: {
    interpreterId: string;
    tenantId?: string;
    breakType?: string;
    reason?: string;
    startedAt: string;
    endedAt?: string;
    metadata?: Record<string, unknown>;
}): Promise<InterpreterBreakSession | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO interpreter_break_sessions (
            interpreter_id, tenant_id, break_type, reason, started_at, ended_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.breakType || 'paid',
            input.reason || null,
            input.startedAt,
            input.endedAt || null,
            JSON.stringify(input.metadata || {}),
        ]
    );

    return mapBreakSession(result.rows[0]);
}

export async function listUtilizationSummaries(filters: {
    interpreterId?: string;
    tenantId?: string;
    weekStart?: string;
    limit?: number;
}): Promise<InterpreterUtilizationSummary[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.interpreterId) {
        conditions.push(`interpreter_id = $${paramIdx++}`);
        params.push(filters.interpreterId);
    }
    if (filters.tenantId) {
        conditions.push(`tenant_id = $${paramIdx++}`);
        params.push(filters.tenantId);
    }
    if (filters.weekStart) {
        conditions.push(`week_start = $${paramIdx++}`);
        params.push(filters.weekStart);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit || 100);

    const result = await billingDb.query(
        `SELECT * FROM interpreter_utilization_summaries ${where}
         ORDER BY week_start DESC, interpreter_id ASC
         LIMIT $${paramIdx}`,
        params
    );

    return result.rows.map(mapUtilizationSummary);
}

export async function listPayables(filters: {
    interpreterId?: string;
    tenantId?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
}): Promise<InterpreterPayable[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.interpreterId) {
        conditions.push(`interpreter_id = $${paramIdx++}`);
        params.push(filters.interpreterId);
    }
    if (filters.tenantId) {
        conditions.push(`tenant_id = $${paramIdx++}`);
        params.push(filters.tenantId);
    }
    if (filters.status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(filters.status);
    }
    if (filters.periodStart) {
        conditions.push(`period_end >= $${paramIdx++}`);
        params.push(filters.periodStart);
    }
    if (filters.periodEnd) {
        conditions.push(`period_start < $${paramIdx++}`);
        params.push(filters.periodEnd);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit || 100);

    const result = await billingDb.query(
        `SELECT * FROM interpreter_payables ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
    );

    return result.rows.map(mapPayable);
}

export async function createManagerNote(input: {
    entityType: string;
    entityId: string;
    tenantId?: string;
    noteType?: string;
    visibility?: string;
    body: string;
    followUpAt?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
}): Promise<ManagerNote | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO manager_notes (
            entity_type, entity_id, tenant_id, note_type, visibility, body,
            follow_up_at, created_by, updated_by, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
        RETURNING *`,
        [
            input.entityType,
            input.entityId,
            input.tenantId || null,
            input.noteType || 'general',
            input.visibility || 'admin',
            input.body,
            input.followUpAt || null,
            input.createdBy || null,
            JSON.stringify(input.metadata || {}),
        ]
    );

    return mapManagerNote(result.rows[0]);
}

export async function listManagerNotes(filters: {
    entityType?: string;
    entityId?: string;
    tenantId?: string;
    limit?: number;
}): Promise<ManagerNote[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.entityType) {
        conditions.push(`entity_type = $${paramIdx++}`);
        params.push(filters.entityType);
    }
    if (filters.entityId) {
        conditions.push(`entity_id = $${paramIdx++}`);
        params.push(filters.entityId);
    }
    if (filters.tenantId) {
        conditions.push(`tenant_id = $${paramIdx++}`);
        params.push(filters.tenantId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filters.limit || 100);

    const result = await billingDb.query(
        `SELECT * FROM manager_notes ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
    );

    return result.rows.map(mapManagerNote);
}

function mapScheduleWindow(row: Record<string, unknown>): InterpreterScheduleWindow {
    return {
        id: row.id as string,
        interpreterId: row.interpreter_id as string,
        tenantId: row.tenant_id as string | null,
        serviceMode: row.service_mode as string,
        languagePair: row.language_pair as string | null,
        startsAt: new Date(row.starts_at as string),
        endsAt: new Date(row.ends_at as string),
        status: row.status as string,
        source: row.source as string,
        createdBy: row.created_by as string | null,
        notes: row.notes as string | null,
        metadata: parseMetadata(row.metadata),
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
    };
}

function mapAvailabilitySession(row: Record<string, unknown>): InterpreterAvailabilitySession {
    return {
        id: row.id as string,
        interpreterId: row.interpreter_id as string,
        tenantId: row.tenant_id as string | null,
        serviceMode: row.service_mode as string | null,
        languagePair: row.language_pair as string | null,
        status: row.status as string,
        source: row.source as string,
        reason: row.reason as string | null,
        startedAt: new Date(row.started_at as string),
        endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
        metadata: parseMetadata(row.metadata),
        createdAt: new Date(row.created_at as string),
    };
}

function mapBreakSession(row: Record<string, unknown>): InterpreterBreakSession {
    return {
        id: row.id as string,
        interpreterId: row.interpreter_id as string,
        tenantId: row.tenant_id as string | null,
        breakType: row.break_type as string,
        reason: row.reason as string | null,
        startedAt: new Date(row.started_at as string),
        endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
        metadata: parseMetadata(row.metadata),
        createdAt: new Date(row.created_at as string),
    };
}

function mapUtilizationSummary(row: Record<string, unknown>): InterpreterUtilizationSummary {
    return {
        id: row.id as string,
        interpreterId: row.interpreter_id as string,
        tenantId: row.tenant_id as string | null,
        weekStart: row.week_start as string,
        scheduledMinutes: Number(row.scheduled_minutes || 0),
        signedOnMinutes: Number(row.signed_on_minutes || 0),
        availableMinutes: Number(row.available_minutes || 0),
        inCallMinutes: Number(row.in_call_minutes || 0),
        breakMinutes: Number(row.break_minutes || 0),
        idleMinutes: Number(row.idle_minutes || 0),
        acceptedRequests: Number(row.accepted_requests || 0),
        declinedRequests: Number(row.declined_requests || 0),
        noAnswerRequests: Number(row.no_answer_requests || 0),
        utilizationRate: parseFloat(row.utilization_rate as string) || 0,
        metadata: parseMetadata(row.metadata),
        generatedAt: new Date(row.generated_at as string),
    };
}

function mapPayable(row: Record<string, unknown>): InterpreterPayable {
    return {
        id: row.id as string,
        interpreterId: row.interpreter_id as string,
        tenantId: row.tenant_id as string | null,
        callId: row.call_id as string | null,
        cdrId: row.cdr_id as string | null,
        sourceType: row.source_type as string,
        serviceMode: row.service_mode as string,
        languagePair: row.language_pair as string | null,
        payableMinutes: parseFloat(row.payable_minutes as string) || 0,
        rateAmount: parseFloat(row.rate_amount as string) || 0,
        totalAmount: parseFloat(row.total_amount as string) || 0,
        currency: row.currency as string,
        status: row.status as string,
        periodStart: row.period_start as string | null,
        periodEnd: row.period_end as string | null,
        metadata: parseMetadata(row.metadata),
        createdAt: new Date(row.created_at as string),
        approvedAt: row.approved_at ? new Date(row.approved_at as string) : null,
        approvedBy: row.approved_by as string | null,
    };
}

function mapManagerNote(row: Record<string, unknown>): ManagerNote {
    return {
        id: row.id as string,
        entityType: row.entity_type as string,
        entityId: row.entity_id as string,
        tenantId: row.tenant_id as string | null,
        noteType: row.note_type as string,
        visibility: row.visibility as string,
        body: row.body as string,
        followUpAt: row.follow_up_at ? new Date(row.follow_up_at as string) : null,
        createdBy: row.created_by as string | null,
        updatedBy: row.updated_by as string | null,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string),
        metadata: parseMetadata(row.metadata),
    };
}
