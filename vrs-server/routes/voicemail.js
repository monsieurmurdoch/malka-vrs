/**
 * Voicemail Routes — Client-facing and Jibri callback endpoints
 *
 * Provides REST API for voicemail inbox, playback, recording management,
 * and the internal Jibri callback for recording completion.
 */

const express = require('express');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('voicemail');
const { validate, z, phoneNumberSchema, roomNameSchema, nonNegativeIntSchema, emptyBodySchema } = require('../lib/validation');

const router = express.Router();

// Voicemail service — set via setVoicemailService()
let voicemailService = null;

const voicemailStartSchema = z.object({
    calleePhone: phoneNumberSchema.optional()
});

const jibriCallbackSchema = z.object({
    roomName: roomNameSchema,
    storageKey: z.string().min(1).max(1000),
    fileSizeBytes: nonNegativeIntSchema.optional(),
    durationSeconds: nonNegativeIntSchema.optional(),
    contentType: z.string().max(120).optional()
});

function setVoicemailService(service) {
    voicemailService = service;
}

// ============================================
// MIDDLEWARE
// ============================================

function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = normalizeAuthClaims(verifyJwtToken(token));
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function authenticateClient(req, res, next) {
    authenticateUser(req, res, () => {
        if (req.user.role !== 'client') {
            return res.status(403).json({ error: 'Client access required' });
        }
        next();
    });
}

function authenticateJibri(req, res, next) {
    const secret = req.headers['x-jibri-secret'];
    const expectedSecret = process.env.JIBRI_CALLBACK_SECRET || 'jibri-callback-secret';
    if (secret !== expectedSecret) {
        return res.status(403).json({ error: 'Invalid callback secret' });
    }
    next();
}

function ensureService(req, res, next) {
    if (!voicemailService) {
        return res.status(503).json({ error: 'Voicemail service not available' });
    }
    next();
}

// ============================================
// CLIENT ENDPOINTS
// ============================================

/**
 * GET /api/voicemail/inbox
 * Get paginated voicemail inbox for the authenticated client.
 */
router.get('/inbox', authenticateClient, ensureService, async (req, res) => {
    try {
        const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
        const offset = parseInt(String(req.query.offset)) || 0;

        const result = await voicemailService.getInbox(req.user.id, limit, offset);
        res.json(result);
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch voicemail inbox');
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});

/**
 * GET /api/voicemail/unread-count
 * Get unread voicemail count for badge display.
 */
router.get('/unread-count', authenticateClient, ensureService, async (req, res) => {
    try {
        const count = await voicemailService.getUnreadCount(req.user.id);
        res.json({ count });
    } catch (error) {
        log.error({ err: error }, 'Failed to get unread count');
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

/**
 * GET /api/voicemail/messages/:id
 * Get a single voicemail message with a presigned playback URL.
 */
router.get('/messages/:id', authenticateClient, ensureService, async (req, res) => {
    try {
        const message = await voicemailService.getMessageWithPlayback(req.params.id, req.user.id);
        res.json(message);
    } catch (error) {
        if (error.message === 'Message not found') {
            return res.status(404).json({ error: 'Message not found' });
        }
        if (error.message === 'Not authorized to view this message') {
            return res.status(403).json({ error: error.message });
        }
        log.error({ err: error }, 'Failed to get voicemail message');
        res.status(500).json({ error: 'Failed to get message' });
    }
});

/**
 * DELETE /api/voicemail/messages/:id
 * Delete a voicemail message (caller or callee only).
 */
router.delete('/messages/:id', authenticateClient, ensureService, async (req, res) => {
    try {
        await voicemailService.deleteMessage(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        if (error.message === 'Message not found') {
            return res.status(404).json({ error: 'Message not found' });
        }
        if (error.message.startsWith('Not authorized')) {
            return res.status(403).json({ error: error.message });
        }
        log.error({ err: error }, 'Failed to delete voicemail message');
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

/**
 * POST /api/voicemail/messages/:id/seen
 * Mark a voicemail message as seen.
 */
router.post('/messages/:id/seen', authenticateClient, ensureService, validate(emptyBodySchema), async (req, res) => {
    try {
        await voicemailService.markMessageSeen(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Failed to mark message as seen');
        res.status(500).json({ error: 'Failed to mark message as seen' });
    }
});

/**
 * POST /api/voicemail/start
 * Start a new voicemail recording session.
 * Body: { calleePhone: string }
 */
router.post('/start', authenticateClient, ensureService, validate(voicemailStartSchema), async (req, res) => {
    try {
        const { calleePhone } = req.body;

        // Look up callee by phone number to get their client ID
        const db = require('../database');
        let calleeId = null;
        if (calleePhone) {
            const callee = await db.getClientByPhoneNumber(calleePhone);
            if (callee) {
                calleeId = callee.id;
            }
        }

        const result = await voicemailService.startRecording(
            req.user.id,
            calleeId,
            calleePhone || null
        );

        res.json(result);
    } catch (error) {
        if (error.message.includes('disabled') || error.message.includes('full') || error.message.includes('quota')) {
            return res.status(400).json({ error: error.message });
        }
        log.error({ err: error }, 'Failed to start voicemail recording');
        res.status(500).json({ error: 'Failed to start recording' });
    }
});

/**
 * POST /api/voicemail/cancel/:id
 * Cancel an active voicemail recording.
 */
router.post('/cancel/:id', authenticateClient, ensureService, validate(emptyBodySchema), async (req, res) => {
    try {
        await voicemailService.cancelRecording(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        if (error.message.includes('not found') || error.message.includes('not owned')) {
            return res.status(404).json({ error: error.message });
        }
        log.error({ err: error }, 'Failed to cancel voicemail recording');
        res.status(500).json({ error: 'Failed to cancel recording' });
    }
});

// ============================================
// JIBRI CALLBACK (INTERNAL)
// ============================================

/**
 * POST /api/voicemail/jibri-callback
 * Called by the Jibri finalize script after recording completes.
 * Secured with a shared secret via X-Jibri-Secret header.
 *
 * Body: { roomName, storageKey, fileSizeBytes, durationSeconds, contentType }
 */
router.post('/jibri-callback', authenticateJibri, ensureService, validate(jibriCallbackSchema), async (req, res) => {
    try {
        const { roomName, storageKey, fileSizeBytes, durationSeconds } = req.body;

        // Find the voicemail message by room name
        const db = require('../database');
        const message = await db.getVoicemailMessageByRoomName(roomName);
        if (!message) {
            return res.status(404).json({ error: 'No voicemail recording found for room' });
        }

        await voicemailService.completeRecording(
            message.id,
            storageKey,
            parseInt(String(durationSeconds)) || 0,
            parseInt(String(fileSizeBytes)) || 0
        );

        res.json({ success: true });
    } catch (error) {
        log.error({ err: error }, 'Jibri callback failed');
        res.status(500).json({ error: 'Callback processing failed' });
    }
});

// ============================================
// EXPORT
// ============================================

module.exports = { router, setVoicemailService };
