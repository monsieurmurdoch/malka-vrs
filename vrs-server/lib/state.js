/**
 * Shared application state.
 *
 * Centralizes the WebSocket connection maps and shared service references
 * so that route modules and WebSocket handlers can import a single source
 * of truth instead of relying on closure-scoped variables in server.js.
 */

const WebSocket = require('ws');

// Connected WebSocket clients, keyed by role
const clients = {
    interpreters: new Map(),
    clients: new Map(),
    admins: new Map()
};

// WebSocket server instance (set during startup)
let wss = null;

function setWss(instance) {
    wss = instance;
}

function getWss() {
    return wss;
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

    [...clients.clients.values(), ...clients.interpreters.values()].forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
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
    broadcastToAdmins,
    broadcastToInterpreters,
    broadcastToClients,
    broadcastQueueStatus,
    findClientSocketByUserId,
    findInterpreterSocketByUserId,
    broadcastToUserDevices
};
