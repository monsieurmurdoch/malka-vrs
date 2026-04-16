/**
 * Client-facing authenticated routes — profile, call history, speed dial, P2P, missed calls.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('client');
const { validate, nameSchema, phoneNumberSchema, nonNegativeIntSchema, z } = require('../lib/validation');

const router = express.Router();

// ============================================
// SCHEMAS
// ============================================

const addSpeedDialSchema = z.object({
    name: nameSchema,
    phoneNumber: phoneNumberSchema,
    category: z.string().max(50).optional()
});

const updateSpeedDialSchema = z.object({
    name: nameSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    category: z.string().max(50).optional()
});

const lookupPhoneQuerySchema = z.object({
    phone: phoneNumberSchema
});

const callHistoryQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(20),
    offset: nonNegativeIntSchema.optional().default(0)
});

// ============================================
// MIDDLEWARE
// ============================================

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

// ============================================
// PROFILE
// ============================================

router.get('/profile', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const client = await db.getClient(req.user.id);
        if (!client) {
            return res.status(404).json({ error: 'Client not found', code: 'NOT_FOUND' });
        }

        const phones = await db.getClientPhoneNumbers(req.user.id);
        const primary = phones.find(p => p.is_primary);

        res.json({
            id: client.id,
            name: client.name,
            email: client.email,
            organization: client.organization,
            primaryPhone: primary?.phone_number || null,
            phoneNumbers: phones
        });
    } catch (error) {
        req.log.error({ err: error }, 'Client profile error');
        res.status(500).json({ error: 'Failed to fetch profile', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// CALL HISTORY
// ============================================

router.get('/call-history', authenticateUser, validate(callHistoryQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    const { limit, offset } = req.query;

    try {
        const calls = await db.getClientCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        req.log.error({ err: error }, 'Client call history error');
        res.status(500).json({ error: 'Failed to fetch call history', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// SPEED DIAL
// ============================================

router.get('/speed-dial', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const entries = await db.getSpeedDialEntries(req.user.id);
        res.json({ entries });
    } catch (error) {
        req.log.error({ err: error }, 'Speed dial get error');
        res.status(500).json({ error: 'Failed to fetch speed dial', code: 'INTERNAL_ERROR' });
    }
});

router.post('/speed-dial', authenticateUser, validate(addSpeedDialSchema), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    const { name, phoneNumber, category } = req.body;

    try {
        const entry = await db.addSpeedDialEntry({
            clientId: req.user.id,
            name,
            phoneNumber,
            category
        });
        res.status(201).json({ entry });
    } catch (error) {
        req.log.error({ err: error }, 'Speed dial add error');
        res.status(500).json({ error: 'Failed to add speed dial entry', code: 'INTERNAL_ERROR' });
    }
});

router.put('/speed-dial/:id', authenticateUser, validate(updateSpeedDialSchema), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const updates = {};
        if (req.body.name !== undefined) updates.name = req.body.name;
        if (req.body.phoneNumber !== undefined) updates.phoneNumber = req.body.phoneNumber;
        if (req.body.category !== undefined) updates.category = req.body.category;

        const changes = await db.updateSpeedDialEntry(req.params.id, req.user.id, updates);
        if (changes === 0) {
            return res.status(404).json({ error: 'Entry not found', code: 'NOT_FOUND' });
        }
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Speed dial update error');
        res.status(500).json({ error: 'Failed to update speed dial entry', code: 'INTERNAL_ERROR' });
    }
});

router.delete('/speed-dial/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const changes = await db.deleteSpeedDialEntry(req.params.id, req.user.id);
        if (changes === 0) {
            return res.status(404).json({ error: 'Entry not found', code: 'NOT_FOUND' });
        }
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Speed dial delete error');
        res.status(500).json({ error: 'Failed to delete speed dial entry', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// MISSED CALLS + LOOKUP
// ============================================

router.get('/missed-calls', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const missed = await db.getMissedCalls(req.user.id);
        // Preserve the legacy response field while keeping the newer name.
        res.json({ missed, missedCalls: missed });
    } catch (error) {
        req.log.error({ err: error }, 'Missed calls error');
        res.status(500).json({ error: 'Failed to fetch missed calls', code: 'INTERNAL_ERROR' });
    }
});

router.post('/missed-calls/mark-seen', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        await db.markMissedCallsSeen(req.user.id);
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Mark seen error');
        res.status(500).json({ error: 'Failed to mark missed calls as seen', code: 'INTERNAL_ERROR' });
    }
});

router.get('/lookup-phone', authenticateUser, validate(lookupPhoneQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    const { phone } = req.query;

    try {
        const target = await db.getClientByPhoneNumber(phone);
        if (!target) {
            return res.json({ found: false });
        }

        res.json({
            found: true,
            id: target.id,
            name: target.name,
            phone
        });
    } catch (error) {
        req.log.error({ err: error }, 'Lookup phone error');
        res.status(500).json({ error: 'Lookup failed', code: 'INTERNAL_ERROR' });
    }
});

router.get('/active-rooms', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const rooms = await db.getActiveP2PRoomsForClient(req.user.id);
        res.json({ rooms });
    } catch (error) {
        req.log.error({ err: error }, 'Active rooms error');
        res.status(500).json({ error: 'Failed to fetch active rooms', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
