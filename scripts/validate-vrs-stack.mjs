#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const queueBaseUrl = process.env.VRS_QUEUE_BASE_URL || `http://localhost:${process.env.VRS_QUEUE_PORT || 3001}`;
const opsBaseUrl = process.env.VRS_OPS_BASE_URL || `http://localhost:${process.env.VRS_OPS_PORT || 3003}`;
const twilioBaseUrl = process.env.VRS_TWILIO_BASE_URL || `http://localhost:${process.env.VRS_TWILIO_PORT || 3002}`;
const smokeManifest = readJson('contracts/api-manifest.json');
const adminIdentifier = process.env.VRS_ADMIN_IDENTIFIER || process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || '';
const adminPassword = process.env.VRS_ADMIN_PASSWORD || process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || '';
const curlResolveEntries = (process.env.VRS_VALIDATE_RESOLVE || '')
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function baseUrlForCheck(check) {
  if (check.base === 'ops') {
    return opsBaseUrl;
  }

  if (check.base === 'twilio') {
    return twilioBaseUrl;
  }

  return queueBaseUrl;
}

function checkUrl(check) {
  return `${baseUrlForCheck(check)}${check.path}`;
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function buildCurlArgs(url) {
  const args = ['-sS', '-L'];

  for (const entry of curlResolveEntries) {
    args.push('--resolve', entry);
  }

  args.push(
    '--max-time',
    String(Math.ceil(Number(process.env.VRS_VALIDATE_TIMEOUT_MS || 8000) / 1000)),
    '-w',
    '\n%{http_code}',
    url
  );

  return args;
}

async function checkEndpoint(label, url, options = {}) {
  let timeout;

  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), Number(process.env.VRS_VALIDATE_TIMEOUT_MS || 8000));
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal, ...options });
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
    if (!options.method && !options.body) {
      try {
        const raw = execFileSync('curl', buildCurlArgs(url), { encoding: 'utf8' });
        const splitAt = raw.lastIndexOf('\n');
        const text = splitAt === -1 ? raw : raw.slice(0, splitAt);
        const status = Number(splitAt === -1 ? 0 : raw.slice(splitAt + 1));
        const body = JSON.parse(text || '{}');

        return {
          body,
          label,
          ok: status >= 200 && status < 300,
          status,
          summary: body.status || body.ready || body.error || 'reachable',
          url
        };
      } catch (curlError) {
        return {
          body: null,
          label,
          ok: false,
          status: 'offline',
          summary: curlError.message,
          url
        };
      }
    }

    return {
      body: null,
      label,
      ok: false,
      status: 'offline',
      summary: error.message,
      url
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
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

const liveChecks = await Promise.all(
  smokeManifest.liveChecks.map(check => checkEndpoint(check.label, checkUrl(check)))
);

const loginCheck = await loginAdmin();
const authedChecks = loginCheck.skipped ? [] : await Promise.all(
  smokeManifest.adminChecks.map(check => checkAuthedEndpoint(check.label, checkUrl(check), loginCheck.token))
);

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
