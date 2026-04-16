/**
 * Handoff REST routes — prepare, execute, status.
 * Device handoff allows moving an active call from one device to another.
 */

const express = require('express');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const handoffService = require('../lib/handoff-service');
const state = require('../lib/state');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const { validate, z } = require('../lib/validation');

const router = express.Router();

function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required', code: 'AUTH_REQUIRED' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = normalizeAuthClaims(verifyJwtToken(token));
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token', code: 'AUTH_INVALID' });
    }
}

const prepareSchema = z.object({
    userId: z.string().min(1),
    targetDeviceId: z.string().min(1)
});

const executeSchema = z.object({
    token: z.string().min(1),
    newDeviceId: z.string().min(1)
});

function requireClientOwnership(req, res, userId) {
    if (req.user.role !== 'client') {
        res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
        return false;
    }

    if (req.user.id !== userId) {
        res.status(403).json({ error: 'Can only manage handoff for your own session', code: 'FORBIDDEN' });
        return false;
    }

    return true;
}

// Prepare a handoff by creating a one-time token
router.post('/prepare', authenticateUser, validate(prepareSchema), (req, res) => {
    const { userId, targetDeviceId } = req.body;

    if (!requireClientOwnership(req, res, userId)) {
        return;
    }

    const result = handoffService.prepareHandoff(userId, targetDeviceId);

    if (result.error) {
        return res.status(400).json({ error: result.error, code: 'HANDOFF_ERROR' });
    }

    // Notify the interpreter about the handoff
    const session = handoffService.getActiveSession(userId);
    if (session && session.interpreterId) {
        const interpreterWs = state.findInterpreterSocketByUserId(session.interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({
                type: 'handoff_in_progress',
                data: { userId, roomName: session.roomName, estimatedDuration: '2s' }
            }));
        }
    }

    activityLogger.log('handoff_prepare_rest', { userId, targetDeviceId, roomName: result.roomName });
    res.json(result);
});

// Execute a handoff by redeeming a one-time token
router.post('/execute', authenticateUser, validate(executeSchema), (req, res) => {
    const { token, newDeviceId } = req.body;
    const pendingHandoff = handoffService.getHandoffByToken(token);
    if (!pendingHandoff) {
        return res.status(400).json({ error: 'Invalid or expired handoff token', code: 'INVALID_TOKEN' });
    }

    if (!requireClientOwnership(req, res, pendingHandoff.userId)) {
        return;
    }

    const result = handoffService.executeHandoff(token, newDeviceId);

    if (result.error) {
        return res.status(400).json({ error: result.error, code: 'HANDOFF_ERROR' });
    }

    // Notify the original device that the token was consumed
    const session = handoffService.getActiveSession(result.userId);
    const WebSocket = require('ws');
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
            type: 'handoff_consumed',
            data: { newDeviceId, roomName: result.roomName }
        }));
    }

    activityLogger.log('handoff_execute_rest', { userId: result.userId, newDeviceId });
    res.json(result);
});

// Check handoff status
router.get('/status', authenticateUser, (req, res) => {
    const userId = req.query.userId || req.user.id;
    if (!requireClientOwnership(req, res, userId)) {
        return;
    }

    const status = handoffService.getHandoffStatus(userId);
    res.json(status);
});

module.exports = router;
