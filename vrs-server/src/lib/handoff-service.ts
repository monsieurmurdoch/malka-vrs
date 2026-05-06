/**
 * Handoff Service
 *
 * Manages seamless device-to-device call transfers via Bluetooth proximity.
 *
 * Responsibilities:
 * - Track active VRS sessions per user (which device is in which room)
 * - Issue one-time handoff tokens for secure transfers
 * - Coordinate the overlap window (both devices briefly in room)
 * - Notify interpreters during handoff
 * - Clean up expired tokens and stale sessions
 */

import crypto from 'crypto';
import { WebSocket } from 'ws';
import * as db from '../database';
import { createModuleLogger } from './logger';

const log = createModuleLogger('handoff');

interface Session {
    userId: string;
    roomName: string;
    interpreterId: string | null;
    deviceId: string;
    ws: WebSocket | null;
    registeredAt: Date;
}

interface HandoffTokenData {
    userId: string;
    roomName: string;
    interpreterId: string | null;
    fromDeviceId: string;
    targetDeviceId: string;
    createdAt: Date;
    expiresAt: number;
}

interface HandoffStatus {
    inProgress: boolean;
    targetDeviceId?: string;
    roomName?: string;
    expiresAt?: number;
}

// Active VRS sessions: userId → Session
const activeSessions = new Map<string, Session>();

// One-time handoff tokens: token → HandoffTokenData
const handoffTokens = new Map<string, HandoffTokenData>();

const TOKEN_EXPIRY_MS = 60 * 1000;  // 60 seconds to complete handoff
const CLEANUP_INTERVAL_MS = 60 * 1000;

// ============================================
// SESSION MANAGEMENT
// ============================================

async function initialize(): Promise<void> {
    try {
        const [sessions, tokens] = await Promise.all([
            db.getAllActiveSessions(),
            db.getAllActiveHandoffTokens()
        ]);

        for (const session of sessions as Array<Record<string, any>>) {
            activeSessions.set(String(session.user_id), {
                userId: String(session.user_id),
                roomName: String(session.room_name || ''),
                interpreterId: session.interpreter_id ? String(session.interpreter_id) : null,
                deviceId: String(session.device_id || ''),
                ws: null,
                registeredAt: session.registered_at ? new Date(session.registered_at) : new Date()
            });
        }

        for (const token of tokens as Array<Record<string, any>>) {
            handoffTokens.set(String(token.token), {
                userId: String(token.user_id),
                roomName: String(token.room_name || ''),
                interpreterId: token.interpreter_id ? String(token.interpreter_id) : null,
                fromDeviceId: String(token.from_device_id || ''),
                targetDeviceId: String(token.target_device_id || ''),
                createdAt: token.created_at ? new Date(token.created_at) : new Date(),
                expiresAt: token.expires_at ? new Date(token.expires_at).getTime() : Date.now()
            });
        }

        await db.deleteExpiredHandoffTokens();
    } catch (error) {
        log.warn({ err: error }, 'Could not rehydrate handoff state from database; starting fresh');
    }
}

/**
 * Register that a device is actively in a VRS call.
 */
function registerSession(userId: string, roomName: string, deviceId: string, ws: WebSocket): void {
    activeSessions.set(userId, {
        userId,
        roomName,
        interpreterId: null,   // filled in by caller
        deviceId,
        ws,
        registeredAt: new Date()
    });
    void db.upsertActiveSession({ userId, roomName, interpreterId: null, deviceId });

    log.info({ userId, deviceId, roomName }, 'Session registered');
}

/**
 * Unregister a device's active session.
 */
function unregisterSession(userId: string): void {
    const session = activeSessions.get(userId);
    if (session) {
        log.info({ userId, deviceId: session.deviceId }, 'Session unregistered');
        activeSessions.delete(userId);
    }
    void db.deleteActiveSession(userId);
}

/**
 * Get the active session for a user.
 */
function getActiveSession(userId: string): Session | null {
    return activeSessions.get(userId) || null;
}

/**
 * Update the WebSocket connection for an existing session.
 */
function updateSessionWs(userId: string, ws: WebSocket): void {
    const session = activeSessions.get(userId);
    if (session) {
        session.ws = ws;
    }
}

function updateSessionInterpreter(userId: string, interpreterId: string | null): void {
    const session = activeSessions.get(userId);
    if (session) {
        session.interpreterId = interpreterId;
        void db.upsertActiveSession({
            userId,
            roomName: session.roomName,
            interpreterId,
            deviceId: session.deviceId
        });
    }
}

// ============================================
// HANDOFF TOKEN MANAGEMENT
// ============================================

interface PrepareHandoffResult {
    token: string;
    roomName: string;
    interpreterId: string | null;
}

interface PrepareHandoffError {
    error: string;
}

