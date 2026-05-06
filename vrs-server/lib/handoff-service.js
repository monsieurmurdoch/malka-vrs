const crypto = require('crypto');
const db = require('../database');
const log = require('./logger').module('handoff');
const redis = require('./redis-client');

const activeSessions = new Map();
const handoffTokens = new Map();
const TOKEN_EXPIRY_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const REDIS_HANDOFF_PREFIX = process.env.REDIS_HANDOFF_PREFIX || 'vrs:handoff';

function redisTokenKey(token) {
    return `${REDIS_HANDOFF_PREFIX}:token:${token}`;
}

function serializeToken(data) {
    return {
        ...data,
        createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt
    };
}

function hydrateToken(data) {
    if (!data || !data.userId || !data.expiresAt) return null;
    return {
        ...data,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        expiresAt: Number(data.expiresAt)
    };
}

function persistHandoffToken(token, data) {
    const ttlSeconds = Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000));
    redis.setJson(redisTokenKey(token), serializeToken(data), { exSeconds: ttlSeconds })
        .catch(err => log.warn({ err, token }, 'Failed to persist handoff token to Redis'));
}

function deleteHandoffTokenFromRedis(token) {
    redis.del(redisTokenKey(token)).catch(() => {});
}

async function initialize() {
    try {
        const sessions = await db.getAllActiveSessions();
        for (const s of sessions) {
            activeSessions.set(s.user_id, {
                userId: s.user_id, roomName: s.room_name,
                interpreterId: s.interpreter_id, deviceId: s.device_id,
                ws: null, registeredAt: new Date(s.registered_at)
            });
        }
        const tokens = await db.getAllActiveHandoffTokens();
        for (const t of tokens) {
            const data = {
                token: t.token,
                userId: t.user_id, roomName: t.room_name,
                interpreterId: t.interpreter_id, fromDeviceId: t.from_device_id,
                targetDeviceId: t.target_device_id, createdAt: new Date(t.created_at),
                expiresAt: new Date(t.expires_at).getTime()
            };
            handoffTokens.set(t.token, data);
            persistHandoffToken(t.token, data);
        }
        const redisTokens = await redis.getJsonByPattern(`${REDIS_HANDOFF_PREFIX}:token:*`);
        for (const value of redisTokens) {
            const data = hydrateToken(value);
            const token = String(value?.token || '').trim();
            if (token && data && Date.now() <= data.expiresAt) {
                handoffTokens.set(token, data);
            }
        }
        await db.deleteExpiredHandoffTokens();
    } catch (error) {
        log.warn({ err: error.message }, 'Could not rehydrate from DB, starting fresh');
    }
}

function registerSession(userId, roomName, deviceId, ws) {
    activeSessions.set(userId, { userId, roomName, interpreterId: null, deviceId, ws, registeredAt: new Date() });
    db.upsertActiveSession({ userId, roomName, interpreterId: null, deviceId }).catch(err =>
        log.warn({ err: err.message }, 'Failed to persist session'));
}

function unregisterSession(userId) {
    const session = activeSessions.get(userId);
    if (session) { activeSessions.delete(userId); }
    db.deleteActiveSession(userId).catch(() => {});
}

function getActiveSession(userId) { return activeSessions.get(userId) || null; }

function updateSessionWs(userId, ws) {
    const session = activeSessions.get(userId);
    if (session) session.ws = ws;
}

function updateSessionInterpreter(userId, interpreterId) {
    const session = activeSessions.get(userId);
    if (session) {
        session.interpreterId = interpreterId;
        db.upsertActiveSession({ userId, roomName: session.roomName, interpreterId, deviceId: session.deviceId }).catch(() => {});
    }
}

function prepareHandoff(userId, targetDeviceId) {
    const session = activeSessions.get(userId);
    if (!session) return { error: 'No active session found for this user' };
    for (const [token, data] of handoffTokens) {
        if (data.userId === userId) {
            handoffTokens.delete(token);
            deleteHandoffTokenFromRedis(token);
        }
    }
    db.deleteHandoffTokensByUser(userId).catch(() => {});
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    const tokenData = { token, userId, roomName: session.roomName, interpreterId: session.interpreterId,
        fromDeviceId: session.deviceId, targetDeviceId, createdAt: new Date(), expiresAt };
    handoffTokens.set(token, tokenData);
    persistHandoffToken(token, tokenData);
    db.storeHandoffToken({ token, userId, roomName: session.roomName, interpreterId: session.interpreterId,
        fromDeviceId: session.deviceId, targetDeviceId, expiresAt }).catch(() => {});
    return { token, roomName: session.roomName, interpreterId: session.interpreterId };
}

function executeHandoff(token, newDeviceId) {
    const data = handoffTokens.get(token);
    if (!data) return { error: 'Invalid or expired handoff token' };
    if (Date.now() > data.expiresAt) { handoffTokens.delete(token); deleteHandoffTokenFromRedis(token); return { error: 'Handoff token has expired' }; }
    handoffTokens.delete(token);
    deleteHandoffTokenFromRedis(token);
    db.deleteHandoffToken(token).catch(() => {});
    const session = activeSessions.get(data.userId);
    if (session) { session.deviceId = newDeviceId; db.upsertActiveSession({ userId: data.userId, roomName: session.roomName, interpreterId: session.interpreterId, deviceId: newDeviceId }).catch(() => {}); }
    return { roomName: data.roomName, interpreterId: data.interpreterId, userId: data.userId, fromDeviceId: data.fromDeviceId };
}

function getHandoffStatus(userId) {
    for (const [, data] of handoffTokens) {
        if (data.userId === userId && Date.now() <= data.expiresAt) return { inProgress: true, targetDeviceId: data.targetDeviceId, roomName: data.roomName, expiresAt: data.expiresAt };
    }
    return { inProgress: false };
}

function getHandoffByToken(token) {
    const data = handoffTokens.get(token);
    if (!data) return null;
    if (Date.now() > data.expiresAt) { handoffTokens.delete(token); deleteHandoffTokenFromRedis(token); return null; }
    return { ...data };
}

function cancelHandoff(userId) {
    for (const [token, data] of handoffTokens) {
        if (data.userId === userId) { handoffTokens.delete(token); deleteHandoffTokenFromRedis(token); db.deleteHandoffTokensByUser(userId).catch(() => {}); return true; }
    }
    return false;
}

function cleanup() {
    const now = Date.now();
    for (const [token, data] of handoffTokens) { if (now > data.expiresAt) { handoffTokens.delete(token); deleteHandoffTokenFromRedis(token); } }
    db.deleteExpiredHandoffTokens().catch(() => {});
    for (const [userId, session] of activeSessions) {
        if (session.ws && session.ws.readyState !== 1) { activeSessions.delete(userId); db.deleteActiveSession(userId).catch(() => {}); }
    }
}

const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);

module.exports = { initialize, registerSession, unregisterSession, getActiveSession, updateSessionWs,
    updateSessionInterpreter, prepareHandoff, executeHandoff, getHandoffStatus, getHandoffByToken, cancelHandoff, cleanup };
