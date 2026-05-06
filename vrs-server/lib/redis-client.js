const net = require('net');
const { URL } = require('url');
const log = require('./logger').module('redis');

const DEFAULT_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 500);
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_ADDR || '';
const REDIS_ENABLED = REDIS_URL && process.env.REDIS_ENABLED !== 'false';
let warnedUnavailable = false;

function encodeCommand(parts) {
    return `*${parts.length}\r\n${parts.map(part => {
        const value = String(part);
        return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    }).join('')}`;
}

function parseValue(buffer, offset = 0) {
    const prefix = buffer[offset];
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd === -1) throw new Error('Incomplete Redis response');
    const line = buffer.slice(offset + 1, lineEnd);
    const next = lineEnd + 2;

    if (prefix === '+') return { value: line, offset: next };
    if (prefix === '-') throw new Error(line);
    if (prefix === ':') return { value: Number(line), offset: next };
    if (prefix === '$') {
        const length = Number(line);
        if (length === -1) return { value: null, offset: next };
        const end = next + length;
        return { value: buffer.slice(next, end), offset: end + 2 };
    }
    if (prefix === '*') {
        const count = Number(line);
        if (count === -1) return { value: null, offset: next };
        const values = [];
        let cursor = next;
        for (let i = 0; i < count; i += 1) {
            const parsed = parseValue(buffer, cursor);
            values.push(parsed.value);
            cursor = parsed.offset;
        }
        return { value: values, offset: cursor };
    }
    throw new Error(`Unsupported Redis response prefix: ${prefix}`);
}

function normalizeValue(value) {
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (Array.isArray(value)) return value.map(normalizeValue);
    return value;
}

async function command(parts, options = {}) {
    if (!REDIS_ENABLED) return null;

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    let parsedUrl;
    try {
        parsedUrl = new URL(REDIS_URL);
    } catch (error) {
        if (!warnedUnavailable) {
            warnedUnavailable = true;
            log.warn({ err: error, redisUrl: REDIS_URL }, 'Redis URL is invalid; Redis state disabled');
        }
        return null;
    }

    return new Promise(resolve => {
        const socket = net.createConnection({
            host: parsedUrl.hostname || '127.0.0.1',
            port: Number(parsedUrl.port || 6379)
        });
        const chunks = [];
        const expectedResponses = 1
            + (parsedUrl.password ? 1 : 0)
            + (parsedUrl.pathname && parsedUrl.pathname !== '/' ? 1 : 0);
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };
        const timer = setTimeout(() => {
            if (!warnedUnavailable) {
                warnedUnavailable = true;
                log.warn({ redisUrl: REDIS_URL, timeoutMs }, 'Redis command timed out; falling back to local state');
            }
            finish(null);
        }, timeoutMs);

        socket.once('connect', () => {
            if (parsedUrl.password) {
                socket.write(encodeCommand(['AUTH', parsedUrl.password]));
            }
            if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
                const dbIndex = parsedUrl.pathname.replace('/', '');
                if (dbIndex) socket.write(encodeCommand(['SELECT', dbIndex]));
            }
            socket.write(encodeCommand(parts));
        });
        socket.on('data', chunk => {
            chunks.push(chunk);
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                const responses = [];
                let offset = 0;
                while (offset < raw.length) {
                    const parsed = parseValue(raw, offset);
                    responses.push(parsed.value);
                    offset = parsed.offset;
                }
                if (responses.length < expectedResponses) {
                    return;
                }
                clearTimeout(timer);
                finish(normalizeValue(responses[responses.length - 1]));
            } catch (error) {
                if (!String(error.message || '').startsWith('Incomplete Redis response')) {
                    clearTimeout(timer);
                    if (!warnedUnavailable) {
                        warnedUnavailable = true;
                        log.warn({ err: error }, 'Redis command failed; falling back to local state');
                    }
                    finish(null);
                }
            }
        });
        socket.once('error', error => {
            clearTimeout(timer);
            if (!warnedUnavailable) {
                warnedUnavailable = true;
                log.warn({ err: error, redisUrl: REDIS_URL }, 'Redis unavailable; falling back to local state');
            }
            finish(null);
        });
        socket.once('close', () => clearTimeout(timer));
    });
}

async function getJson(key) {
    const value = await command(['GET', key]);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        log.warn({ err: error, key }, 'Failed to parse Redis JSON value');
        return null;
    }
}

async function setJson(key, value, options = {}) {
    const parts = ['SET', key, JSON.stringify(value)];
    if (options.exSeconds) parts.push('EX', options.exSeconds);
    if (options.nx) parts.push('NX');
    return command(parts);
}

async function del(...keys) {
    const filtered = keys.filter(Boolean);
    if (!filtered.length) return 0;
    return command(['DEL', ...filtered]);
}

async function incr(key) {
    return command(['INCR', key]);
}

async function pexpire(key, milliseconds) {
    return command(['PEXPIRE', key, Math.max(1, Number(milliseconds) || 1)]);
}

async function pttl(key) {
    return command(['PTTL', key]);
}

async function keys(pattern) {
    const value = await command(['KEYS', pattern]);
    return Array.isArray(value) ? value : [];
}

async function getJsonByPattern(pattern) {
    const found = await keys(pattern);
    const values = [];
    for (const key of found) {
        const value = await getJson(key);
        if (value) values.push(value);
    }
    return values;
}

module.exports = {
    command,
    del,
    getJson,
    getJsonByPattern,
    incr,
    isEnabled: () => Boolean(REDIS_ENABLED),
    keys,
    pexpire,
    pttl,
    setJson
};
