/**
 * Client-facing authenticated routes — profile, call history, speed dial, P2P, missed calls.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('client');
const { validate, nameSchema, phoneNumberSchema, nonNegativeIntSchema, idSchema, emptyBodySchema, sanitizeStrict, z } = require('../lib/validation');

const router = express.Router();

// ============================================
// SCHEMAS
// ============================================

const addSpeedDialSchema = z.object({
    name: nameSchema,
    phoneNumber: phoneNumberSchema,
    category: z.string().max(50).transform(sanitizeStrict).optional()
});

const updateSpeedDialSchema = z.object({
    name: nameSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
    category: z.string().max(50).transform(sanitizeStrict).optional()
});

const lookupPhoneQuerySchema = z.object({
    phone: phoneNumberSchema
});

const handleSchema = z.string()
    .min(3)
    .max(31)
    .transform(value => value.trim().replace(/^@+/, '').toLowerCase())
    .refine(value => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(value), 'Invalid handle');

const handleVisibilitySchema = z.enum(['public', 'private']).default('public');

const upsertHandleSchema = z.object({
    handle: handleSchema,
    phoneNumberId: idSchema.optional(),
    visibility: handleVisibilitySchema.optional()
});

const lookupHandleQuerySchema = z.object({
    handle: handleSchema
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

        const [phones, handles] = await Promise.all([
            db.getClientPhoneNumbers(req.user.id),
            db.getClientHandles(req.user.id)
        ]);
        const primary = phones.find(p => p.is_primary);

        res.json({
            id: client.id,
            name: client.name,
            email: client.email,
            organization: client.organization,
            serviceModes: client.service_modes || ['vrs'],
            tenantId: client.tenant_id || 'malka',
            primaryPhone: primary?.phone_number || null,
            phoneNumbers: phones,
            handles
        });
    } catch (error) {
        req.log.error({ err: error }, 'Client profile error');
        res.status(500).json({ error: 'Failed to fetch profile', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// UPDATE PROFILE
// ============================================

const updateProfileSchema = z.object({
    name: nameSchema.optional(),
    email: z.string().email().max(255).optional(),
    organization: z.string().max(255).optional()
});

router.put('/profile', authenticateUser, validate(updateProfileSchema), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        await db.updateClient(req.user.id, req.body);
        const client = await db.getClient(req.user.id);
        const [phones, handles] = await Promise.all([
            db.getClientPhoneNumbers(req.user.id),
            db.getClientHandles(req.user.id)
        ]);
        const primary = phones.find(p => p.is_primary);

        res.json({
            id: client.id,
            name: client.name,
            email: client.email,
            organization: client.organization,
            serviceModes: client.service_modes || ['vrs'],
            tenantId: client.tenant_id || 'malka',
            primaryPhone: primary?.phone_number || null,
            phoneNumbers: phones,
            handles
        });
    } catch (error) {
        req.log.error({ err: error }, 'Client profile update error');
        res.status(500).json({ error: 'Failed to update profile', code: 'INTERNAL_ERROR' });
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

router.post('/missed-calls/mark-seen', authenticateUser, validate(emptyBodySchema), async (req, res) => {
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

router.get('/handles', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const handles = await db.getClientHandles(req.user.id);
        res.json({ handles });
    } catch (error) {
        req.log.error({ err: error }, 'Get handles error');
        res.status(500).json({ error: 'Failed to fetch handles', code: 'INTERNAL_ERROR' });
    }
});

router.put('/handles/primary', authenticateUser, validate(upsertHandleSchema), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const handle = await db.upsertClientHandle({
            clientId: req.user.id,
            handle: req.body.handle,
            phoneNumberId: req.body.phoneNumberId,
            visibility: req.body.visibility
        });
        res.json({ handle });
    } catch (error) {
        const code = error.code || 'INTERNAL_ERROR';
        const status = code === 'HANDLE_TAKEN' ? 409 : code === 'INVALID_HANDLE' || code === 'PHONE_REQUIRED' ? 400 : 500;
        req.log[status >= 500 ? 'error' : 'warn']({ err: error }, 'Save handle failed');
        res.status(status).json({ error: error.message || 'Failed to save handle', code });
    }
});

router.delete('/handles/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        await db.deleteClientHandle(req.user.id, req.params.id);
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Delete handle error');
        res.status(500).json({ error: 'Failed to delete handle', code: 'INTERNAL_ERROR' });
    }
});

router.get('/lookup-handle', authenticateUser, validate(lookupHandleQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const target = await db.getClientByHandle(req.query.handle, req.user.id);
        if (!target) {
            return res.json({ found: false });
        }

        res.json({
            found: true,
            id: target.id,
            name: target.name,
            handle: target.handle,
            phone: target.phone_number
        });
    } catch (error) {
        req.log.error({ err: error }, 'Lookup handle error');
        res.status(500).json({ error: 'Handle lookup failed', code: 'INTERNAL_ERROR' });
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

// ============================================
// CLIENT PREFERENCES (DND, Dark Mode, Media Defaults)
// ============================================

const preferencesUpdateSchema = z.object({
    dnd_enabled: z.boolean().optional(),
    dnd_message: z.string().max(200).transform(sanitizeStrict).optional(),
    dark_mode: z.enum(['light', 'dark', 'system']).optional(),
    camera_default_off: z.boolean().optional(),
    mic_default_off: z.boolean().optional(),
    skip_waiting_room: z.boolean().optional(),
    remember_media_permissions: z.boolean().optional(),
    notifications_enabled: z.boolean().optional(),
    notify_missed_calls: z.boolean().optional(),
    notify_voicemail: z.boolean().optional(),
    notify_queue_updates: z.boolean().optional()
});

router.get('/preferences', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const prefs = await db.getClientPreferences(req.user.id);
        res.json(prefs);
    } catch (error) {
        req.log.error({ err: error }, 'Get preferences error');
        res.status(500).json({ error: 'Failed to get preferences', code: 'INTERNAL_ERROR' });
    }
});

router.put('/preferences', authenticateUser, validate(preferencesUpdateSchema), async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        await db.updateClientPreferences(req.user.id, req.body);
        const prefs = await db.getClientPreferences(req.user.id);
        res.json(prefs);
    } catch (error) {
        req.log.error({ err: error }, 'Update preferences error');
        res.status(500).json({ error: 'Failed to update preferences', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// IN-CALL CHAT (REST fallback)
// ============================================

router.get('/chat/:callId', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
    }

    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
        const offset = parseInt(req.query.offset) || 0;
        const messages = await db.getChatMessages(req.params.callId, limit, offset);
        res.json({ messages });
    } catch (error) {
        req.log.error({ err: error }, 'Get chat messages error');
        res.status(500).json({ error: 'Failed to get chat messages', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
