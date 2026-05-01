/**
 * Billing Audit Service
 *
 * Provides FCC-audit-ready logging and export for all billing events.
 * Every mutation in the billing subsystem is recorded here.
 */

import * as billingDb from '../lib/billing-db';
import { moduleLogger } from '../lib/logger';
import type { BillingAuditEntry, AuditLogQueryFilters, BillingExportData } from './types';
import type { CallType } from './config';

const log = moduleLogger('billing-audit');

/**
 * Log a billing event to the audit trail.
 * No-op if billing is not enabled.
 */
export async function logBillingEvent(
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown>,
    performedBy?: string | null,
    ipAddress?: string | null
): Promise<void> {
    if (!billingDb.isBillingDbReady()) return;

    try {
        await billingDb.query(
            `INSERT INTO billing_audit_log (action, entity_type, entity_id, performed_by, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                action,
                entityType,
                entityId,
                performedBy || null,
                JSON.stringify(details),
                ipAddress || null,
            ]
        );
    } catch (err) {
        log.error({ action, err }, 'billing_audit_log_failed');
    }
}

/**
 * Query the billing audit log with filters.
 */
export async function getAuditLog(
    filters: AuditLogQueryFilters
): Promise<BillingAuditEntry[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.action) {
        conditions.push(`action = $${paramIdx++}`);
        params.push(filters.action);
    }
    if (filters.entityType) {
        conditions.push(`entity_type = $${paramIdx++}`);
        params.push(filters.entityType);
    }
    if (filters.entityId) {
        conditions.push(`entity_id = $${paramIdx++}`);
        params.push(filters.entityId);
    }
    if (filters.performedBy) {
        conditions.push(`performed_by = $${paramIdx++}`);
        params.push(filters.performedBy);
    }
    if (filters.fromDate) {
        conditions.push(`created_at >= $${paramIdx++}`);
        params.push(filters.fromDate);
    }
    if (filters.toDate) {
        conditions.push(`created_at < $${paramIdx++}`);
        params.push(filters.toDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    params.push(limit, offset);

    const result = await billingDb.query(
        `SELECT * FROM billing_audit_log ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        params
    );

    return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        action: row.action as string,
        entityType: row.entity_type as string,
        entityId: row.entity_id as string | null,
        performedBy: row.performed_by as string | null,
        details: (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) as Record<string, unknown>,
        ipAddress: row.ip_address as string | null,
        createdAt: new Date(row.created_at as string),
    }));
}

/**
 * Export audit log for FCC audit readiness.
 * Returns a BillingExportData structure that can be formatted by any formatter.
 */
export async function exportAuditLog(
    fromDate: string,
    toDate: string,
    callType?: CallType
): Promise<BillingExportData> {
    const { getCdrsForPeriod } = require('./cdr-service');

    const year = parseInt(fromDate.slice(0, 4), 10);
    const month = parseInt(fromDate.slice(5, 7), 10);

    const records = callType
        ? await getCdrsForPeriod(callType, year, month)
        : [];

    const totalCharge = records.reduce((sum: number, r: { totalCharge: number }) => sum + r.totalCharge, 0);

    return {
        records,
        metadata: {
            exportDate: new Date().toISOString(),
            callType: callType || 'all' as const,
            periodStart: fromDate,
            periodEnd: toDate,
            totalRecords: records.length,
            totalCharge,
            generatedBy: null,
        },
    };
}
