// Mock the database module before requiring handoff-service
jest.mock('../database', () => ({
    upsertActiveSession: jest.fn().mockResolvedValue(undefined),
    deleteActiveSession: jest.fn().mockResolvedValue(undefined),
    getActiveSessionByUserId: jest.fn().mockResolvedValue(null),
    getAllActiveSessions: jest.fn().mockResolvedValue([]),
    clearAllActiveSessions: jest.fn().mockResolvedValue(undefined),
    storeHandoffToken: jest.fn().mockResolvedValue(undefined),
    getHandoffTokenFromDb: jest.fn().mockResolvedValue(null),
    deleteHandoffToken: jest.fn().mockResolvedValue(undefined),
    deleteHandoffTokensByUser: jest.fn().mockResolvedValue(undefined),
    deleteExpiredHandoffTokens: jest.fn().mockResolvedValue(undefined),
    getAllActiveHandoffTokens: jest.fn().mockResolvedValue([])
}));

const handoffService = require('../lib/handoff-service');

function mockWs() {
    return { readyState: 1, send: jest.fn() };
}

describe('lib/handoff-service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset internal state by re-registering fresh
        // The module has Maps in closure, so we work through the API
    });

    describe('session management', () => {
        it('should register a session', () => {
            const ws = mockWs();
            handoffService.registerSession('user-1', 'room-abc', 'device-1', ws);

            const session = handoffService.getActiveSession('user-1');
            expect(session).toBeDefined();
            expect(session.userId).toBe('user-1');
            expect(session.roomName).toBe('room-abc');
            expect(session.deviceId).toBe('device-1');
            expect(session.ws).toBe(ws);
        });

        it('should persist session on register', () => {
            const db = require('../database');
            handoffService.registerSession('user-2', 'room-xyz', 'dev-1', mockWs());

            expect(db.upsertActiveSession).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-2',
                    roomName: 'room-xyz',
                    deviceId: 'dev-1'
                })
            );
        });

        it('should unregister a session', () => {
            const db = require('../database');
            handoffService.registerSession('user-3', 'room-1', 'dev-1', mockWs());
            handoffService.unregisterSession('user-3');

            expect(handoffService.getActiveSession('user-3')).toBeNull();
            expect(db.deleteActiveSession).toHaveBeenCalledWith('user-3');
        });

        it('should update session WebSocket', () => {
            const ws1 = mockWs();
            const ws2 = mockWs();
            handoffService.registerSession('user-4', 'room-1', 'dev-1', ws1);
            handoffService.updateSessionWs('user-4', ws2);

            const session = handoffService.getActiveSession('user-4');
            expect(session.ws).toBe(ws2);
        });

        it('should update session interpreter', () => {
            const db = require('../database');
            handoffService.registerSession('user-5', 'room-1', 'dev-1', mockWs());
            handoffService.updateSessionInterpreter('user-5', 'interp-99');

            const session = handoffService.getActiveSession('user-5');
            expect(session.interpreterId).toBe('interp-99');
            expect(db.upsertActiveSession).toHaveBeenCalledWith(
                expect.objectContaining({ interpreterId: 'interp-99' })
            );
        });
    });

    describe('handoff token management', () => {
        it('should prepare a handoff token', () => {
            handoffService.registerSession('user-10', 'room-ho', 'dev-a', mockWs());

            const result = handoffService.prepareHandoff('user-10', 'dev-b');
            expect(result.token).toBeDefined();
            expect(result.roomName).toBe('room-ho');
            expect(typeof result.token).toBe('string');
            expect(result.token.length).toBeGreaterThan(0);
        });

        it('should fail to prepare handoff without active session', () => {
            const result = handoffService.prepareHandoff('nonexistent-user', 'dev-b');
            expect(result.error).toBeDefined();
        });

        it('should persist handoff token on prepare', () => {
            const db = require('../database');
            handoffService.registerSession('user-11', 'room-ho2', 'dev-a', mockWs());
            handoffService.prepareHandoff('user-11', 'dev-b');

            expect(db.storeHandoffToken).toHaveBeenCalled();
            expect(db.deleteHandoffTokensByUser).toHaveBeenCalledWith('user-11');
        });

        it('should execute a valid handoff', () => {
            handoffService.registerSession('user-12', 'room-exec', 'dev-a', mockWs());
            const prep = handoffService.prepareHandoff('user-12', 'dev-b');

            const result = handoffService.executeHandoff(prep.token, 'dev-b');
            expect(result.roomName).toBe('room-exec');
            expect(result.userId).toBe('user-12');
            expect(result.fromDeviceId).toBe('dev-a');
        });

        it('should reject an invalid token', () => {
            const result = handoffService.executeHandoff('nonexistent-token', 'dev-c');
            expect(result.error).toBeDefined();
        });

        it('should reject a reused token', () => {
            handoffService.registerSession('user-13', 'room-reuse', 'dev-a', mockWs());
            const prep = handoffService.prepareHandoff('user-13', 'dev-b');

            // First use succeeds
            handoffService.executeHandoff(prep.token, 'dev-b');
            // Second use fails
            const result = handoffService.executeHandoff(prep.token, 'dev-b');
            expect(result.error).toBeDefined();
        });

        it('should report handoff status', () => {
            handoffService.registerSession('user-14', 'room-status', 'dev-a', mockWs());
            handoffService.prepareHandoff('user-14', 'dev-b');

            const status = handoffService.getHandoffStatus('user-14');
            expect(status.inProgress).toBe(true);
            expect(status.targetDeviceId).toBe('dev-b');
        });

        it('should report no handoff for user without one', () => {
            const status = handoffService.getHandoffStatus('unknown-user');
            expect(status.inProgress).toBe(false);
        });

        it('should cancel a pending handoff', () => {
            handoffService.registerSession('user-15', 'room-cancel', 'dev-a', mockWs());
            handoffService.prepareHandoff('user-15', 'dev-b');

            const cancelled = handoffService.cancelHandoff('user-15');
            expect(cancelled).toBe(true);

            const status = handoffService.getHandoffStatus('user-15');
            expect(status.inProgress).toBe(false);
        });

        it('should return false when cancelling non-existent handoff', () => {
            expect(handoffService.cancelHandoff('no-user')).toBe(false);
        });
    });

    describe('cleanup()', () => {
        it('should remove sessions with dead WebSocket connections', () => {
            const deadWs = { readyState: 3, send: jest.fn() }; // CLOSED
            handoffService.registerSession('user-dead', 'room-1', 'dev-1', deadWs);

            handoffService.cleanup();

            expect(handoffService.getActiveSession('user-dead')).toBeNull();
        });

        it('should keep sessions with live WebSocket connections', () => {
            handoffService.registerSession('user-alive', 'room-2', 'dev-2', mockWs());

            handoffService.cleanup();

            expect(handoffService.getActiveSession('user-alive')).toBeDefined();
        });
    });
});
