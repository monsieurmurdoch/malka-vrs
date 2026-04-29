#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const serverRequire = createRequire(pathToFileURL(path.join(repoRoot, 'vrs-server', 'database.js')));
const bcrypt = serverRequire('bcryptjs');
const { Pool } = serverRequire('pg');
const { v4: uuidv4 } = serverRequire('uuid');

const databaseUrl = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL || '';
const opsDatabaseUrl = process.env.OPS_DATABASE_URL || process.env.OPS_MIGRATION_DATABASE_URL || databaseUrl;

if (!databaseUrl) {
  console.error('DATABASE_URL or MIGRATION_DATABASE_URL is required.');
  process.exit(1);
}

const tenants = [
  {
    admin: {
      email: 'admin@malkacomm.example',
      name: 'Malka Demo Admin',
      password: 'Admin123!',
      permissions: ['tenant:malka', 'calls:moderate', 'interpreters:manage', 'vrs:manage', 'vri:manage'],
      username: 'malka.admin'
    },
    captioner: {
      email: 'malka.captioner@malkacomm.example',
      languages: ['English', 'ASL'],
      name: 'Malka Demo Captioner',
      password: 'Captioner123!'
    },
    client: {
      email: 'malka.client@malkacomm.example',
      name: 'Malka Demo Client',
      organization: 'Malka Demo',
      password: 'Client123!',
      phoneNumber: '+15557647101',
      serviceModes: ['vrs']
    },
    interpreter: {
      email: 'malka.interpreter@malkacomm.example',
      languages: ['ASL', 'English'],
      name: 'Malka Demo Interpreter',
      password: 'Interpreter123!',
      serviceModes: ['vrs'],
      username: 'malka.interpreter'
    },
    tenantId: 'malka'
  },
  {
    admin: {
      email: 'admin@maplecomm.example',
      name: 'Maple Demo Admin',
      password: 'MapleAdmin123!',
      permissions: ['tenant:maple', 'calls:moderate', 'interpreters:manage', 'vri:manage'],
      username: 'maple.admin'
    },
    captioner: {
      email: 'maple.captioner@maplecomm.example',
      languages: ['English', 'French', 'ASL', 'LSQ'],
      name: 'Maple Demo Captioner',
      password: 'Captioner123!'
    },
    client: {
      aliases: ['vri.client@maple.example'],
      email: 'vri.client@maplecomm.example',
      name: 'Maple VRI Client',
      organization: 'Maple Corporate Pilot',
      password: 'Client123!',
      serviceModes: ['vri']
    },
    interpreter: {
      aliases: ['maya.chen@maple.local'],
      email: 'maple.interpreter@maplecomm.example',
      languages: ['ASL', 'LSQ', 'English', 'French'],
      name: 'Maple Demo Interpreter',
      password: 'Interpreter123!',
      serviceModes: ['vri'],
      username: 'maple.interpreter'
    },
    tenantId: 'maple'
  }
];

const sharedClientAccounts = [
  {
    email: 'ruthie@malkacomm.com',
    name: 'Ruthie Demo Client',
    organization: 'Malka Communications',
    password: 'demo123'
  },
  {
    email: 'nataly.malka@gmail.com',
    name: 'Nataly Malka',
    organization: 'Malka Communications',
    password: 'demo123'
  }
];

const sharedInterpreterAccounts = [
  {
    email: 'ruthie@malkacomm.com',
    languages: ['ASL', 'English'],
    name: 'Ruthie Demo Interpreter',
    password: 'demo123'
  }
];

function json(value) {
  return JSON.stringify(value);
}

async function ensureClient(pool, tenantId, account) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  const emails = [account.email, ...(account.aliases || [])];

  for (const email of emails) {
    const id = uuidv4();
    const result = await pool.query(`
      INSERT INTO clients (id, name, email, password_hash, organization, service_modes, tenant_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      ON CONFLICT (tenant_id, email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        organization = EXCLUDED.organization,
        service_modes = EXCLUDED.service_modes,
        tenant_id = EXCLUDED.tenant_id
      RETURNING id, email
    `, [id, account.name, email, passwordHash, account.organization, json(account.serviceModes), tenantId]);

    const clientId = result.rows[0].id;
    if (account.phoneNumber && email === account.email) {
      await pool.query('DELETE FROM client_phone_numbers WHERE phone_number = $1 OR client_id = $2', [account.phoneNumber, clientId]);
      await pool.query(
        'INSERT INTO client_phone_numbers (id, client_id, phone_number, is_primary) VALUES ($1, $2, $3, true)',
        [uuidv4(), clientId, account.phoneNumber]
      );
    } else {
      await pool.query('DELETE FROM client_phone_numbers WHERE client_id = $1', [clientId]);
    }
  }
}

