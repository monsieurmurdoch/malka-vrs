#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const queueRequire = createRequire(pathToFileURL(path.join(repoRoot, 'vrs-server', 'database.js')));
const queueDb = queueRequire(path.join(repoRoot, 'vrs-server', 'database.js'));
const bcrypt = queueRequire('bcryptjs');
const { v4: uuidv4 } = queueRequire('uuid');
const { Pool } = queueRequire('pg');

const databaseUrl = process.env.DATABASE_URL || '';
const opsDatabaseUrl = process.env.OPS_DATABASE_URL || databaseUrl;

const mapleClient = {
  email: process.env.MAPLE_VRI_CLIENT_EMAIL || 'vri.client@maplecomm.example',
  name: process.env.MAPLE_VRI_CLIENT_NAME || 'Maple VRI Client',
  organization: process.env.MAPLE_VRI_ORGANIZATION || 'Maple Corporate Pilot',
  password: process.env.MAPLE_VRI_CLIENT_PASSWORD || 'Client123!'
};

const mapleVrsClient = {
  email: process.env.MAPLE_VRS_TEST_CLIENT_EMAIL || 'vrs.client@maple.example',
  name: process.env.MAPLE_VRS_TEST_CLIENT_NAME || 'Maple VRS Test Client',
  organization: process.env.MAPLE_VRI_ORGANIZATION || 'Maple Corporate Pilot',
  password: process.env.MAPLE_VRS_TEST_CLIENT_PASSWORD || 'Client123!',
  phoneNumber: process.env.MAPLE_VRS_TEST_CLIENT_PHONE || '+15557647001'
};

const mapleInterpreter = {
  email: process.env.MAPLE_VRI_INTERPRETER_EMAIL || 'maya.chen@maple.local',
  languages: ['ASL', 'LSQ', 'English', 'French'],
  name: process.env.MAPLE_VRI_INTERPRETER_NAME || 'Maya Chen',
  password: process.env.MAPLE_VRI_INTERPRETER_PASSWORD || 'Interpreter123!',
  username: process.env.MAPLE_VRI_INTERPRETER_USERNAME || 'maya.chen'
};

const mapleVrsInterpreter = {
  email: process.env.MAPLE_VRS_TEST_INTERPRETER_EMAIL || 'vrs.interpreter@maple.example',
  languages: ['ASL', 'English'],
  name: process.env.MAPLE_VRS_TEST_INTERPRETER_NAME || 'Maple VRS Test Interpreter',
  password: process.env.MAPLE_VRS_TEST_INTERPRETER_PASSWORD || 'Interpreter123!',
  username: process.env.MAPLE_VRS_TEST_INTERPRETER_USERNAME || 'maple.vrs.test'
};

const mapleAdmin = {
  email: process.env.MAPLE_VRI_ADMIN_EMAIL || 'admin@maple.example',
  languages: ['English', 'French', 'ASL', 'LSQ'],
  name: process.env.MAPLE_VRI_ADMIN_NAME || 'Maple VRI Admin',
  password: process.env.MAPLE_VRI_ADMIN_PASSWORD || 'MapleAdmin123!',
  username: process.env.MAPLE_VRI_ADMIN_USERNAME || 'mapleadmin'
};

function now() {
  return new Date().toISOString();
}

async function q(sql, params = []) {
  return queueDb.pool().query(sql, params);
}

async function ensureClient() {
  let client = await queueDb.getClientByEmail(mapleClient.email);
  if (!client) {
    client = await queueDb.createClient({ ...mapleClient, serviceModes: ['vri'], tenantId: 'maple' });
  } else {
    await queueDb.updateClient(client.id, {
      name: mapleClient.name,
      email: mapleClient.email,
      organization: mapleClient.organization,
      serviceModes: ['vri'],
      tenantId: 'maple'
    });
  }

  await q('DELETE FROM client_phone_numbers WHERE client_id = $1', [client.id]);
  await queueDb.getClientPreferences(client.id);
  return queueDb.getClientByEmail(mapleClient.email);
}

async function ensureVrsTestClient() {
  let client = await queueDb.getClientByEmail(mapleVrsClient.email);
  if (!client) {
    client = await queueDb.createClient({ ...mapleVrsClient, serviceModes: ['vrs'], tenantId: 'maple' });
  } else {
    await queueDb.updateClient(client.id, {
      name: mapleVrsClient.name,
      email: mapleVrsClient.email,
      organization: mapleVrsClient.organization,
      serviceModes: ['vrs'],
      tenantId: 'maple'
    });
  }

  await q('DELETE FROM client_phone_numbers WHERE phone_number = $1 OR client_id = $2', [mapleVrsClient.phoneNumber, client.id]);
  await q(
    `INSERT INTO client_phone_numbers (id, client_id, phone_number, is_primary, active)
     VALUES ($1, $2, $3, true, true)`,
    [uuidv4(), client.id, mapleVrsClient.phoneNumber]
  );
  await queueDb.getClientPreferences(client.id);
  return queueDb.getClientByEmail(mapleVrsClient.email);
}

