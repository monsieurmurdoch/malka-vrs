#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const opsStateFile = path.join(repoRoot, 'vrs-ops-server', 'data', 'ops-state.json');
const backupDir = path.join(repoRoot, '.tmp', 'vrs-admin-smoke-backups');
const bootstrapUsername = process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || 'superadmin';
const bootstrapPassword = process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || 'ValidationSuperadmin123';
const bootstrapName = process.env.VRS_BOOTSTRAP_SUPERADMIN_NAME || 'Malka Superadmin';

const queueRequire = createRequire(pathToFileURL(path.join(repoRoot, 'vrs-server', 'database.js')));
const opsRequire = createRequire(pathToFileURL(path.join(repoRoot, 'vrs-ops-server', 'package.json')));
const queueDb = queueRequire(path.join(repoRoot, 'vrs-server', 'database.js'));
const bcrypt = opsRequire('bcryptjs');
const { v4: uuidv4 } = opsRequire('uuid');
const { Pool } = queueRequire('pg');

const opsDatabaseUrl = process.env.OPS_DATABASE_URL || process.env.DATABASE_URL || '';

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoMinutesOffsetFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${stamp}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function buildAccount({
  createdAt,
  createdBy = null,
  email = '',
  languages = ['ASL'],
  lastLoginAt = null,
  name,
  organization = '',
  password,
  permissions = [],
  role,
  serviceModes = ['vrs'],
  tenantId = 'malka',
  username
}) {
  return {
    active: true,
    createdAt,
    createdBy,
    email,
    id: uuidv4(),
    languages,
    lastLoginAt,
    name,
    organization,
    passwordHash: bcrypt.hashSync(password, 10),
    permissions,
    role,
    serviceModes,
    tenantId,
    username
  };
}

function buildAudit(event, timestamp, details) {
  return {
    details,
    event,
    id: uuidv4(),
    timestamp
  };
}

async function query(sql, params = []) {
  return queueDb.pool().query(sql, params);
}

async function resetQueueData() {
  await query(`TRUNCATE TABLE ${[
    'activity_log',
    'queue_requests',
    'calls',
    'client_phone_numbers',
    'speed_dial',
    'interpreter_shifts',
    'interpreter_performance',
    'interpreter_earnings',
    'clients',
    'interpreters',
    'daily_stats'
  ].join(', ')} RESTART IDENTITY CASCADE`);
}

