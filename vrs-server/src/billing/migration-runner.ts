/**
 * PostgreSQL Migration Runner
 *
 * Applies numbered SQL migration files in order.
 * Tracks applied migrations in a schema_migrations table.
 */

import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';
import { moduleLogger } from '../lib/logger';

const log = moduleLogger('billing-migrations');

const MIGRATIONS_DIR = fs.existsSync(path.join(__dirname, 'migrations'))
    ? path.join(__dirname, 'migrations')
    : path.join(__dirname, '../../src/billing/migrations');
const MIGRATION_LOCK_ID = 77200042;
const MIGRATIONS_TABLE = 'billing_schema_migrations';

async function ensureMigrationsTable(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
            version   INTEGER PRIMARY KEY,
            name      TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getAppliedVersions(pool: Pool): Promise<Set<number>> {
    const result = await pool.query(`SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`);
    return new Set(result.rows.map((r: { version: number }) => r.version));
}

function discoverMigrations(): Map<number, { name: string; file: string }> {
    const migrations = new Map<number, { name: string; file: string }>();

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return migrations;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR).sort();
    for (const file of files) {
        const match = /^(\d+)_(.+)\.sql$/.exec(file);
        if (match) {
            const version = parseInt(match[1], 10);
            const name = match[2];
            migrations.set(version, { name, file: path.join(MIGRATIONS_DIR, file) });
        }
    }

    return migrations;
}

export async function runMigrations(pool: Pool): Promise<void> {
    const lockClient = await pool.connect();

    try {
        await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

        await ensureMigrationsTable(pool);
        const applied = await getAppliedVersions(pool);
        const available = discoverMigrations();

        const pending = Array.from(available.entries())
            .filter(([version]) => !applied.has(version))
            .sort(([a], [b]) => a - b);

        if (pending.length === 0) {
            log.info('billing_migrations_already_applied');
            return;
        }

        for (const [version, { name, file }] of pending) {
            log.info({ name, version }, 'billing_migration_applying');
            const sql = fs.readFileSync(file, 'utf8');

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    `INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES ($1, $2)`,
                    [version, name]
                );
                await client.query('COMMIT');
                log.info({ name, version }, 'billing_migration_applied');
            } catch (err) {
                await client.query('ROLLBACK');
                log.error({ err, name, version }, 'billing_migration_failed');
                throw err;
            } finally {
                client.release();
            }
        }

        log.info({ count: pending.length }, 'billing_migrations_applied');
    } finally {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
        lockClient.release();
    }
}