async function ensureInterpreter() {
  let interpreter = await queueDb.getInterpreterByEmail(mapleInterpreter.email);
  if (!interpreter) {
    interpreter = await queueDb.createInterpreter({ ...mapleInterpreter, serviceModes: ['vri'], tenantId: 'maple' });
  }

  await queueDb.updateInterpreter(interpreter.id, {
    active: true,
    email: mapleInterpreter.email,
    languages: mapleInterpreter.languages,
    name: mapleInterpreter.name,
    serviceModes: ['vri'],
    tenantId: 'maple'
  });
  await q('UPDATE interpreters SET status = $1, last_active = NOW() WHERE id = $2', ['online', interpreter.id]);
  return queueDb.getInterpreterByEmail(mapleInterpreter.email);
}

async function ensureVrsTestInterpreter() {
  let interpreter = await queueDb.getInterpreterByEmail(mapleVrsInterpreter.email);
  if (!interpreter) {
    interpreter = await queueDb.createInterpreter({ ...mapleVrsInterpreter, serviceModes: ['vrs'], tenantId: 'maple' });
  }

  await queueDb.updateInterpreter(interpreter.id, {
    active: true,
    email: mapleVrsInterpreter.email,
    languages: mapleVrsInterpreter.languages,
    name: mapleVrsInterpreter.name,
    serviceModes: ['vrs'],
    tenantId: 'maple'
  });
  return queueDb.getInterpreterByEmail(mapleVrsInterpreter.email);
}

async function ensureOpsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ops_accounts (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'captioner', 'interpreter', 'superadmin')),
      password_hash TEXT NOT NULL,
      languages JSONB NOT NULL DEFAULT '["ASL"]',
      service_modes JSONB NOT NULL DEFAULT '["vrs"]',
      permissions JSONB NOT NULL DEFAULT '[]',
      tenant_id TEXT NOT NULL DEFAULT 'malka',
      organization TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT true,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS ops_audit (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function upsertOpsAccount(pool, account) {
  const passwordHash = bcrypt.hashSync(account.password, 10);
  await pool.query(`
    INSERT INTO ops_accounts (
      id, username, email, name, role, password_hash, languages,
      service_modes, permissions, tenant_id, organization, active,
      created_at, last_login_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, 'maple',
      'Maple Communications Group', true, NOW(), NOW())
    ON CONFLICT (username) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      languages = EXCLUDED.languages,
      service_modes = EXCLUDED.service_modes,
      permissions = EXCLUDED.permissions,
      tenant_id = EXCLUDED.tenant_id,
      organization = EXCLUDED.organization,
      active = true
  `, [
    uuidv4(),
    account.username,
    account.email,
    account.name,
    account.role,
    passwordHash,
    JSON.stringify(account.languages),
    JSON.stringify(account.serviceModes || ['vri']),
    JSON.stringify(account.permissions)
  ]);
}

async function ensureOpsAccounts() {
  if (!opsDatabaseUrl) {
    return { storage: 'skipped', reason: 'OPS_DATABASE_URL or DATABASE_URL not set' };
  }

  const pool = new Pool({ connectionString: opsDatabaseUrl });
  try {
    await ensureOpsSchema(pool);
    await upsertOpsAccount(pool, {
      ...mapleAdmin,
      permissions: ['tenant:maple', 'calls:moderate', 'interpreters:manage', 'vri:manage'],
      role: 'admin'
    });
    await upsertOpsAccount(pool, {
      ...mapleInterpreter,
      permissions: ['tenant:maple', 'vri:interpret'],
      role: 'interpreter'
    });
    await upsertOpsAccount(pool, {
      ...mapleVrsInterpreter,
      permissions: ['tenant:maple', 'vrs:interpret'],
      role: 'interpreter',
      serviceModes: ['vrs']
    });
    await pool.query(
      'INSERT INTO ops_audit (id, event, details, created_at) VALUES ($1, $2, $3::jsonb, $4)',
      [
        uuidv4(),
        'maple_vri_demo_seeded',
        JSON.stringify({
          admin: mapleAdmin.username,
          interpreter: mapleInterpreter.username,
          tenantId: 'maple'
        }),
        now()
      ]
    );
    return { storage: 'postgres' };
  } finally {
    await pool.end();
  }
}

async function main() {
  await queueDb.initialize();
  const client = await ensureClient();
  const vrsClient = await ensureVrsTestClient();
  const interpreter = await ensureInterpreter();
  const vrsInterpreter = await ensureVrsTestInterpreter();
  const ops = await ensureOpsAccounts();

  await queueDb.logActivity('maple_vri_demo_seeded', 'Maple VRI demo accounts ensured', {
    clientEmail: mapleClient.email,
    interpreterEmail: mapleInterpreter.email,
    tenantId: 'maple'
  }, 'seed-maple-vri-demo');

  console.log(JSON.stringify({
    credentials: {
      client: { email: mapleClient.email, password: mapleClient.password },
      vrsTestClient: { email: mapleVrsClient.email, password: mapleVrsClient.password, phoneNumber: mapleVrsClient.phoneNumber },
      interpreter: { password: mapleInterpreter.password, username: mapleInterpreter.username },
      vrsTestInterpreter: { password: mapleVrsInterpreter.password, username: mapleVrsInterpreter.username },
      mapleAdmin: { password: mapleAdmin.password, username: mapleAdmin.username }
    },
    client: { email: client.email, id: client.id, name: client.name },
    vrsTestClient: { email: vrsClient.email, id: vrsClient.id, name: vrsClient.name },
    interpreter: { email: interpreter.email, id: interpreter.id, name: interpreter.name },
    vrsTestInterpreter: { email: vrsInterpreter.email, id: vrsInterpreter.id, name: vrsInterpreter.name },
    ops,
    success: true
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