async function seedQueueData() {
  const amina = await queueDb.createInterpreter({
    email: 'amina.hassan@malka.local',
    languages: ['ASL', 'Arabic', 'English'],
    name: 'Amina Hassan',
    password: 'Interpreter123!'
  });
  const omar = await queueDb.createInterpreter({
    email: 'omar.khaled@malka.local',
    languages: ['ASL', 'Arabic'],
    name: 'Omar Khaled',
    password: 'Interpreter123!'
  });
  const mapleVriInterpreter = await queueDb.createInterpreter({
    email: 'maya.chen@maple.local',
    languages: ['ASL', 'LSQ', 'English', 'French'],
    name: 'Maya Chen',
    password: 'Interpreter123!'
  });

  await query('UPDATE interpreters SET last_active = $1, status = $2 WHERE id = $3', [isoMinutesAgo(2), 'online', amina.id]);
  await query('UPDATE interpreters SET last_active = $1, status = $2 WHERE id = $3', [isoMinutesAgo(18), 'offline', omar.id]);
  await query('UPDATE interpreters SET last_active = $1, status = $2 WHERE id = $3', [isoMinutesAgo(1), 'online', mapleVriInterpreter.id]);

  const leila = await queueDb.createClient({
    email: 'leila.mansour@example.com',
    name: 'Leila Mansour',
    organization: 'Personal',
    password: 'Client123!'
  });
  const noor = await queueDb.createClient({
    email: 'noor.alharbi@health.example',
    name: 'Noor Al Harbi',
    organization: 'Gulf Health',
    password: 'Client123!'
  });
  const samir = await queueDb.createClient({
    email: 'samir.rahman@fin.example',
    name: 'Samir Rahman',
    organization: 'MENA Finance',
    password: 'Client123!'
  });
  const mapleVriClient = await queueDb.createClient({
    email: 'vri.client@maple.example',
    name: 'Maple VRI Client',
    organization: 'Maple Corporate Pilot',
    password: 'Client123!'
  });

  const activeCallId = await queueDb.createCall({
    clientId: leila.id,
    interpreterId: amina.id,
    roomName: 'vrs-live-leila-amina',
    language: 'Arabic'
  });
  await query('UPDATE calls SET started_at = $1 WHERE id = $2', [isoMinutesAgo(12), activeCallId]);

  const completedCallToday = await queueDb.createCall({
    clientId: noor.id,
    interpreterId: amina.id,
    roomName: 'vrs-complete-noor-amina',
    language: 'ASL'
  });
  await query('UPDATE calls SET started_at = $1, ended_at = $2, duration_minutes = $3, status = $4 WHERE id = $5', [isoHoursAgo(3), isoHoursAgo(2.5), 28, 'completed', completedCallToday]);

  const completedCallYesterday = await queueDb.createCall({
    clientId: samir.id,
    interpreterId: omar.id,
    roomName: 'vrs-complete-samir-omar',
    language: 'Arabic'
  });
  await query('UPDATE calls SET started_at = $1, ended_at = $2, duration_minutes = $3, status = $4 WHERE id = $5', [isoMinutesOffsetFromNow(-(24 * 60 - 45)), isoMinutesOffsetFromNow(-(24 * 60 - 86)), 41, 'completed', completedCallYesterday]);

  const completedVriCall = await queueDb.createCall({
    clientId: mapleVriClient.id,
    interpreterId: mapleVriInterpreter.id,
    roomName: 'vri-maple-demo-room',
    language: 'LSQ'
  });
  await query(
    'UPDATE calls SET started_at = $1, ended_at = $2, duration_minutes = $3, status = $4, call_type = $5, call_mode = $6 WHERE id = $7',
    [isoMinutesAgo(95), isoMinutesAgo(70), 25, 'completed', 'vri', 'vri', completedVriCall]
  );

  const queueOne = await queueDb.addToQueue({
    clientId: noor.id,
    clientName: 'Noor Al Harbi',
    language: 'Arabic',
    roomName: 'vrs-queue-noor'
  });
  const queueTwo = await queueDb.addToQueue({
    clientId: samir.id,
    clientName: 'Samir Rahman',
    language: 'ASL',
    roomName: 'vrs-queue-samir'
  });

  const vriQueue = await queueDb.addToQueue({
    clientId: mapleVriClient.id,
    clientName: 'Maple VRI Client',
    language: 'LSQ',
    roomName: 'vri-queue-maple-demo'
  });

  await query('UPDATE queue_requests SET created_at = $1, position = $2 WHERE id = $3', [isoMinutesAgo(9), 1, queueOne.id]);
  await query('UPDATE queue_requests SET created_at = $1, position = $2 WHERE id = $3', [isoMinutesAgo(4), 2, queueTwo.id]);
  await query('UPDATE queue_requests SET created_at = $1, position = $2 WHERE id = $3', [isoMinutesAgo(2), 3, vriQueue.id]);

  await queueDb.logActivity('interpreter_created', 'Amina Hassan interpreter profile seeded', { interpreterId: amina.id, seeded: true }, 'seed-script');
  await queueDb.logActivity('client_created', 'Leila Mansour client profile seeded', { clientId: leila.id, seeded: true }, 'seed-script');
  await queueDb.logActivity('call_started', 'Live call in progress for Leila Mansour', { callId: activeCallId, roomName: 'vrs-live-leila-amina' }, 'seed-script');
  await queueDb.logActivity('queue_request_added', 'Noor Al Harbi entered the queue', { clientId: noor.id, requestId: queueOne.id }, 'seed-script');
  await queueDb.logActivity('queue_request_added', 'Samir Rahman entered the queue', { clientId: samir.id, requestId: queueTwo.id }, 'seed-script');
  await queueDb.logActivity('vri_demo_seeded', 'Maple VRI demo profile and interpreter seeded', {
    clientId: mapleVriClient.id,
    interpreterId: mapleVriInterpreter.id,
    callId: completedVriCall,
    requestId: vriQueue.id,
    tenantId: 'maple'
  }, 'seed-script');

  return {
    activeCallId,
    clients: { leila, mapleVriClient, noor, samir },
    interpreters: { amina, mapleVriInterpreter, omar },
    queueRequests: { queueOne, queueTwo, vriQueue }
  };
}

