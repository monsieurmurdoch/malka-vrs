#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const vrsRequire = createRequire(pathToFileURL(path.join(repoRoot, 'vrs-server', 'server.js')));
const jwt = vrsRequire('jsonwebtoken');
const queueDb = vrsRequire('./database.js');

const queueBaseUrl = process.env.VRS_QUEUE_BASE_URL || 'http://localhost:3001';
const opsBaseUrl = process.env.VRS_OPS_BASE_URL || 'http://localhost:3003';
const twilioBaseUrl = process.env.VRS_TWILIO_BASE_URL || 'http://localhost:3002';
const debuggerBaseUrl = process.env.VRS_CDP_BASE_URL || 'http://127.0.0.1:9222';
const sharedJwtSecret = process.env.VRS_SHARED_JWT_SECRET || 'validation-shared-secret';
const allowTwilioOffline = process.env.VRS_ALLOW_TWILIO_OFFLINE !== 'false';
const includeAdmin = process.env.VRS_SMOKE_INCLUDE_ADMIN !== 'false';
const clientEmail = process.env.VRS_SMOKE_CLIENT_EMAIL || 'leila.mansour@example.com';
const interpreterEmail = process.env.VRS_SMOKE_INTERPRETER_EMAIL || 'amina.hassan@malka.local';
const adminIdentifier = process.env.VRS_ADMIN_IDENTIFIER || process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || 'superadmin';
const adminPassword = process.env.VRS_ADMIN_PASSWORD || process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || 'ValidationSuperadmin123';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadEntity(table, email) {
    const row = table === 'clients'
        ? await queueDb.getClientByEmail(email)
        : await queueDb.getInterpreterByEmail(email);

    if (!row) {
        throw new Error(`Could not find ${table} record for ${email}`);
    }

    return { id: row.id, name: row.name, email: row.email };
}

function signQueueToken(user, role) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        name: user.name,
        role
    }, sharedJwtSecret, { expiresIn: '1h' });
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(`${url} -> ${response.status} ${data.error || response.statusText}`);
    }

    return data;
}

async function createDebuggerTarget() {
    const raw = execFileSync('curl', [ '-sS', '-g', '-X', 'PUT', `${debuggerBaseUrl}/json/new?about:blank` ], {
        encoding: 'utf8'
    }).trim();

    return JSON.parse(raw);
}

async function closeDebuggerTarget(targetId) {
    if (!targetId) {
        return;
    }

    try {
        execFileSync('curl', [ '-sS', '-g', '-X', 'PUT', `${debuggerBaseUrl}/json/close/${targetId}` ], {
            encoding: 'utf8'
        });
    } catch (error) {
        // Best-effort cleanup only.
    }
}

