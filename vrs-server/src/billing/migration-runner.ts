/**
 * PostgreSQL Migration Runner
 *
 * Applies numbered SQL migration files in order.
 * Tracks applied migrations in a schema_migrations table.
 */

import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version   INTEGER PRIMARY KEY,
            name      TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getAppliedVersions(pool: Pool): Promise<Set<number>> {
    const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
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
    await ensureMigrationsTable(pool);
    const applied = await getAppliedVersions(pool);
    const available = discoverMigrations();

    const pending = Array.from(available.entries())
        .filter(([version]) => !applied.has(version))
        .sort(([a], [b]) => a - b);

    if (pending.length === 0) {
        console.log('[BillingDB] All migrations already applied.');
        return;
    }

    for (const [version, { name, file }] of pending) {
        console.log(`[BillingDB] Applying migration ${version}: ${name}`);
        const sql = fs.readFileSync(file, 'utf8');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
                [version, name]
            );
            await client.query('COMMIT');
            console.log(`[BillingDB] Migration ${version} applied successfully.`);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[BillingDB] Migration ${version} failed:`, err);
            throw err;
        } finally {
            client.release();
        }
    }

    console.log(`[BillingDB] ${pending.length} migration(s) applied.`);
}
