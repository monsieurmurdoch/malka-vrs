/**
 * Interpreter operations service
 *
 * Stores schedule, utilization, payable, and manager-note records that used
 * to be flattened into admin CRM note fields.
 */

import * as billingDb from '../lib/billing-db';
import { logBillingEvent } from './audit-service';
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

export async function upsertVendorProfile(input: {
    interpreterId: string;
    tenantId?: string;
    employmentType?: string;
    legalName?: string;
    companyName?: string;
    taxIdentifierLast4?: string;
    payoutMethod?: string;
    stripeAccountId?: string;
    currency?: string;
    metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO interpreter_vendor_profiles (
            interpreter_id, tenant_id, employment_type, legal_name, company_name,
            tax_identifier_last4, payout_method, stripe_account_id, currency, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (interpreter_id)
        DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            employment_type = EXCLUDED.employment_type,
            legal_name = EXCLUDED.legal_name,
            company_name = EXCLUDED.company_name,
            tax_identifier_last4 = EXCLUDED.tax_identifier_last4,
            payout_method = EXCLUDED.payout_method,
            stripe_account_id = EXCLUDED.stripe_account_id,
            currency = EXCLUDED.currency,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.employmentType || 'contractor',
            input.legalName || null,
            input.companyName || null,
            input.taxIdentifierLast4 || null,
            input.payoutMethod || 'manual',
            input.stripeAccountId || null,
            (input.currency || 'USD').toUpperCase(),
            JSON.stringify(input.metadata || {}),
        ]
    );

    return mapGenericJson(result.rows[0]);
}

export async function getVendorProfile(interpreterId: string): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;
    const result = await billingDb.query(
        'SELECT * FROM interpreter_vendor_profiles WHERE interpreter_id = $1',
        [interpreterId]
    );
    return result.rows[0] ? mapGenericJson(result.rows[0]) : null;
}

export async function createPayRate(input: {
    interpreterId: string;
    tenantId?: string;
    serviceMode?: string;
    languagePair?: string;
    rateType?: string;
    rateAmount: number;
    currency?: string;
    minimumMinutes?: number;
    effectiveFrom: string;
    effectiveTo?: string;
    createdBy?: string;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO interpreter_pay_rates (
            interpreter_id, tenant_id, service_mode, language_pair, rate_type,
            rate_amount, currency, minimum_minutes, effective_from, effective_to, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.serviceMode || 'vri',
            input.languagePair || 'ASL-EN',
            input.rateType || 'hourly',
            input.rateAmount,
            (input.currency || 'USD').toUpperCase(),
            input.minimumMinutes || 0,
            input.effectiveFrom,
            input.effectiveTo || null,
            input.createdBy || null,
        ]
    );

    return mapGenericJson(result.rows[0]);
}

export async function listPayRates(interpreterId: string): Promise<Record<string, unknown>[]> {
    if (!billingDb.isBillingDbReady()) return [];
    const result = await billingDb.query(
        `SELECT * FROM interpreter_pay_rates
         WHERE interpreter_id = $1
         ORDER BY effective_from DESC, created_at DESC`,
        [interpreterId]
    );
    return result.rows.map(mapGenericJson);
}

