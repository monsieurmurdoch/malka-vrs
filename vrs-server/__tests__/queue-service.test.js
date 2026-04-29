// Mock dependencies before requiring queue-service
jest.mock('../lib/logger', () => ({
    module: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), fatal: jest.fn() })
}));
jest.mock('../lib/metrics', () => ({
    metrics: new Proxy({}, {
        get: () => ({ set: jest.fn(), inc: jest.fn(), observe: jest.fn(), dec: jest.fn() })
    })
}));
jest.mock('../database', () => ({
    getQueueRequests: jest.fn().mockResolvedValue([]),
    addToQueue: jest.fn(),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    assignInterpreter: jest.fn().mockResolvedValue(undefined),
    createCall: jest.fn().mockResolvedValue('call-id-1'),
    getServerState: jest.fn().mockResolvedValue(null),
    setServerState: jest.fn().mockResolvedValue(undefined)
}));

const queueService = require('../lib/queue-service');

describe('lib/queue-service', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await queueService.initialize();
    });

    describe('initialize()', () => {
        it('should restore paused state from DB', async () => {
            const db = require('../database');
            db.getServerState.mockImplementation(async (key) => {
                if (key === 'queue.paused') return 'true';
                if (key === 'queue.totalMatches') return '7';
                return null;
            });

            await queueService.initialize();

            const status = queueService.getStatus();
            expect(status.paused).toBe(true);
            expect(status.totalMatches).toBe(7);
        });

        it('should use defaults when no persisted state', async () => {
            const db = require('../database');
            db.getServerState.mockResolvedValue(null);

            await queueService.initialize();

            const status = queueService.getStatus();
            expect(status.paused).toBe(false);
            expect(status.totalMatches).toBe(0);
        });
    });

    describe('requestInterpreter()', () => {
        it('should add a request to the queue', async () => {
            const db = require('../database');
            db.addToQueue.mockResolvedValue({ id: 'req-1', position: 1 });

            const result = await queueService.requestInterpreter({
                clientId: 'client-1',
                clientName: 'Test Client',
                language: 'ASL',
                roomName: 'room-abc'
            });

            expect(result.success).toBe(true);
            expect(result.requestId).toBe('req-1');
            expect(result.position).toBe(1);
        });

        it('should reject when queue is paused', async () => {
            queueService.pause();

            const result = await queueService.requestInterpreter({
                clientId: 'c1',
                clientName: 'Test',
                language: 'ASL',
                roomName: 'room-1'
            });

            expect(result.success).toBe(false);
            expect(result.message).toContain('paused');
        });
    });

    describe('cancelRequest()', () => {
        it('should cancel an existing request', async () => {
            const db = require('../database');
            db.addToQueue.mockResolvedValue({ id: 'req-2', position: 1 });

            await queueService.requestInterpreter({
                clientId: 'c1',
                clientName: 'Test',
                language: 'ASL',
                roomName: 'room-1'
            });

            const result = await queueService.cancelRequest('req-2');
            expect(result.success).toBe(true);
        });

        it('should fail for non-existent request', async () => {
            const result = await queueService.cancelRequest('nonexistent');
            expect(result.success).toBe(false);
        });
    });

    describe('interpreter availability', () => {
        it('should mark an interpreter as available', () => {
            const result = queueService.interpreterAvailable('interp-1', 'Jane Doe', ['ASL']);
            expect(result.success).toBe(true);

            const status = queueService.getStatus();
            expect(status.activeInterpreters.length).toBe(1);
            expect(status.activeInterpreters[0].name).toBe('Jane Doe');
        });

        it('should mark an interpreter as unavailable', () => {
            queueService.interpreterAvailable('interp-2', 'John', ['ASL']);
            queueService.interpreterUnavailable('interp-2');

            const status = queueService.getStatus();
            expect(status.activeInterpreters.find(i => i.id === 'interp-2')).toBeUndefined();
        });
    });

    describe('pause() / resume()', () => {
        it('should persist paused state to DB', () => {
            const db = require('../database');
            queueService.pause();

            expect(db.setServerState).toHaveBeenCalledWith('queue.paused', 'true');
        });

        it('should persist resumed state to DB', () => {
            const db = require('../database');
            queueService.resume();

            expect(db.setServerState).toHaveBeenCalledWith('queue.paused', 'false');
        });
    });

    describe('getStatus()', () => {
        it('should return queue status', () => {
            queueService.interpreterAvailable('i1', 'Interp', ['ASL']);

            const status = queueService.getStatus();
            expect(status).toHaveProperty('paused');
            expect(status).toHaveProperty('queueSize');
            expect(status).toHaveProperty('activeInterpreters');
            expect(status).toHaveProperty('pendingRequests');
            expect(status).toHaveProperty('totalMatches');
        });
    });

    describe('tryMatch()', () => {
        it('should match a waiting request with an available interpreter', async () => {
            const db = require('../database');
            const requestId = 'req-match-1';
            db.addToQueue.mockResolvedValue({ id: requestId, position: 1 });
            // tryMatch fetches from DB — return the same request
            db.getQueueRequests.mockResolvedValue([{
                id: requestId,
                client_id: 'c1',
                client_name: 'Client',
                language: 'ASL',
                room_name: 'room-match',
                target_phone: null,
                call_type: null,
                status: 'waiting'
            }]);

            // Add request (populates in-memory queue)
            await queueService.requestInterpreter({
                clientId: 'c1',
                clientName: 'Client',
                language: 'ASL',
                roomName: 'room-match',
                callType: 'vrs'
            });

            // Add interpreter
            queueService.interpreterAvailable('interp-m1', 'Matcher', ['ASL']);

            // Try to match
            await queueService.tryMatch();

            // Verify a call was created (the matching succeeded)
            expect(db.assignInterpreter).toHaveBeenCalled();
        });

        it('should not match when no interpreters available', async () => {
            const db = require('../database');
            db.getQueueRequests.mockResolvedValue([{
                id: 'req-3',
                client_id: 'c1',
                client_name: 'Client',
                language: 'ASL',
                room_name: 'room-3',
                status: 'waiting'
            }]);

            await queueService.tryMatch();
            // Should not throw, just log
        });
    });
});