async function ensureInterpreter(pool, tenantId, account) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  const emails = [account.email, ...(account.aliases || [])];

  for (const email of emails) {
    await pool.query(`
      INSERT INTO interpreters (id, name, email, password_hash, languages, active, service_modes, tenant_id)
      VALUES ($1, $2, $3, $4, $5::jsonb, true, $6::jsonb, $7)
      ON CONFLICT (tenant_id, email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        languages = EXCLUDED.languages,
        active = true,
        service_modes = EXCLUDED.service_modes,
        tenant_id = EXCLUDED.tenant_id
    `, [uuidv4(), account.name, email, passwordHash, json(account.languages), json(account.serviceModes), tenantId]);
  }
}

async function ensureCaptioner(pool, account) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  await pool.query(`
    INSERT INTO captioners (id, name, email, password_hash, languages, active)
    VALUES ($1, $2, $3, $4, $5::jsonb, true)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash,
      languages = EXCLUDED.languages,
      active = true
  `, [uuidv4(), account.name, account.email, passwordHash, json(account.languages)]);
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
  `);
}

async function ensureOpsAccount(pool, tenantId, role, account, serviceModes) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  await pool.query(`
    INSERT INTO ops_accounts (
      id, username, email, name, role, password_hash, languages,
      service_modes, permissions, tenant_id, organization, active,
      created_at, last_login_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, true, NOW(), NOW())
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
    role,
    passwordHash,
    json(account.languages || ['ASL']),
    json(serviceModes),
    json(account.permissions || []),
    tenantId,
    tenantId === 'maple' ? 'Maple Communications Group' : 'Malka Communications Group'
  ]);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const opsPool = new Pool({ connectionString: opsDatabaseUrl });

  try {
    await ensureOpsSchema(opsPool);

    for (const tenant of tenants) {
      await ensureClient(pool, tenant.tenantId, tenant.client);
      for (const client of sharedClientAccounts) {
        await ensureClient(pool, tenant.tenantId, {
          ...client,
          organization: tenant.tenantId === 'maple' ? 'Maple Corporate Pilot' : client.organization,
          serviceModes: tenant.tenantId === 'maple' ? ['vri'] : ['vrs']
        });
      }
      await ensureInterpreter(pool, tenant.tenantId, tenant.interpreter);
      for (const interpreter of sharedInterpreterAccounts) {
        await ensureInterpreter(pool, tenant.tenantId, {
          ...interpreter,
          serviceModes: tenant.tenantId === 'maple' ? ['vri'] : ['vrs']
        });
      }
      await ensureCaptioner(pool, tenant.captioner);
      await ensureOpsAccount(opsPool, tenant.tenantId, 'admin', tenant.admin, tenant.tenantId === 'maple' ? ['vri'] : ['vrs']);
      await ensureOpsAccount(opsPool, tenant.tenantId, 'interpreter', tenant.interpreter, tenant.interpreter.serviceModes);
      await ensureOpsAccount(opsPool, tenant.tenantId, 'captioner', {
        ...tenant.captioner,
        username: `${tenant.tenantId}.captioner`
      }, tenant.tenantId === 'maple' ? ['vri'] : ['vrs']);
    }

    console.log(JSON.stringify({
      accounts: tenants.map(tenant => ({
        admin: { password: tenant.admin.password, username: tenant.admin.username },
        captioner: { email: tenant.captioner.email, password: tenant.captioner.password },
        client: { email: tenant.client.email, password: tenant.client.password },
        interpreter: { email: tenant.interpreter.email, password: tenant.interpreter.password, username: tenant.interpreter.username },
        sharedClients: sharedClientAccounts.map(account => ({ email: account.email, password: account.password })),
        sharedInterpreters: sharedInterpreterAccounts.map(account => ({ email: account.email, password: account.password })),
        tenantId: tenant.tenantId
      })),
      success: true
    }, null, 2));
  } finally {
    await pool.end();
    await opsPool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
