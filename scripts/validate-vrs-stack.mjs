#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const queueBaseUrl = process.env.VRS_QUEUE_BASE_URL || `http://localhost:${process.env.VRS_QUEUE_PORT || 3001}`;
const opsBaseUrl = process.env.VRS_OPS_BASE_URL || `http://localhost:${process.env.VRS_OPS_PORT || 3003}`;
const twilioBaseUrl = process.env.VRS_TWILIO_BASE_URL || `http://localhost:${process.env.VRS_TWILIO_PORT || 3002}`;
const adminIdentifier = process.env.VRS_ADMIN_IDENTIFIER || process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || '';
const adminPassword = process.env.VRS_ADMIN_PASSWORD || process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || '';

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

async function checkEndpoint(label, url, options = {}) {
  try {
    const response = await fetch(url, { redirect: 'manual', ...options });
    const body = await parseJson(response);

    return {
      body,
      label,
      ok: response.ok,
      status: response.status,
      summary: body.status || body.ready || body.error || 'reachable',
      url
    };
  } catch (error) {
    return {
      body: null,
      label,
      ok: false,
      status: 'offline',
      summary: error.message,
      url
    };
  }
}

async function loginAdmin() {
  if (!adminIdentifier || !adminPassword) {
    return {
      ok: false,
      skipped: true,
      summary: 'Set VRS_ADMIN_IDENTIFIER and VRS_ADMIN_PASSWORD to validate authenticated admin endpoints.'
    };
  }

  const response = await checkEndpoint('Ops login', `${opsBaseUrl}/api/auth/login`, {
    body: JSON.stringify({ identifier: adminIdentifier, password: adminPassword }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });

  return {
    ...response,
    token: response.body?.token || ''
  };
}

async function checkAuthedEndpoint(label, url, token) {
  if (!token) {
    return {
      label,
      ok: false,
      skipped: true,
      status: 'skipped',
      summary: 'No admin token available',
      url
    };
  }

  return checkEndpoint(label, url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

function printCheck(prefix, check) {
  const details = [check.label, '->', check.status, check.summary].filter(Boolean).join(' ');
  console.log(`${prefix}  ${details}`);
}

const checks = [];
checks.push({ label: 'Queue server file', ok: exists('vrs-server/server.js') });
checks.push({ label: 'Ops server file', ok: exists('vrs-ops-server/src/index.ts') });
checks.push({ label: 'Twilio server file', ok: exists('twilio-voice-server/server.js') });

const twilioPackage = readJson('twilio-voice-server/package.json');
checks.push({
  label: 'Twilio package start script',
  ok: twilioPackage.scripts?.start === 'node server.js',
  details: twilioPackage.scripts?.start || 'missing'
});

const liveChecks = await Promise.all([
  checkEndpoint('Queue health', `${queueBaseUrl}/api/health`),
  checkEndpoint('Queue readiness', `${queueBaseUrl}/api/readiness`),
  checkEndpoint('Ops health', `${opsBaseUrl}/api/health`),
  checkEndpoint('Ops readiness', `${opsBaseUrl}/api/readiness`),
  checkEndpoint('Twilio health', `${twilioBaseUrl}/health`),
  checkEndpoint('Twilio readiness', `${twilioBaseUrl}/api/readiness`)
]);

const loginCheck = await loginAdmin();
const authedChecks = loginCheck.skipped ? [] : await Promise.all([
  checkAuthedEndpoint('Admin monitoring summary', `${opsBaseUrl}/api/admin/monitoring/summary`, loginCheck.token),
  checkAuthedEndpoint('Queue admin stats', `${queueBaseUrl}/api/admin/stats`, loginCheck.token),
  checkAuthedEndpoint('Active calls', `${queueBaseUrl}/api/admin/calls/active`, loginCheck.token),
  checkAuthedEndpoint('Daily usage', `${queueBaseUrl}/api/admin/usage/daily?days=7`, loginCheck.token),
  checkAuthedEndpoint('Live queue', `${queueBaseUrl}/api/admin/queue`, loginCheck.token),
  checkAuthedEndpoint('Interpreter roster', `${queueBaseUrl}/api/admin/interpreters`, loginCheck.token),
  checkAuthedEndpoint('Client roster', `${queueBaseUrl}/api/admin/clients`, loginCheck.token),
  checkAuthedEndpoint('Queue activity feed', `${queueBaseUrl}/api/admin/activity?limit=10`, loginCheck.token),
  checkAuthedEndpoint('Managed accounts', `${opsBaseUrl}/api/admin/accounts`, loginCheck.token),
  checkAuthedEndpoint('Ops audit feed', `${opsBaseUrl}/api/admin/audit?limit=10`, loginCheck.token)
]);

console.log('VRS Stack Validation');
console.log('====================');
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.label}${check.details ? ` (${check.details})` : ''}`);
}
console.log('');
for (const check of liveChecks) {
  printCheck(check.ok ? 'PASS' : 'WARN', check);
}
console.log('');
if (loginCheck.skipped) {
  console.log(`SKIP  Authenticated admin validation -> ${loginCheck.summary}`);
} else {
  printCheck(loginCheck.ok ? 'PASS' : 'FAIL', {
    label: loginCheck.label,
    status: loginCheck.status,
    summary: loginCheck.body?.user?.role || loginCheck.summary,
    url: loginCheck.url
  });

  for (const check of authedChecks) {
    printCheck(check.ok ? 'PASS' : 'FAIL', check);
  }
}

const failedStaticChecks = checks.filter(check => !check.ok);
const failedAuthChecks = loginCheck.skipped
  ? []
  : [loginCheck, ...authedChecks].filter(check => !check.ok);
if (failedStaticChecks.length || failedAuthChecks.length) {
  process.exitCode = 1;
}