export async function generatePayablesForPeriod(input: {
    periodStart: string;
    periodEnd: string;
    tenantId?: string;
    interpreterId?: string;
    createdBy?: string;
}): Promise<{ created: number; skipped: number; missingRates: number }> {
    if (!billingDb.isBillingDbReady()) return { created: 0, skipped: 0, missingRates: 0 };

    const conditions = [
        'c.interpreter_id IS NOT NULL',
        'c.start_time >= $1',
        'c.start_time < $2',
        'bii.id IS NOT NULL',
        'existing.id IS NULL',
    ];
    const params: unknown[] = [input.periodStart, input.periodEnd];
    let paramIdx = 3;

    if (input.tenantId) {
        conditions.push(`ca.tenant_id = $${paramIdx++}`);
        params.push(input.tenantId);
    }
    if (input.interpreterId) {
        conditions.push(`c.interpreter_id = $${paramIdx++}`);
        params.push(input.interpreterId);
    }

    const cdrs = await billingDb.query(
        `SELECT c.*, ca.currency AS account_currency, ca.tenant_id
         FROM billing_cdrs c
         JOIN billing_invoice_items bii ON bii.cdr_id = c.id
         LEFT JOIN corporate_accounts ca ON ca.id = c.corporate_account_id
         LEFT JOIN interpreter_payables existing
           ON existing.cdr_id = c.id AND existing.source_type = 'cdr'
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.start_time`,
        params
    );

    let created = 0;
    let missingRates = 0;

    for (const row of cdrs.rows) {
        const rate = await findInterpreterPayRate({
            interpreterId: row.interpreter_id as string,
            tenantId: row.tenant_id as string | null,
            serviceMode: row.call_type as string,
            languagePair: normalizeLanguagePair(row.language as string | null),
            date: new Date(row.start_time as string).toISOString().slice(0, 10),
        });
        const payableMinutes = Math.max(
            rate?.minimumMinutes || 0,
            Math.ceil(Number(row.duration_seconds || 0) / 60)
        );
        const rateAmount = rate?.rateAmount || 0;
        const totalAmount = rate?.rateType === 'hourly'
            ? Math.round((payableMinutes / 60) * rateAmount * 100) / 100
            : Math.round(payableMinutes * rateAmount * 100) / 100;

        if (!rate) missingRates++;

        const inserted = await billingDb.query(
            `INSERT INTO interpreter_payables (
                interpreter_id, tenant_id, call_id, cdr_id, source_type,
                service_mode, language_pair, payable_minutes, rate_amount,
                total_amount, currency, status, period_start, period_end, metadata
            ) VALUES ($1, $2, $3, $4, 'cdr', $5, $6, $7, $8, $9, $10, 'draft', $11, $12, $13)
            ON CONFLICT (cdr_id, source_type) WHERE cdr_id IS NOT NULL DO NOTHING
            RETURNING id`,
            [
                row.interpreter_id,
                row.tenant_id || null,
                row.call_id,
                row.id,
                row.call_type,
                normalizeLanguagePair(row.language as string | null),
                payableMinutes,
                rateAmount,
                totalAmount,
                rate?.currency || row.account_currency || 'USD',
                input.periodStart,
                input.periodEnd,
                JSON.stringify({ rateId: rate?.id || null, missingRate: !rate, createdBy: input.createdBy || null }),
            ]
        );
        if (inserted.rows.length) created++;
    }

    return {
        created,
        skipped: cdrs.rows.length - created,
        missingRates,
    };
}

export async function createPayoutBatch(input: {
    periodStart: string;
    periodEnd: string;
    tenantId?: string;
    currency?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const currency = (input.currency || 'USD').toUpperCase();
    const batch = await billingDb.transaction(async (client) => {
        const insertedBatch = await client.query(
            `INSERT INTO interpreter_payout_batches (
                tenant_id, period_start, period_end, status, currency, total_amount,
                created_by, metadata
            ) VALUES ($1, $2, $3, 'draft', $4, 0, $5, $6)
            RETURNING *`,
            [
                input.tenantId || null,
                input.periodStart,
                input.periodEnd,
                currency,
                input.createdBy || null,
                JSON.stringify(input.metadata || {}),
            ]
        );
        const batchId = insertedBatch.rows[0].id;

        await client.query(
            `INSERT INTO interpreter_payout_items (
                payout_batch_id, payable_id, interpreter_id, amount, currency
            )
            SELECT $1, p.id, p.interpreter_id, p.total_amount, p.currency
            FROM interpreter_payables p
            LEFT JOIN interpreter_payout_items existing ON existing.payable_id = p.id
            WHERE p.status IN ('draft', 'approved')
              AND p.period_start >= $2
              AND p.period_end <= $3
              AND p.currency = $4
              AND ($5::text IS NULL OR p.tenant_id = $5)
              AND existing.id IS NULL`,
            [batchId, input.periodStart, input.periodEnd, currency, input.tenantId || null]
        );

        const total = await client.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM interpreter_payout_items
             WHERE payout_batch_id = $1`,
            [batchId]
        );

        const updated = await client.query(
            `UPDATE interpreter_payout_batches
             SET total_amount = $2
             WHERE id = $1
             RETURNING *`,
            [batchId, total.rows[0].total]
        );
        return updated.rows[0];
    });

    if (batch) {
        await logBillingEvent('interpreter_payout_batch_created', 'interpreter_payout_batch', batch.id, {
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            totalAmount: batch.total_amount,
        }, input.createdBy || null);
        return mapGenericJson(batch);
    }
    return null;
}

export async function approvePayoutBatch(
    batchId: string,
    approvedBy?: string
): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const batch = await billingDb.transaction(async (client) => {
        const updated = await client.query(
            `UPDATE interpreter_payout_batches
             SET status = 'approved',
                 approved_by = $2,
                 approved_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [batchId, approvedBy || null]
        );
        if (!updated.rows[0]) return null;

        await client.query(
            `UPDATE interpreter_payables p
             SET status = 'approved',
                 approved_by = COALESCE(p.approved_by, $2),
                 approved_at = COALESCE(p.approved_at, NOW())
             FROM interpreter_payout_items item
             WHERE item.payable_id = p.id
               AND item.payout_batch_id = $1`,
            [batchId, approvedBy || null]
        );
        return updated.rows[0];
    });

    if (batch) {
        await logBillingEvent('interpreter_payout_batch_approved', 'interpreter_payout_batch', batchId, {}, approvedBy || null);
        return mapGenericJson(batch);
    }
    return null;
}

