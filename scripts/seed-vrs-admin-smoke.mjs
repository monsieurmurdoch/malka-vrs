#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const queueDbFile = path.join(repoRoot, 'vrs-server', 'data', 'vrs.db');
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

function buildAccount({ createdAt, createdBy = null, email = '', languages = ['ASL'], lastLoginAt = null, name, password, role, username }) {
  return {
    active: true,
    createdAt,
    createdBy,
    email,
    id: uuidv4(),
    languages,
    lastLoginAt,
    name,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
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

async function run(sql, params = []) {
  const db = queueDb.db();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

async function all(sql, params = []) {
  const db = queueDb.db();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function ensureDevSchema() {
  const clientColumns = await all('PRAGMA table_info(clients)');
  const clientColumnNames = new Set(clientColumns.map(column => column.name));

  if (!clientColumnNames.has('password_hash')) {
    await run('ALTER TABLE clients ADD COLUMN password_hash TEXT');
  }
}

async function resetQueueData() {
  await run('PRAGMA foreign_keys = OFF');
  for (const table of [
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
  ]) {
    await run(`DELETE FROM ${table}`);
  }
  await run('PRAGMA foreign_keys = ON');
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

  await run('UPDATE interpreters SET last_active = ?, status = ? WHERE id = ?', [isoMinutesAgo(2), 'online', amina.id]);
  await run('UPDATE interpreters SET last_active = ?, status = ? WHERE id = ?', [isoMinutesAgo(18), 'offline', omar.id]);

  const leila = await queueDb.createClient({
    email: 'leila.mansour@example.com',
    name: 'Leila Mansour',
    organization: 'Personal'
  });
  const noor = await queueDb.createClient({
    email: 'noor.alharbi@health.example',
    name: 'Noor Al Harbi',
    organization: 'Gulf Health'
  });
  const samir = await queueDb.createClient({
    email: 'samir.rahman@fin.example',
    name: 'Samir Rahman',
    organization: 'MENA Finance'
  });

  const activeCallId = await queueDb.createCall({
    clientId: leila.id,
    interpreterId: amina.id,
    roomName: 'vrs-live-leila-amina',
    language: 'Arabic'
  });
  await run('UPDATE calls SET started_at = ? WHERE id = ?', [isoMinutesAgo(12), activeCallId]);

  const completedCallToday = await queueDb.createCall({
    clientId: noor.id,
    interpreterId: amina.id,
    roomName: 'vrs-complete-noor-amina',
    language: 'ASL'
  });
  await run('UPDATE calls SET started_at = ?, ended_at = ?, duration_minutes = ?, status = ? WHERE id = ?', [isoHoursAgo(3), isoHoursAgo(2.5), 28, 'completed', completedCallToday]);

  const completedCallYesterday = await queueDb.createCall({
    clientId: samir.id,
    interpreterId: omar.id,
    roomName: 'vrs-complete-samir-omar',
    language: 'Arabic'
  });
  await run('UPDATE calls SET started_at = ?, ended_at = ?, duration_minutes = ?, status = ? WHERE id = ?', [isoMinutesOffsetFromNow(-(24 * 60 - 45)), isoMinutesOffsetFromNow(-(24 * 60 - 86)), 41, 'completed', completedCallYesterday]);

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

  await run('UPDATE queue_requests SET created_at = ?, position = ? WHERE id = ?', [isoMinutesAgo(9), 1, queueOne.id]);
  await run('UPDATE queue_requests SET created_at = ?, position = ? WHERE id = ?', [isoMinutesAgo(4), 2, queueTwo.id]);

  await queueDb.logActivity('interpreter_created', 'Amina Hassan interpreter profile seeded', { interpreterId: amina.id, seeded: true }, 'seed-script');
  await queueDb.logActivity('client_created', 'Leila Mansour client profile seeded', { clientId: leila.id, seeded: true }, 'seed-script');
  await queueDb.logActivity('call_started', 'Live call in progress for Leila Mansour', { callId: activeCallId, roomName: 'vrs-live-leila-amina' }, 'seed-script');
  await queueDb.logActivity('queue_request_added', 'Noor Al Harbi entered the queue', { clientId: noor.id, requestId: queueOne.id }, 'seed-script');
  await queueDb.logActivity('queue_request_added', 'Samir Rahman entered the queue', { clientId: samir.id, requestId: queueTwo.id }, 'seed-script');

  return {
    activeCallId,
    clients: { leila, noor, samir },
    interpreters: { amina, omar },
    queueRequests: { queueOne, queueTwo }
  };
}

function seedOpsState() {
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
    accounts: [superadmin, opsAdmin, interpAccount],
    audit
  };

  fs.writeFileSync(opsStateFile, JSON.stringify(state, null, 2));

  return {
    seededAt,
    credentials: {
      admin: { password: 'Admin123!', username: 'opsadmin' },
      interpreter: { password: 'Interpreter123!', username: 'amina.hassan' },
      superadmin: { password: bootstrapPassword, username: bootstrapUsername }
    }
  };
}

async function main() {
  const queueBackup = backupFile(queueDbFile);
  const opsBackup = backupFile(opsStateFile);

  await queueDb.initialize();
  await ensureDevSchema();
  await resetQueueData();
  const queueState = await seedQueueData();
  const opsState = seedOpsState();

  console.log(JSON.stringify({
    backups: {
      opsState: opsBackup,
      queueDb: queueBackup
    },
    credentials: opsState.credentials,
    queue: {
      activeCallId: queueState.activeCallId,
      interpreters: Object.values(queueState.interpreters).map(interpreter => interpreter.name),
      queuedClients: ['Noor Al Harbi', 'Samir Rahman']
    },
    seededAt: opsState.seededAt,
    success: true
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
