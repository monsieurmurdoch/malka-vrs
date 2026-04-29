const state = require('../lib/state');
const WebSocket = require('ws');

// Minimal mock WebSocket
function mockWs(readyState = WebSocket.OPEN) {
    const ws = { readyState, send: jest.fn() };
    return ws;
}

describe('lib/state', () => {
    beforeEach(() => {
        // Clear all client maps
        state.clients.interpreters.clear();
        state.clients.clients.clear();
        state.clients.admins.clear();
    });

    describe('setWss() / getWss()', () => {
        it('should store and retrieve the WSS instance', () => {
            const fakeWss = { test: true };
            state.setWss(fakeWss);
            expect(state.getWss()).toBe(fakeWss);
        });
    });

    describe('broadcastToAdmins()', () => {
        it('should send a message to all connected admins', () => {
            const ws1 = mockWs();
            const ws2 = mockWs();
            state.clients.admins.set('admin1', { ws: ws1 });
            state.clients.admins.set('admin2', { ws: ws2 });

            state.broadcastToAdmins({ type: 'test', data: 'hello' });

            expect(ws1.send).toHaveBeenCalledTimes(1);
            expect(ws2.send).toHaveBeenCalledTimes(1);
            const msg = JSON.stringify({ type: 'test', data: 'hello' });
            expect(ws1.send).toHaveBeenCalledWith(msg);
        });

        it('should skip admins with non-OPEN connections', () => {
            const openWs = mockWs(WebSocket.OPEN);
            const closedWs = mockWs(WebSocket.CLOSED);
            state.clients.admins.set('admin1', { ws: openWs });
            state.clients.admins.set('admin2', { ws: closedWs });

            state.broadcastToAdmins({ type: 'test' });

            expect(openWs.send).toHaveBeenCalledTimes(1);
            expect(closedWs.send).not.toHaveBeenCalled();
        });
    });

    describe('broadcastToInterpreters()', () => {
        it('should send messages to all connected interpreters', () => {
            const ws = mockWs();
            state.clients.interpreters.set('interp1', { ws });

            state.broadcastToInterpreters({ type: 'match', data: {} });

            expect(ws.send).toHaveBeenCalledTimes(1);
        });
    });

    describe('broadcastToClients()', () => {
        it('should send messages to all connected clients', () => {
            const ws = mockWs();
            state.clients.clients.set('client1', { ws });

            state.broadcastToClients({ type: 'update', data: {} });

            expect(ws.send).toHaveBeenCalledTimes(1);
        });
    });

    describe('broadcastQueueStatus()', () => {
        it('should broadcast queue status to clients, interpreters, and admins', () => {
            const clientWs = mockWs();
            const interpWs = mockWs();
            const adminWs = mockWs();
            state.clients.clients.set('c1', { ws: clientWs });
            state.clients.interpreters.set('i1', { ws: interpWs });
            state.clients.admins.set('a1', { ws: adminWs });

            const queueService = {
                getStatus: () => ({ queueSize: 3, paused: false }),
                getQueue: () => [{ id: 'request-1' }]
            };

            state.broadcastQueueStatus(queueService);

            const expectedStatus = JSON.stringify({
                type: 'queue_status',
                data: { queueSize: 3, paused: false }
            });
            const expectedAdminQueue = JSON.stringify({
                type: 'queue_update',
                data: [{ id: 'request-1' }]
            });
            expect(clientWs.send).toHaveBeenCalledWith(expectedStatus);
            expect(interpWs.send).toHaveBeenCalledWith(expectedStatus);
            expect(adminWs.send).toHaveBeenCalledWith(expectedAdminQueue);
        });
    });

    describe('findClientSocketByUserId()', () => {
        it('should find a client socket by userId', () => {
            const ws = mockWs();
            state.clients.clients.set('ws-id-1', { userId: 'user-123', ws });

            expect(state.findClientSocketByUserId('user-123')).toBe(ws);
        });

        it('should return null for unknown userId', () => {
            expect(state.findClientSocketByUserId('nonexistent')).toBeNull();
        });
    });

    describe('findInterpreterSocketByUserId()', () => {
        it('should find an interpreter socket by userId', () => {
            const ws = mockWs();
            state.clients.interpreters.set('ws-id-2', { userId: 'interp-456', ws });

            expect(state.findInterpreterSocketByUserId('interp-456')).toBe(ws);
        });

        it('should return null for unknown userId', () => {
            expect(state.findInterpreterSocketByUserId('nonexistent')).toBeNull();
        });
    });
});