async function buildAdminStorage() {
    if (!includeAdmin) {
        return null;
    }

    const login = await fetchJson(`${opsBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: adminIdentifier, password: adminPassword })
    });

    const user = login.user || login.admin || {};

    return {
        local: {
            vrs_admin_email: user.email || '',
            vrs_admin_name: user.name || adminIdentifier,
            vrs_admin_role: user.role || 'superadmin',
            vrs_admin_token: login.token
        }
    };
}

class CdpClient {
    constructor(wsUrl) {
        this.socket = null;
        this.wsUrl = wsUrl;
        this.nextId = 1;
        this.pending = new Map();
        this.handlers = new Set();
    }

    async connect() {
        await new Promise((resolve, reject) => {
            const socket = new WebSocket(this.wsUrl);
            this.socket = socket;

            socket.once('open', resolve);
            socket.once('error', reject);
            socket.on('message', raw => {
                const message = JSON.parse(raw.toString());
                if (message.id) {
                    const pending = this.pending.get(message.id);
                    if (pending) {
                        this.pending.delete(message.id);
                        if (message.error) {
                            pending.reject(new Error(message.error.message || 'CDP error'));
                        } else {
                            pending.resolve(message.result || {});
                        }
                    }
                    return;
                }

                for (const handler of this.handlers) {
                    handler(message);
                }
            });
        });
    }

    onEvent(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async close() {
        if (!this.socket) {
            return;
        }

        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };

            const timer = setTimeout(finish, 1000);
            this.socket.once('close', () => {
                clearTimeout(timer);
                finish();
            });
            this.socket.close();
        });
    }
}

function buildInitScript(storage = {}) {
    const local = JSON.stringify(storage.local || {});
    const session = JSON.stringify(storage.session || {});
    const queueWsUrl = `${queueBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws`;
    const rewrites = JSON.stringify({
        'http://localhost:3001': queueBaseUrl,
        'https://localhost:3001': queueBaseUrl.replace(/^http:/, 'https:'),
        'ws://localhost:3001/ws': queueWsUrl,
        'wss://localhost:3001/ws': queueWsUrl.replace(/^ws:/, 'wss:'),
        'http://localhost:3003': opsBaseUrl,
        'https://localhost:3003': opsBaseUrl.replace(/^http:/, 'https:'),
        'http://localhost:3002': twilioBaseUrl,
        'https://localhost:3002': twilioBaseUrl.replace(/^http:/, 'https:')
    });

    return `
        (() => {
            const rewritePairs = Object.entries(${rewrites});
            const rewriteUrl = value => {
                const url = String(value);
                for (const [from, to] of rewritePairs) {
                    if (url.startsWith(from)) {
                        return to + url.slice(from.length);
                    }
                }
                return url;
            };

            window.localStorage.clear();
            window.sessionStorage.clear();

            for (const [key, value] of Object.entries(${local})) {
                window.localStorage.setItem(key, value);
            }

            for (const [key, value] of Object.entries(${session})) {
                window.sessionStorage.setItem(key, value);
            }

            const originalFetch = window.fetch.bind(window);
            window.fetch = (input, init) => {
                if (typeof input === 'string' || input instanceof URL) {
                    return originalFetch(rewriteUrl(input), init);
                }

                return originalFetch(new Request(rewriteUrl(input.url), input), init);
            };

            const OriginalWebSocket = window.WebSocket;
            window.WebSocket = class extends OriginalWebSocket {
                constructor(url, protocols) {
                    super(rewriteUrl(url), protocols);
                }
            };
        })();
    `;
}

function isAllowedNetworkFailure(url) {
    if (!url) {
        return false;
    }

    if (allowTwilioOffline && url.startsWith(twilioBaseUrl)) {
        return true;
    }

    return url.endsWith('/favicon.ico');
}

async function waitForPageLoad(client, timeoutMs = 10000) {
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            remove();
            resolve(false);
        }, timeoutMs);

        const remove = client.onEvent(message => {
            if (message.method === 'Page.loadEventFired') {
                clearTimeout(timer);
                remove();
                resolve(true);
            }
        });
    });
}

async function waitForCondition(client, expression, timeoutMs = 12000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const result = await client.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        });

        if (result.result?.value) {
            return true;
        }

        await sleep(250);
    }

    return false;
}

async function inspectPage(client) {
    const result = await client.send('Runtime.evaluate', {
        expression: `(() => ({
            title: document.title,
            href: location.href,
            readyState: document.readyState,
            text: document.body ? document.body.innerText.slice(0, 400) : ''
        }))()`,
        returnByValue: true
    });

    return result.result?.value || {};
}

async function smokePage(client, page) {
    const requestUrls = new Map();
    const consoleErrors = [];
    const exceptions = [];
    const networkFailures = [];
    const httpFailures = [];

    const removeListener = client.onEvent(message => {
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            consoleErrors.push((message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' '));
            return;
        }

        if (message.method === 'Runtime.exceptionThrown') {
            exceptions.push(message.params.exceptionDetails?.text || 'Unhandled runtime exception');
            return;
        }

        if (message.method === 'Network.requestWillBeSent') {
            requestUrls.set(message.params.requestId, message.params.request.url);
            return;
        }

        if (message.method === 'Network.loadingFailed') {
            const url = requestUrls.get(message.params.requestId) || '';
            if (!isAllowedNetworkFailure(url)) {
                networkFailures.push(`${url || '<unknown>'} -> ${message.params.errorText}`);
            }
            return;
        }

        if (message.method === 'Network.responseReceived') {
            const { response, type } = message.params;
            if ([ 'Document', 'Fetch', 'XHR', 'Script', 'Stylesheet' ].includes(type)
                && response.status >= 400
                && !isAllowedNetworkFailure(response.url)) {
                httpFailures.push(`${response.url} -> ${response.status}`);
            }
        }
    });

    let scriptIdentifier = null;

    try {
        await client.send('Page.navigate', { url: 'about:blank' });
        await waitForPageLoad(client, 5000);

        const added = await client.send('Page.addScriptToEvaluateOnNewDocument', {
            source: buildInitScript(page.storage)
        });
        scriptIdentifier = added.identifier;

        await client.send('Page.navigate', { url: page.url });
        await waitForPageLoad(client, 10000);
        const ready = await waitForCondition(client, page.readyExpression, 12000);
        await sleep(1000);
        const inspection = await inspectPage(client);

        return {
            page: page.label,
            ready,
            inspection,
            consoleErrors,
            exceptions,
            networkFailures,
            httpFailures,
            ok: ready
                && consoleErrors.length === 0
                && exceptions.length === 0
                && networkFailures.length === 0
                && httpFailures.length === 0
        };
    } finally {
        removeListener();
        if (scriptIdentifier) {
            await client.send('Page.removeScriptToEvaluateOnNewDocument', {
                identifier: scriptIdentifier
            }).catch(() => {});
        }
    }
}

function printResult(result) {
    const prefix = result.ok ? 'PASS' : 'FAIL';
    console.log(`${prefix}  ${result.page}`);
    console.log(`      title=${result.inspection.title || '<none>'}`);
    console.log(`      href=${result.inspection.href || '<none>'}`);
    console.log(`      readyState=${result.inspection.readyState || '<none>'}`);
    if (!result.ready) {
        console.log('      reason=expected page condition was not reached');
        console.log(`      text=${JSON.stringify(result.inspection.text || '')}`);
    }
    for (const item of result.consoleErrors) {
        console.log(`      console-error=${item}`);
    }
    for (const item of result.exceptions) {
        console.log(`      exception=${item}`);
    }
    for (const item of result.networkFailures) {
        console.log(`      network-failure=${item}`);
    }
    for (const item of result.httpFailures) {
        console.log(`      http-failure=${item}`);
    }
}

async function main() {
    await queueDb.initialize();
    const clientUser = await loadEntity('clients', clientEmail);
    const interpreterUser = await loadEntity('interpreters', interpreterEmail);
    const adminStorage = await buildAdminStorage();

    const pageTarget = await createDebuggerTarget();

    if (!pageTarget?.webSocketDebuggerUrl) {
        throw new Error('No debuggable page target found. Launch headless Chrome with --remote-debugging-port=9222 first.');
    }

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('Log.enable');

    const pages = [
        {
            label: 'Client Profile',
            url: `${queueBaseUrl}/client-profile.html`,
            readyExpression: `Boolean(document.querySelector('.profile-main')) && Boolean(document.getElementById('ws-status')) && /Speed Dial/.test(document.body.innerText)`,
            storage: {
                session: {
                    vrs_auth_token: JSON.stringify({ token: signQueueToken(clientUser, 'client'), userId: clientUser.id }),
                    vrs_user_info: JSON.stringify({ ...clientUser, role: 'client' }),
                    vrs_user_role: 'client'
                }
            }
        },
        {
            label: 'Interpreter Profile',
            url: `${queueBaseUrl}/interpreter-profile.html`,
            readyExpression: `Boolean(document.querySelector('.profile-main')) && /Join Queue/.test(document.body.innerText) && /Schedule/.test(document.body.innerText)`,
            storage: {
                session: {
                    vrs_auth_token: JSON.stringify({ token: signQueueToken(interpreterUser, 'interpreter'), userId: interpreterUser.id }),
                    vrs_user_info: JSON.stringify({ ...interpreterUser, role: 'interpreter' }),
                    vrs_user_role: 'interpreter'
                }
            }
        }
    ];

    if (adminStorage) {
        pages.push({
            label: 'Admin Dashboard',
            url: `${queueBaseUrl}/vrs-admin-dashboard.html`,
            readyExpression: `Boolean(document.querySelector('#monitoringSummaryBody')) && /MalkaVRS/.test(document.body.innerText)`,
            storage: adminStorage
        });
    }

    console.log('VRS Page Smoke');
    console.log('==============');
    console.log(`Queue base: ${queueBaseUrl}`);
    console.log(`Ops base:   ${opsBaseUrl}`);
    console.log(`Twilio base:${twilioBaseUrl} (${allowTwilioOffline ? 'optional' : 'required'})`);
    console.log('');

    const results = [];
    try {
        for (const page of pages) {
            console.log(`Checking ${page.label}...`);
            results.push(await smokePage(client, page));
        }
    } finally {
        await client.close();
        await closeDebuggerTarget(pageTarget.id);
        await queueDb.pool()?.end?.();
    }

    for (const result of results) {
        printResult(result);
    }

    if (results.some(result => !result.ok)) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    const details = error?.cause?.message ? `${error.message} (cause: ${error.cause.message})` : error.message;
    console.error(`FAIL  Smoke runner -> ${details}`);
    process.exitCode = 1;
});
