/**
 * Rate Tier Service
 *
 * Manages per-minute rate tiers for VRS (FCC-mandated) and VRI (contracted).
 * Each CDR resolves its rate at creation time from the active tier.
 */

import * as billingDb from '../lib/billing-db';
import { loadBillingConfig, type CallType } from './config';
import type {
    BillingRateTemplate,
    CreateRateTierInput,
    CreateVriRateOverrideInput,
    RateLookupContext,
    RateTier,
    VriRateOverride,
} from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Resolve the effective per-minute rate for a call type at a given date.
 * Falls back to the configured default if no active tier is found.
 */
export async function getEffectiveRate(
    callType: CallType,
    date: Date = new Date(),
    context: RateLookupContext = {}
): Promise<{ rateTierId: string | null; perMinuteRate: number }> {
    const config = loadBillingConfig();
    const defaultRate = callType === 'vrs'
        ? config.rates.defaultVrsRatePerMinute
        : config.rates.defaultVriRatePerMinute;

    if (!billingDb.isBillingDbReady()) {
        return { rateTierId: null, perMinuteRate: defaultRate };
    }

    if (callType === 'vri') {
        const override = await getEffectiveVriRateOverride(date, context);
        if (override) {
            return { rateTierId: override.id, perMinuteRate: override.perMinuteRate };
        }
    }

    const result = await billingDb.query<{
        id: string;
        per_minute_rate: string;
    }>(
        `SELECT id, per_minute_rate
         FROM billing_rate_tiers
         WHERE call_type = $1
           AND is_active = true
           AND effective_from <= $2
           AND (effective_to IS NULL OR effective_to >= $2)
         ORDER BY effective_from DESC
         LIMIT 1`,
        [callType, date.toISOString().slice(0, 10)]
    );

    if (result.rows.length === 0) {
        return { rateTierId: null, perMinuteRate: defaultRate };
    }

    return {
        rateTierId: result.rows[0].id,
        perMinuteRate: parseFloat(result.rows[0].per_minute_rate),
    };
}

async function getEffectiveVriRateOverride(
    date: Date,
    context: RateLookupContext
): Promise<VriRateOverride | null> {
    const currency = (context.currency || await getCorporateCurrency(context.corporateAccountId) || 'USD').toUpperCase();
    const languagePair = normalizeLanguagePair(context.languagePair);
    const serviceDate = date.toISOString().slice(0, 10);

    const result = await billingDb.query(
        `SELECT *
         FROM vri_rate_overrides
         WHERE service_mode = 'vri'
           AND is_active = true
           AND currency = $1
           AND effective_from <= $2
           AND (effective_to IS NULL OR effective_to >= $2)
           AND (corporate_account_id IS NULL OR corporate_account_id = $3)
           AND (tenant_id IS NULL OR tenant_id = $4)
           AND (language_pair IS NULL OR language_pair = $5)
         ORDER BY
           CASE WHEN corporate_account_id = $3 THEN 1 ELSE 0 END DESC,
           CASE WHEN tenant_id = $4 THEN 1 ELSE 0 END DESC,
           CASE WHEN language_pair = $5 THEN 1 ELSE 0 END DESC,
           effective_from DESC
         LIMIT 1`,
        [
            currency,
            serviceDate,
            context.corporateAccountId || null,
            context.tenantId || null,
            languagePair,
        ]
    );

    return result.rows[0] ? mapVriRateOverride(result.rows[0]) : null;
}

async function getCorporateCurrency(corporateAccountId?: string | null): Promise<string | null> {
    if (!corporateAccountId) return null;
    const result = await billingDb.query(
        'SELECT currency FROM corporate_accounts WHERE id = $1 LIMIT 1',
        [corporateAccountId]
    );
    return result.rows[0]?.currency || null;
}

function normalizeLanguagePair(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'ASL' || normalized === 'ASL/EN' || normalized === 'ASL-ENGLISH') {
        return 'ASL-EN';
    }
    return normalized;
}

/**
 * Create a new rate tier.
 */
