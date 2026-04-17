/**
 * Rate Tier Service
 *
 * Manages per-minute rate tiers for VRS (FCC-mandated) and VRI (contracted).
 * Each CDR resolves its rate at creation time from the active tier.
 */

import * as billingDb from '../lib/billing-db';
import { loadBillingConfig, type CallType } from './config';
import type { RateTier, CreateRateTierInput } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Resolve the effective per-minute rate for a call type at a given date.
 * Falls back to the configured default if no active tier is found.
 */
export async function getEffectiveRate(
    callType: CallType,
    date: Date = new Date()
): Promise<{ rateTierId: string | null; perMinuteRate: number }> {
    const config = loadBillingConfig();
    const defaultRate = callType === 'vrs'
        ? config.rates.defaultVrsRatePerMinute
        : config.rates.defaultVriRatePerMinute;

    if (!billingDb.isBillingDbReady()) {
        return { rateTierId: null, perMinuteRate: defaultRate };
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