/**
 * Prepare a handoff by creating a one-time token.
 * Called by the sending device when the user confirms transfer.
 */
function prepareHandoff(userId: string, targetDeviceId: string): PrepareHandoffResult | PrepareHandoffError {
    const session = activeSessions.get(userId);
    if (!session) {
        return { error: 'No active session found for this user' };
    }

    // Invalidate any existing pending handoff for this user
    for (const [token, data] of handoffTokens) {
        if (data.userId === userId) {
            handoffTokens.delete(token);
        }
    }
    void db.deleteHandoffTokensByUser(userId);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

    handoffTokens.set(token, {
        userId,
        roomName: session.roomName,
        interpreterId: session.interpreterId,
        fromDeviceId: session.deviceId,
        targetDeviceId,
        createdAt: new Date(),
        expiresAt
    });
    void db.storeHandoffToken({
        token,
        userId,
        roomName: session.roomName,
        interpreterId: session.interpreterId,
        fromDeviceId: session.deviceId,
        targetDeviceId,
        expiresAt
    });

    log.info({ userId, targetDeviceId, roomName: session.roomName }, 'Handoff token created');

    return {
        token,
        roomName: session.roomName,
        interpreterId: session.interpreterId
    };
}

interface ExecuteHandoffResult {
    roomName: string;
    interpreterId: string | null;
    userId: string;
    fromDeviceId: string;
}

/**
 * Execute a handoff by redeeming a one-time token.
 * Called by the receiving device when it's ready to join.
 */
function executeHandoff(token: string, newDeviceId: string): ExecuteHandoffResult | PrepareHandoffError {
    const data = handoffTokens.get(token);

    if (!data) {
        return { error: 'Invalid or expired handoff token' };
    }

    if (Date.now() > data.expiresAt) {
        handoffTokens.delete(token);
        return { error: 'Handoff token has expired' };
    }

    // One-time use — remove immediately
    handoffTokens.delete(token);
    void db.deleteHandoffToken(token);

    // Update the active session to point to the new device
    const session = activeSessions.get(data.userId);
    if (session) {
        session.deviceId = newDeviceId;
        void db.upsertActiveSession({
            userId: data.userId,
            roomName: session.roomName,
            interpreterId: session.interpreterId,
            deviceId: newDeviceId
        });
    }

    log.info({
        userId: data.userId,
        fromDeviceId: data.fromDeviceId,
        newDeviceId,
        roomName: data.roomName
    }, 'Handoff executed');

    return {
        roomName: data.roomName,
        interpreterId: data.interpreterId,
        userId: data.userId,
        fromDeviceId: data.fromDeviceId
    };
}

/**
 * Check if a handoff is in progress for a user.
 */
function getHandoffStatus(userId: string): HandoffStatus {
    for (const [, data] of handoffTokens) {
        if (data.userId === userId && Date.now() <= data.expiresAt) {
            return {
                inProgress: true,
                targetDeviceId: data.targetDeviceId,
                roomName: data.roomName,
                expiresAt: data.expiresAt
            };
        }
    }

    return { inProgress: false };
}

function getHandoffByToken(token: string): Omit<HandoffTokenData, never> | null {
    const data = handoffTokens.get(token);
    if (!data) {
        return null;
    }

    if (Date.now() > data.expiresAt) {
        handoffTokens.delete(token);
        return null;
    }

    return { ...data };
}

/**
 * Cancel a pending handoff.
 */
function cancelHandoff(userId: string): boolean {
    for (const [token, data] of handoffTokens) {
        if (data.userId === userId) {
            handoffTokens.delete(token);
            void db.deleteHandoffTokensByUser(userId);
            log.info({ userId }, 'Handoff cancelled');
            return true;
        }
    }

    return false;
}

// ============================================
// CLEANUP
// ============================================

function cleanup(): void {
    const now = Date.now();

    // Remove expired tokens
    for (const [token, data] of handoffTokens) {
        if (now > data.expiresAt) {
            handoffTokens.delete(token);
            log.info({ userId: data.userId }, 'Cleaned up expired handoff token');
        }
    }
    void db.deleteExpiredHandoffTokens();

    // Remove sessions with dead WebSocket connections
    for (const [userId, session] of activeSessions) {
        if (session.ws && session.ws.readyState !== 1) { // not OPEN
            activeSessions.delete(userId);
            void db.deleteActiveSession(userId);
            log.info({ userId }, 'Cleaned up dead handoff session');
        }
    }
}

const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);

export {
    initialize,
    registerSession,
    unregisterSession,
    getActiveSession,
    updateSessionWs,
    updateSessionInterpreter,
    prepareHandoff,
    executeHandoff,
    getHandoffStatus,
    getHandoffByToken,
    cancelHandoff,
    cleanup
};

export type { Session, HandoffTokenData };
