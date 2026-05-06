/**
 * Shared application state.
 *
 * Centralizes the WebSocket connection maps and shared service references
 * so that route modules and WebSocket handlers can import a single source
 * of truth instead of relying on closure-scoped variables in server.js.
 */

const WebSocket = require('ws');
const redis = require('./redis-client');
const log = require('./logger').module('state');

// Connected WebSocket clients, keyed by role
const clients = {
    interpreters: new Map(),
    clients: new Map(),
    captioners: new Map(),
    admins: new Map()
};

// WebSocket server instance (set during startup)
let wss = null;
const REDIS_WS_PREFIX = process.env.REDIS_WS_PREFIX || 'vrs:ws';
const PRESENCE_TTL_SECONDS = Number(process.env.REDIS_WS_PRESENCE_TTL_SECONDS || 90);

function setWss(instance) {
    wss = instance;
}

function getWss() {
    return wss;
}

function presenceKey(clientInfo) {
    return `${REDIS_WS_PREFIX}:connection:${clientInfo.role}:${clientInfo.clientId}`;
}

function registerPresence(clientInfo) {
    if (!clientInfo || !clientInfo.clientId || !clientInfo.role) return;
    try {
        Promise.resolve(redis.setJson(presenceKey(clientInfo), {
            clientId: clientInfo.clientId,
            connectedAt: new Date().toISOString(),
            name: clientInfo.name || null,
            role: clientInfo.role,
            userId: clientInfo.userId || null
        }, { exSeconds: PRESENCE_TTL_SECONDS })).catch(err =>
            log.warn({ err, clientId: clientInfo.clientId }, 'Failed to persist WebSocket presence to Redis'));
    } catch (err) {
        log.warn({ err, clientId: clientInfo.clientId }, 'Failed to queue WebSocket presence persistence');
    }
}

function refreshPresence(clientInfo) {
    registerPresence(clientInfo);
}

function unregisterPresence(clientInfo) {
    if (!clientInfo || !clientInfo.clientId || !clientInfo.role) return;
    try {
        Promise.resolve(redis.del(presenceKey(clientInfo))).catch(() => {});
    } catch (err) {
        log.warn({ err, clientId: clientInfo.clientId }, 'Failed to queue WebSocket presence removal');
    }
}

// ============================================
// BROADCAST HELPERS
// ============================================

function broadcastToAdmins(message) {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.admins) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastToInterpreters(message) {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.interpreters) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastToClients(message) {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastQueueStatus(queueService) {
    const msg = JSON.stringify({
        type: 'queue_status',
        data: queueService.getStatus()
    });
    const adminMsg = JSON.stringify({
        type: 'queue_update',
        data: typeof queueService.getQueue === 'function' ? queueService.getQueue() : []
    });

    [...clients.clients.values(), ...clients.interpreters.values()].forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    });

    [...clients.admins.values()].forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(adminMsg);
        }
    });
}

function findClientSocketByUserId(userId) {
    for (const client of clients.clients.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }
    return null;
}

function findInterpreterSocketByUserId(userId) {
    for (const client of clients.interpreters.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }
    return null;
}

/**
 * Broadcast a message to ALL WebSocket connections for a given user
 * (except the optionally excluded one).  Used for cross-device contact sync.
 */
function broadcastToUserDevices(userId, message, excludeWs) {
    const msg = JSON.stringify(message);
    for (const client of clients.clients.values()) {
        if (client.userId === userId && client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

module.exports = {
    clients,
    setWss,
    getWss,
    registerPresence,
    refreshPresence,
    unregisterPresence,
    broadcastToAdmins,
    broadcastToInterpreters,
    broadcastToClients,
    broadcastQueueStatus,
    findClientSocketByUserId,
    findInterpreterSocketByUserId,
    broadcastToUserDevices
};
