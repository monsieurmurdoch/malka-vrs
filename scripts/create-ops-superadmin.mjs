#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const opsRequire = createRequire(path.join(repoRoot, 'vrs-ops-server', 'package.json'));
const bcrypt = opsRequire('bcryptjs');

const username = process.env.OPS_SUPERADMIN_USERNAME
  || process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME
  || 'superadmin2';
const password = process.env.OPS_SUPERADMIN_PASSWORD
  || process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD
  || crypto.randomBytes(18).toString('base64url');
const name = process.env.OPS_SUPERADMIN_NAME || 'Malka Superadmin';
const email = process.env.OPS_SUPERADMIN_EMAIL || '';
const stateFile = process.env.OPS_STATE_FILE
  || path.join(repoRoot, 'vrs-ops-server', 'data', 'ops-state.json');
const databaseUrl = process.env.OPS_DATABASE_URL || process.env.DATABASE_URL || '';
const usePostgres = Boolean(databaseUrl || process.env.OPS_PGHOST || process.env.PGHOST);

function nowIso() {
  return new Date().toISOString();
}

function superadminRecord(existing = {}) {
  return {
    active: true,
    createdAt: existing.createdAt || nowIso(),
    createdBy: existing.createdBy || 'superadmin-reset-script',
    email,
    id: existing.id || crypto.randomUUID(),
    languages: ['ASL'],
    lastLoginAt: existing.lastLoginAt || null,
    name,
    organization: 'Malka',
    passwordHash: bcrypt.hashSync(password, 10),
    permissions: [],
    profile: {},
    role: 'superadmin',
    serviceModes: ['vrs', 'vri'],
    tenantId: 'malka',
    username
  };
}

async function upsertPostgres() {
  const { Pool } = opsRequire('pg');
  const pool = new Pool(databaseUrl ? { connectionString: databaseUrl } : {
    database: process.env.OPS_PGDATABASE || process.env.PGDATABASE || 'malka_vrs',
    host: process.env.OPS_PGHOST || process.env.PGHOST || '127.0.0.1',
    password: process.env.OPS_PGPASSWORD || process.env.PGPASSWORD || 'malka',
    port: Number(process.env.OPS_PGPORT || process.env.PGPORT || 5432),
    user: process.env.OPS_PGUSER || process.env.PGUSER || 'malka'
  });

  try {
    const existing = await pool.query(
      'SELECT * FROM ops_accounts WHERE username = $1 OR ($2::text <> \'\' AND email = $2) LIMIT 1',
      [username, email]
    );
    const record = superadminRecord(existing.rows[0] ? {
      createdAt: existing.rows[0].created_at?.toISOString?.() || String(existing.rows[0].created_at || ''),
      createdBy: existing.rows[0].created_by,
      id: existing.rows[0].id,
      lastLoginAt: existing.rows[0].last_login_at?.toISOString?.() || null
    } : {});

    await pool.query(`
      INSERT INTO ops_accounts (
        id, username, email, name, role, password_hash, languages,
        service_modes, permissions, profile, tenant_id, organization, active,
        created_by, created_at, last_login_at
      )
      VALUES ($1, $2, NULLIF($3, ''), $4, 'superadmin', $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, true, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = 'superadmin',
        password_hash = EXCLUDED.password_hash,
        languages = EXCLUDED.languages,
        service_modes = EXCLUDED.service_modes,
        permissions = EXCLUDED.permissions,
        profile = EXCLUDED.profile,
        tenant_id = EXCLUDED.tenant_id,
        organization = EXCLUDED.organization,
        active = true
    `, [
      record.id,
      record.username,
      record.email,
      record.name,
      record.passwordHash,
      JSON.stringify(record.languages),
      JSON.stringify(record.serviceModes),
      JSON.stringify(record.permissions),
      JSON.stringify(record.profile),
      record.tenantId,
      record.organization,
      record.createdBy,
      record.createdAt,
      record.lastLoginAt
    ]);
  } finally {
    await pool.end();
  }
}

function upsertStateFile() {
  const state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    : { accounts: [], audit: [] };

  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const index = accounts.findIndex(account =>
    account.username === username || (email && account.email === email)
  );
  const record = superadminRecord(index >= 0 ? accounts[index] : {});

  if (index >= 0) {
    accounts[index] = record;
  } else {
    accounts.unshift(record);
  }

  state.accounts = accounts;
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.audit.unshift({
    details: {
      role: 'superadmin',
      username
    },
    event: 'superadmin_created_or_reset',
    id: crypto.randomUUID(),
    timestamp: nowIso()
  });

  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

if (usePostgres) {
  await upsertPostgres();
} else {
  upsertStateFile();
}

console.log(`Superadmin ${usePostgres ? 'upserted in Postgres' : `written to ${path.relative(repoRoot, stateFile)}`}.`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
