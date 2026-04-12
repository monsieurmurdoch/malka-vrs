#!/usr/bin/env node
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const debuggerBaseUrl = process.env.VRS_CDP_BASE_URL || 'http://127.0.0.1:9223';
const targetUrl = process.argv[2];
const waitMs = Number(process.argv[3] || '15000');

if (!targetUrl) {
    console.error('Usage: node scripts/debug-public-page.mjs <url> [waitMs]');
    process.exit(1);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createDebuggerTarget() {
    const raw = execFileSync('curl', [ '-sS', '-g', '-X', 'PUT', `${debuggerBaseUrl}/json/new?about:blank` ], {
        encoding: 'utf8'
    }).trim();

    return JSON.parse(raw);
}

function closeDebuggerTarget(targetId) {
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

async function main() {
    const pageTarget = createDebuggerTarget();

    if (!pageTarget?.webSocketDebuggerUrl) {
        throw new Error('No debuggable page target found.');
    }

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    const requests = new Map();
    const consoleErrors = [];
    const exceptions = [];

    try {
        await client.connect();
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        await client.send('Network.enable');
        await client.send('Log.enable');

        client.onEvent(message => {
            if (message.method === 'Runtime.consoleAPICalled') {
                const text = (message.params.args || [])
                    .map(arg => arg.value ?? arg.description ?? '')
                    .join(' ');
                consoleErrors.push(`${message.params.type}: ${text}`);
                return;
            }

            if (message.method === 'Runtime.exceptionThrown') {
                const details = message.params.exceptionDetails || {};
                exceptions.push(details.exception?.description || details.text || 'Unhandled runtime exception');
                return;
            }

            if (message.method === 'Network.requestWillBeSent') {
                requests.set(message.params.requestId, {
                    url: message.params.request.url,
                    type: message.params.type || 'Unknown',
                    status: 'pending'
                });
                return;
            }

            if (message.method === 'Network.responseReceived') {
                const entry = requests.get(message.params.requestId);
                if (entry) {
                    entry.httpStatus = message.params.response.status;
                    entry.mimeType = message.params.response.mimeType;
                    entry.type = message.params.type || entry.type;
                }
                return;
            }

            if (message.method === 'Network.loadingFinished') {
                const entry = requests.get(message.params.requestId);
                if (entry) {
                    entry.status = 'finished';
                }
                return;
            }

            if (message.method === 'Network.loadingFailed') {
                const entry = requests.get(message.params.requestId) || { url: '<unknown>', type: 'Unknown' };
                entry.status = 'failed';
                entry.errorText = message.params.errorText;
                requests.set(message.params.requestId, entry);
            }
        });

        await client.send('Page.navigate', { url: targetUrl });
        await sleep(waitMs);

        const inspection = await client.send('Runtime.evaluate', {
            expression: `(() => ({
                href: location.href,
                title: document.title,
                readyState: document.readyState,
                bodyText: document.body ? document.body.innerText.slice(0, 400) : '',
                appHtml: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 400) : null
            }))()`,
            returnByValue: true
        });

        const entries = [ ...requests.values() ];
        const pending = entries.filter(entry => entry.status === 'pending');
        const failed = entries.filter(entry => entry.status === 'failed');
        const non200 = entries.filter(entry => typeof entry.httpStatus === 'number' && entry.httpStatus >= 400);

        console.log(JSON.stringify({
            targetUrl,
            waitMs,
            inspection: inspection.result?.value || {},
            summary: {
                totalRequests: entries.length,
                pendingRequests: pending.length,
                failedRequests: failed.length,
                httpFailures: non200.length,
                consoleEvents: consoleErrors.length,
                exceptions: exceptions.length
            },
            pending,
            failed,
            non200,
            consoleErrors,
            exceptions
        }, null, 2));
    } finally {
        await client.close().catch(() => {});
        closeDebuggerTarget(pageTarget.id);
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
