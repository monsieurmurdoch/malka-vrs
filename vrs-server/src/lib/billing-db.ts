/**
 * Billing Database — PostgreSQL Connection Pool
 *
 * Manages a singleton pg.Pool for the billing subsystem.
 * If billing is not enabled (no BILLING_PG_HOST), all operations
 * resolve immediately as no-ops.
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { loadBillingConfig } from '../billing/config';
import { createModuleLogger } from './logger';

const log = createModuleLogger('billing-db');

let pool: Pool | null = null;
let initialized = false;

export function isBillingDbReady(): boolean {
    return initialized && pool !== null;
}

/**
 * Initialize the PostgreSQL connection pool and run pending migrations.
 * No-op if billing is not enabled.
 */
export async function initialize(): Promise<void> {
    const config = loadBillingConfig();
    if (!config.enabled) {
        log.info('Billing not configured; skipping billing database initialization');
        return;
    }

    pool = new Pool({
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        max: config.postgres.poolMax,
        ssl: config.postgres.ssl ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
        log.error({ err }, 'Unexpected billing pool error');
    });

    // Verify connection
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        log.info('Connected to PostgreSQL billing database');
    } finally {
        client.release();
    }

    // Run migrations
    const { runMigrations } = require('../billing/migration-runner');
    await runMigrations(pool);

    initialized = true;
}

/**
 * Gracefully shut down the pool.
 */
export async function shutdown(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        initialized = false;
        log.info('Billing database pool closed');
    }
}

/**
 * Execute a parameterized query. Returns the full pg QueryResult.
 * No-op (returns empty rows) if billing is not enabled.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    if (!pool) {
        return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult<T>;
    }
    return pool.query<T>(sql, params);
}

/**
 * Acquire a client from the pool for multi-statement transactions.
 * No-op (returns null) if billing is not enabled.
 */
export async function getClient(): Promise<PoolClient | null> {
    if (!pool) return null;
    return pool.connect();
}

/**
 * Execute a callback within a transaction.
 * Automatically BEGIN, COMMIT on success, ROLLBACK on error.
 * No-op if billing is not enabled.
 */
export async function transaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T | null> {
    if (!pool) return null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
