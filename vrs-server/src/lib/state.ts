/**
 * Shared application state.
 *
 * Centralizes the WebSocket connection maps and shared service references
 * so that route modules and WebSocket handlers can import a single source
 * of truth instead of relying on closure-scoped variables in server.js.
 */

import WebSocket, { WebSocketServer } from 'ws';

interface ConnectedClient {
    ws: WebSocket;
    userId: string;
}

interface ClientMaps {
    interpreters: Map<string, ConnectedClient>;
    clients: Map<string, ConnectedClient>;
    admins: Map<string, ConnectedClient>;
}

// Connected WebSocket clients, keyed by role
const clients: ClientMaps = {
    interpreters: new Map(),
    clients: new Map(),
    admins: new Map()
};

// WebSocket server instance (set during startup)
let wss: WebSocketServer | null = null;

function setWss(instance: WebSocketServer): void {
    wss = instance;
}

function getWss(): WebSocketServer | null {
    return wss;
}

// ============================================
// BROADCAST HELPERS
// ============================================

function broadcastToAdmins(message: object): void {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.admins) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastToInterpreters(message: object): void {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.interpreters) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastToClients(message: object): void {
    const msg = JSON.stringify(message);
    for (const [, client] of clients.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

interface QueueServiceLike {
    getStatus(): object;
}

function broadcastQueueStatus(queueService: QueueServiceLike): void {
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

function findClientSocketByUserId(userId: string): WebSocket | null {
    for (const client of clients.clients.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }
    return null;
}

function findInterpreterSocketByUserId(userId: string): WebSocket | null {
    for (const client of clients.interpreters.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }
    return null;
}

export {
    clients,
    setWss,
    getWss,
    broadcastToAdmins,
    broadcastToInterpreters,
    broadcastToClients,
    broadcastQueueStatus,
    findClientSocketByUserId,
    findInterpreterSocketByUserId
};

export type { ConnectedClient, ClientMaps, QueueServiceLike };