async function ensureOpsPostgresSchema(pool) {
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

async function writeOpsPostgresState(state) {
  if (!opsDatabaseUrl) {
    return false;
  }

  const pool = new Pool({ connectionString: opsDatabaseUrl });
  try {
    await ensureOpsPostgresSchema(pool);
    await pool.query('TRUNCATE TABLE ops_audit, ops_accounts');

    for (const account of state.accounts) {
      await pool.query(`
        INSERT INTO ops_accounts (
          id, username, email, name, role, password_hash, languages,
          service_modes, permissions, tenant_id, organization, active,
          created_by, created_at, last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15)
      `, [
        account.id,
        account.username || null,
        account.email || null,
        account.name,
        account.role,
        account.passwordHash,
        JSON.stringify(account.languages || ['ASL']),
        JSON.stringify(account.serviceModes || ['vrs']),
        JSON.stringify(account.permissions || []),
        account.tenantId || 'malka',
        account.organization || '',
        account.active !== false,
        account.createdBy || null,
        account.createdAt,
        account.lastLoginAt || null
      ]);
    }

    for (const event of state.audit) {
      await pool.query(
        'INSERT INTO ops_audit (id, event, details, created_at) VALUES ($1, $2, $3::jsonb, $4)',
        [event.id, event.event, JSON.stringify(event.details || {}), event.timestamp]
      );
    }
    return true;
  } finally {
    await pool.end();
  }
}

async function seedOpsState() {
  ensureDir(path.dirname(opsStateFile));

  const seededAt = new Date().toISOString();
  const superadmin = buildAccount({
    createdAt: isoDaysAgo(5),
    lastLoginAt: isoMinutesAgo(3),
    name: bootstrapName,
    password: bootstrapPassword,
    role: 'superadmin',
    username: bootstrapUsername
  });
  const opsAdmin = buildAccount({
    createdAt: isoDaysAgo(2),
    email: 'ops.admin@malka.local',
    lastLoginAt: isoHoursAgo(1),
    languages: ['Arabic', 'English'],
    name: 'Operations Admin',
    password: 'Admin123!',
    role: 'admin',
    username: 'opsadmin'
  });
  const mapleAdmin = buildAccount({
    createdAt: isoDaysAgo(1),
    email: 'admin@maple.example',
    lastLoginAt: isoMinutesAgo(14),
    languages: ['English', 'French', 'ASL', 'LSQ'],
    name: 'Maple VRI Admin',
    organization: 'Maple Communications Group',
    password: 'MapleAdmin123!',
    permissions: ['tenant:maple', 'calls:moderate', 'interpreters:manage', 'vri:manage'],
    role: 'admin',
    serviceModes: ['vri'],
    tenantId: 'maple',
    username: 'mapleadmin'
  });
  const interpAccount = buildAccount({
    createdAt: isoDaysAgo(1),
    email: 'amina.hassan@malka.local',
    lastLoginAt: isoMinutesAgo(30),
    languages: ['ASL', 'Arabic', 'English'],
    name: 'Amina Hassan',
    password: 'Interpreter123!',
    role: 'interpreter',
    username: 'amina.hassan'
  });
  const mapleVriInterpreter = buildAccount({
    createdAt: isoDaysAgo(1),
    email: 'maya.chen@maple.local',
    lastLoginAt: isoMinutesAgo(20),
    languages: ['ASL', 'LSQ', 'English', 'French'],
    name: 'Maya Chen',
    organization: 'Maple Communications Group',
    password: 'Interpreter123!',
    permissions: ['vri:interpret', 'tenant:maple'],
    role: 'interpreter',
    serviceModes: ['vri'],
    tenantId: 'maple',
    username: 'maya.chen'
  });

  const audit = [
    buildAudit('login_success', isoMinutesAgo(3), {
      identifier: bootstrapUsername,
      ip: '::1',
      role: 'superadmin',
      userId: superadmin.id,
      username: bootstrapUsername
    }),
    buildAudit('account_created', isoMinutesAgo(12), {
      accountId: opsAdmin.id,
      actorId: superadmin.id,
      actorRole: 'superadmin',
      createdRole: 'admin',
      email: opsAdmin.email,
      username: opsAdmin.username
    }),
    buildAudit('account_created', isoMinutesAgo(10), {
      accountId: interpAccount.id,
      actorId: superadmin.id,
      actorRole: 'superadmin',
      createdRole: 'interpreter',
      email: interpAccount.email,
      username: interpAccount.username
    }),
    buildAudit('account_created', isoMinutesAgo(8), {
      accountId: mapleAdmin.id,
      actorId: superadmin.id,
      actorRole: 'superadmin',
      createdRole: 'admin',
      email: mapleAdmin.email,
      serviceModes: mapleAdmin.serviceModes,
      tenantId: mapleAdmin.tenantId,
      username: mapleAdmin.username
    }),
    buildAudit('account_created', isoMinutesAgo(6), {
      accountId: mapleVriInterpreter.id,
      actorId: mapleAdmin.id,
      actorRole: 'admin',
      createdRole: 'interpreter',
      email: mapleVriInterpreter.email,
      serviceModes: mapleVriInterpreter.serviceModes,
      tenantId: mapleVriInterpreter.tenantId,
      username: mapleVriInterpreter.username
    }),
    buildAudit('login_success', isoMinutesAgo(7), {
      identifier: opsAdmin.username,
      ip: '::1',
      role: 'admin',
      userId: opsAdmin.id,
      username: opsAdmin.username
    }),
    buildAudit('login_failed', isoMinutesAgo(22), {
      identifier: 'unknown-admin',
      ip: '::1',
      role: 'ops'
    })
  ];

  const state = {
    accounts: [superadmin, opsAdmin, mapleAdmin, interpAccount, mapleVriInterpreter],
    audit
  };

  fs.writeFileSync(opsStateFile, JSON.stringify(state, null, 2));
  const wrotePostgres = await writeOpsPostgresState(state);

  return {
    seededAt,
    credentials: {
      admin: { password: 'Admin123!', username: 'opsadmin' },
      interpreter: { password: 'Interpreter123!', username: 'amina.hassan' },
      mapleAdmin: { password: 'MapleAdmin123!', username: 'mapleadmin' },
      mapleVriInterpreter: { password: 'Interpreter123!', username: 'maya.chen' },
      superadmin: { password: bootstrapPassword, username: bootstrapUsername }
    },
    storage: wrotePostgres ? 'postgres' : 'json'
  };
}

async function main() {
  const opsBackup = backupFile(opsStateFile);

  await queueDb.initialize();
  await resetQueueData();
  const queueState = await seedQueueData();
  const opsState = await seedOpsState();

  console.log(JSON.stringify({
    backups: {
      opsState: opsBackup,
      queueDb: null
    },
    credentials: opsState.credentials,
    queue: {
      activeCallId: queueState.activeCallId,
      interpreters: Object.values(queueState.interpreters).map(interpreter => interpreter.name),
      queuedClients: ['Noor Al Harbi', 'Samir Rahman', 'Maple VRI Client']
    },
    seededAt: opsState.seededAt,
    storage: opsState.storage,
    success: true
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