export async function createRateTier(input: CreateRateTierInput): Promise<RateTier> {
    const id = uuidv4();

    await billingDb.query(
        `INSERT INTO billing_rate_tiers (id, call_type, label, per_minute_rate, effective_from, effective_to, fcc_order_ref, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            id,
            input.callType,
            input.label,
            input.perMinuteRate,
            input.effectiveFrom,
            input.effectiveTo || null,
            input.fccOrderRef || null,
            input.createdBy || null,
        ]
    );

    return {
        id,
        callType: input.callType,
        label: input.label,
        perMinuteRate: input.perMinuteRate,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo || null,
        fccOrderRef: input.fccOrderRef || null,
        isActive: true,
        createdAt: new Date(),
        createdBy: input.createdBy || null,
    };
}

/**
 * List rate tiers with optional filters.
 */
export async function getRateTiers(filters?: {
    callType?: CallType;
    isActive?: boolean;
}): Promise<RateTier[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.callType) {
        conditions.push(`call_type = $${paramIdx++}`);
        params.push(filters.callType);
    }
    if (filters?.isActive !== undefined) {
        conditions.push(`is_active = $${paramIdx++}`);
        params.push(filters.isActive);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await billingDb.query(
        `SELECT * FROM billing_rate_tiers ${where} ORDER BY effective_from DESC`,
        params
    );

    return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        callType: row.call_type as CallType,
        label: row.label as string,
        perMinuteRate: parseFloat(row.per_minute_rate as string),
        effectiveFrom: row.effective_from as string,
        effectiveTo: row.effective_to as string | null,
        fccOrderRef: row.fcc_order_ref as string | null,
        isActive: row.is_active as boolean,
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    }));
}

/**
 * Soft-deactivate a rate tier.
 */
export async function deactivateRateTier(id: string): Promise<void> {
    await billingDb.query(
        'UPDATE billing_rate_tiers SET is_active = false WHERE id = $1',
        [id]
    );
}

export async function createVriRateOverride(input: CreateVriRateOverrideInput): Promise<VriRateOverride | null> {
    if (!billingDb.isBillingDbReady()) return null;

    const result = await billingDb.query(
        `INSERT INTO vri_rate_overrides (
            corporate_account_id, tenant_id, service_mode, language_pair, currency,
            label, per_minute_rate, effective_from, effective_to, metadata, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
            input.corporateAccountId || null,
            input.tenantId || null,
            input.serviceMode || 'vri',
            normalizeLanguagePair(input.languagePair) || null,
            (input.currency || 'USD').toUpperCase(),
            input.label,
            input.perMinuteRate,
            input.effectiveFrom,
            input.effectiveTo || null,
            JSON.stringify(input.metadata || {}),
            input.createdBy || null,
        ]
    );

    return mapVriRateOverride(result.rows[0]);
}

export async function listVriRateOverrides(filters?: {
    corporateAccountId?: string;
    tenantId?: string;
    currency?: string;
    isActive?: boolean;
}): Promise<VriRateOverride[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.corporateAccountId) {
        conditions.push(`corporate_account_id = $${paramIdx++}`);
        params.push(filters.corporateAccountId);
    }
    if (filters?.tenantId) {
        conditions.push(`tenant_id = $${paramIdx++}`);
        params.push(filters.tenantId);
    }
    if (filters?.currency) {
        conditions.push(`currency = $${paramIdx++}`);
        params.push(filters.currency.toUpperCase());
    }
    if (filters?.isActive !== undefined) {
        conditions.push(`is_active = $${paramIdx++}`);
        params.push(filters.isActive);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await billingDb.query(
        `SELECT * FROM vri_rate_overrides ${where}
         ORDER BY effective_from DESC, created_at DESC`,
        params
    );

    return result.rows.map(mapVriRateOverride);
}

export async function listBillingRateTemplates(filters?: {
    serviceMode?: string;
    currency?: string;
}): Promise<BillingRateTemplate[]> {
    if (!billingDb.isBillingDbReady()) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters?.serviceMode) {
        conditions.push(`service_mode = $${paramIdx++}`);
        params.push(filters.serviceMode);
    }
    if (filters?.currency) {
        conditions.push(`currency = $${paramIdx++}`);
        params.push(filters.currency.toUpperCase());
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await billingDb.query(
        `SELECT * FROM billing_rate_templates ${where}
         ORDER BY service_mode, language_pair, currency`,
        params
    );

    return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        serviceMode: row.service_mode as string,
        languagePair: row.language_pair as string,
        currency: row.currency as string,
        label: row.label as string,
        defaultRate: row.default_rate === null ? null : parseFloat(row.default_rate as string),
        status: row.status as string,
        metadata: parseJson(row.metadata),
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    }));
}

function mapVriRateOverride(row: Record<string, unknown>): VriRateOverride {
    return {
        id: row.id as string,
        corporateAccountId: row.corporate_account_id as string | null,
        tenantId: row.tenant_id as string | null,
        serviceMode: row.service_mode as string,
        languagePair: row.language_pair as string | null,
        currency: row.currency as string,
        label: row.label as string,
        perMinuteRate: parseFloat(row.per_minute_rate as string),
        effectiveFrom: row.effective_from as string,
        effectiveTo: row.effective_to as string | null,
        isActive: row.is_active as boolean,
        metadata: parseJson(row.metadata),
        createdAt: new Date(row.created_at as string),
        createdBy: row.created_by as string | null,
    };
}

function parseJson(value: unknown): Record<string, unknown> {
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