export async function markPayoutBatchPaid(
    batchId: string,
    paidBy?: string
): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const batch = await billingDb.transaction(async (client) => {
        const updated = await client.query(
            `UPDATE interpreter_payout_batches
             SET status = 'paid',
                 paid_at = NOW(),
                 paid_by = $2
             WHERE id = $1
             RETURNING *`,
            [batchId, paidBy || null]
        );
        if (!updated.rows[0]) return null;

        await client.query(
            `UPDATE interpreter_payables p
             SET status = 'paid',
                 paid_at = NOW(),
                 paid_by = $2
             FROM interpreter_payout_items item
             WHERE item.payable_id = p.id
               AND item.payout_batch_id = $1`,
            [batchId, paidBy || null]
        );
        return updated.rows[0];
    });

    if (batch) {
        await logBillingEvent('interpreter_payout_batch_paid', 'interpreter_payout_batch', batchId, {}, paidBy || null);
        return mapGenericJson(batch);
    }
    return null;
}

export async function exportPayoutBatchCsv(
    batchId: string,
    exportedBy?: string
): Promise<string | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `SELECT b.id AS batch_id, b.period_start, b.period_end, b.status AS batch_status,
                item.interpreter_id, item.amount, item.currency,
                p.call_id, p.service_mode, p.language_pair, p.payable_minutes, p.rate_amount,
                p.status AS payable_status
         FROM interpreter_payout_batches b
         JOIN interpreter_payout_items item ON item.payout_batch_id = b.id
         JOIN interpreter_payables p ON p.id = item.payable_id
         WHERE b.id = $1
         ORDER BY item.interpreter_id, p.created_at`,
        [batchId]
    );

    await billingDb.query(
        `UPDATE interpreter_payout_batches
         SET exported_at = NOW(), exported_by = $2
         WHERE id = $1`,
        [batchId, exportedBy || null]
    );

    const lines = [
        'batch_id,period_start,period_end,batch_status,interpreter_id,call_id,service_mode,language_pair,payable_minutes,rate_amount,amount,currency,payable_status',
        ...result.rows.map((row: Record<string, unknown>) => [
            row.batch_id,
            row.period_start,
            row.period_end,
            row.batch_status,
            row.interpreter_id,
            row.call_id || '',
            row.service_mode,
            row.language_pair || '',
            row.payable_minutes,
            row.rate_amount,
            row.amount,
            row.currency,
            row.payable_status,
        ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ];

    await logBillingEvent('interpreter_payout_batch_exported', 'interpreter_payout_batch', batchId, {
        rowCount: result.rows.length,
    }, exportedBy || null);

    return `${lines.join('\n')}\n`;
}

export async function listPayoutBatches(filters: {
    tenantId?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
}): Promise<Record<string, unknown>[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

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
        `SELECT * FROM interpreter_payout_batches ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
    );
    return result.rows.map(mapGenericJson);
}

export async function createContractorInvoice(input: {
    interpreterId: string;
    periodStart: string;
    periodEnd: string;
    tenantId?: string;
    currency?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const currency = (input.currency || 'USD').toUpperCase();
    const invoice = await billingDb.transaction(async (client) => {
        const payables = await client.query(
            `SELECT p.*
             FROM interpreter_payables p
             LEFT JOIN interpreter_contractor_invoice_items existing ON existing.payable_id = p.id
             WHERE p.interpreter_id = $1
               AND p.status IN ('draft', 'approved')
               AND p.period_start >= $2
               AND p.period_end <= $3
               AND p.currency = $4
               AND ($5::text IS NULL OR p.tenant_id = $5)
               AND existing.id IS NULL
             ORDER BY p.period_start, p.created_at`,
            [input.interpreterId, input.periodStart, input.periodEnd, currency, input.tenantId || null]
        );
        const subtotal = payables.rows.reduce(
            (sum, row: Record<string, unknown>) => sum + parseFloat(row.total_amount as string),
            0
        );
        const invoiceNumber = `TERP-${Date.now()}-${input.interpreterId.slice(0, 8)}`;
        const inserted = await client.query(
            `INSERT INTO interpreter_contractor_invoices (
                interpreter_id, tenant_id, invoice_number, period_start, period_end,
                subtotal, adjustments, total, currency, status, created_by, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, 0, $6, $7, 'draft', $8, $9)
            RETURNING *`,
            [
                input.interpreterId,
                input.tenantId || null,
                invoiceNumber,
                input.periodStart,
                input.periodEnd,
                subtotal,
                currency,
                input.createdBy || null,
                JSON.stringify(input.metadata || {}),
            ]
        );
        const invoiceId = inserted.rows[0].id;

        for (const payable of payables.rows) {
            await client.query(
                `INSERT INTO interpreter_contractor_invoice_items (
                    contractor_invoice_id, payable_id, description, amount, currency, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (payable_id) DO NOTHING`,
                [
                    invoiceId,
                    payable.id,
                    `${payable.service_mode || 'service'} ${payable.language_pair || ''} minutes`,
                    payable.total_amount,
                    payable.currency,
                    JSON.stringify({ callId: payable.call_id || null }),
                ]
            );
        }

        return inserted.rows[0];
    });

    if (invoice) {
        await logBillingEvent('interpreter_contractor_invoice_created', 'interpreter_contractor_invoice', invoice.id, {
            interpreterId: input.interpreterId,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            total: invoice.total,
        }, input.createdBy || null);
        return mapGenericJson(invoice);
    }
    return null;
}

export async function listContractorInvoices(filters: {
    interpreterId?: string;
    tenantId?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
}): Promise<Record<string, unknown>[]> {
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
        `SELECT * FROM interpreter_contractor_invoices ${where}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        params
    );
    return result.rows.map(mapGenericJson);
}

export async function generateWeeklyUtilizationSummary(input: {
    interpreterId: string;
    weekStart: string;
    tenantId?: string;
}): Promise<InterpreterUtilizationSummary | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const start = new Date(`${input.weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);

    const schedule = await listScheduleWindows({
        interpreterId: input.interpreterId,
        tenantId: input.tenantId,
        fromDate: start.toISOString(),
        toDate: end.toISOString(),
        limit: 500,
    });
    const availability = await billingDb.query(
        `SELECT * FROM interpreter_availability_sessions
         WHERE interpreter_id = $1
           AND ($2::text IS NULL OR tenant_id = $2)
           AND started_at < $4
           AND COALESCE(ended_at, $4) >= $3`,
        [input.interpreterId, input.tenantId || null, start.toISOString(), end.toISOString()]
    );
    const breaks = await billingDb.query(
        `SELECT * FROM interpreter_break_sessions
         WHERE interpreter_id = $1
           AND ($2::text IS NULL OR tenant_id = $2)
           AND started_at < $4
           AND COALESCE(ended_at, $4) >= $3`,
        [input.interpreterId, input.tenantId || null, start.toISOString(), end.toISOString()]
    );

    const scheduledMinutes = schedule.reduce((sum, item) => sum + overlapMinutes(item.startsAt, item.endsAt, start, end), 0);
    let signedOnMinutes = 0;
    let availableMinutes = 0;
    let inCallMinutes = 0;

    for (const row of availability.rows) {
        const status = String(row.status || '').toLowerCase();
        const minutes = overlapMinutes(
            new Date(row.started_at as string),
            row.ended_at ? new Date(row.ended_at as string) : end,
            start,
            end
        );
        if (status !== 'offline') signedOnMinutes += minutes;
        if (status === 'active' || status === 'available') availableMinutes += minutes;
        if (status === 'busy' || status === 'in_call' || status === 'in-call') inCallMinutes += minutes;
    }

    const breakMinutes = breaks.rows.reduce((sum, row) => sum + overlapMinutes(
        new Date(row.started_at as string),
        row.ended_at ? new Date(row.ended_at as string) : end,
        start,
        end
    ), 0);
    const idleMinutes = Math.max(availableMinutes - inCallMinutes, 0);
    const utilizationRate = scheduledMinutes > 0
        ? Math.round((inCallMinutes / scheduledMinutes) * 10000) / 10000
        : 0;

    const result = await billingDb.query(
        `INSERT INTO interpreter_utilization_summaries (
            interpreter_id, tenant_id, week_start, scheduled_minutes, signed_on_minutes,
            available_minutes, in_call_minutes, break_minutes, idle_minutes,
            utilization_rate, metadata, generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (interpreter_id, tenant_id, week_start)
        DO UPDATE SET
            scheduled_minutes = EXCLUDED.scheduled_minutes,
            signed_on_minutes = EXCLUDED.signed_on_minutes,
            available_minutes = EXCLUDED.available_minutes,
            in_call_minutes = EXCLUDED.in_call_minutes,
            break_minutes = EXCLUDED.break_minutes,
            idle_minutes = EXCLUDED.idle_minutes,
            utilization_rate = EXCLUDED.utilization_rate,
            metadata = EXCLUDED.metadata,
            generated_at = NOW()
        RETURNING *`,
        [
            input.interpreterId,
            input.tenantId || null,
            input.weekStart,
            Math.round(scheduledMinutes),
            Math.round(signedOnMinutes),
            Math.round(availableMinutes),
            Math.round(inCallMinutes),
            Math.round(breakMinutes),
            Math.round(idleMinutes),
            utilizationRate,
            JSON.stringify({ generatedBy: 'billing-utilization-rollup' }),
        ]
    );

    return mapUtilizationSummary(result.rows[0]);
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

async function findInterpreterPayRate(input: {
    interpreterId: string;
    tenantId?: string | null;
    serviceMode: string;
    languagePair: string | null;
    date: string;
}): Promise<{
    id: string;
    rateType: string;
    rateAmount: number;
    currency: string;
    minimumMinutes: number;
} | null> {
    const result = await billingDb.query(
        `SELECT *
         FROM interpreter_pay_rates
         WHERE interpreter_id = $1
           AND service_mode = $2
           AND (tenant_id IS NULL OR tenant_id = $3)
           AND (language_pair IS NULL OR language_pair = $4)
           AND effective_from <= $5
           AND (effective_to IS NULL OR effective_to >= $5)
         ORDER BY
           CASE WHEN tenant_id = $3 THEN 1 ELSE 0 END DESC,
           CASE WHEN language_pair = $4 THEN 1 ELSE 0 END DESC,
           effective_from DESC
         LIMIT 1`,
        [
            input.interpreterId,
            input.serviceMode,
            input.tenantId || null,
            input.languagePair || null,
            input.date,
        ]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
        id: row.id as string,
        rateType: row.rate_type as string,
        rateAmount: parseFloat(row.rate_amount as string),
        currency: row.currency as string,
        minimumMinutes: Number(row.minimum_minutes || 0),
    };
}

function normalizeLanguagePair(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'ASL' || normalized === 'ASL/EN' || normalized === 'ASL-ENGLISH') {
        return 'ASL-EN';
    }
    return normalized;
}

function overlapMinutes(rawStart: Date, rawEnd: Date, windowStart: Date, windowEnd: Date): number {
    const start = Math.max(rawStart.getTime(), windowStart.getTime());
    const end = Math.min(rawEnd.getTime(), windowEnd.getTime());
    if (end <= start) return 0;
    return (end - start) / 60000;
}

function mapGenericJson(row: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        mapped[key] = key === 'metadata' ? parseMetadata(value) : value;
    }
    return mapped;
}
