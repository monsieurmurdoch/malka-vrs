/**
 * TTS Fallback REST API routes.
 *
 * Provides endpoints for:
 *   - GET/PUT voice settings (gender, speed, pitch, STS mode)
 *   - CRUD for quick phrases
 *   - Start/end VCO call sessions
 */

const express = require('express');
const ttsService = require('../lib/tts-service');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('tts-routes');
const { validate, z, sanitizeStrict } = require('../lib/validation');

const router = express.Router();

// ============================================
// SCHEMAS
// ============================================

const voiceSettingsSchema = z.object({
    voiceName: z.string().max(100).optional(),
    voiceGender: z.enum(['male', 'female']).optional(),
    voiceSpeed: z.number().min(0.5).max(2.0).optional(),
    voicePitch: z.number().min(0.5).max(2.0).optional(),
    stsMode: z.boolean().optional()
});

const addPhraseSchema = z.object({
    text: z.string().min(1).max(500).transform(sanitizeStrict),
    label: z.string().max(100).transform(sanitizeStrict).optional(),
    sortOrder: z.number().int().min(0).optional()
});

const updatePhraseSchema = z.object({
    text: z.string().min(1).max(500).transform(sanitizeStrict).optional(),
    label: z.string().max(100).transform(sanitizeStrict).optional(),
    sortOrder: z.number().int().min(0).optional()
});

// ============================================
// MIDDLEWARE
// ============================================

function authenticateClient(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required', code: 'AUTH_REQUIRED' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = normalizeAuthClaims(verifyJwtToken(token));
        if (req.user.role !== 'client') {
            return res.status(403).json({ error: 'Client access required', code: 'FORBIDDEN' });
        }
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token', code: 'AUTH_INVALID' });
    }
}

// ============================================
// VOICE SETTINGS
// ============================================

/**
 * GET /api/tts/settings
 * Get the current TTS voice settings for the authenticated client.
 */
router.get('/settings', authenticateClient, async (req, res) => {
    try {
        const settings = await ttsService.getSettings(req.user.id);
        res.json({ settings });
    } catch (error) {
        req.log.error({ err: error }, 'TTS settings get error');
        res.status(500).json({ error: 'Failed to get TTS settings', code: 'INTERNAL_ERROR' });
    }
});

/**
 * PUT /api/tts/settings
 * Update TTS voice settings for the authenticated client.
 */
router.put('/settings', authenticateClient, validate(voiceSettingsSchema), async (req, res) => {
    try {
        await ttsService.updateSettings(req.user.id, req.body);
        const settings = await ttsService.getSettings(req.user.id);
        res.json({ settings });
    } catch (error) {
        req.log.error({ err: error }, 'TTS settings update error');
        res.status(500).json({ error: 'Failed to update TTS settings', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// QUICK PHRASES
// ============================================

/**
 * GET /api/tts/phrases
 * Get all quick phrases for the authenticated client.
 */
router.get('/phrases', authenticateClient, async (req, res) => {
    try {
        const phrases = await ttsService.getQuickPhrases(req.user.id);
        res.json({ phrases });
    } catch (error) {
        req.log.error({ err: error }, 'Quick phrases get error');
        res.status(500).json({ error: 'Failed to get quick phrases', code: 'INTERNAL_ERROR' });
    }
});

/**
 * POST /api/tts/phrases
 * Add a new quick phrase.
 */
router.post('/phrases', authenticateClient, validate(addPhraseSchema), async (req, res) => {
    try {
        const phrase = await ttsService.addQuickPhrase(req.user.id, req.body);
        res.status(201).json({ phrase });
    } catch (error) {
        req.log.error({ err: error }, 'Quick phrase add error');
        res.status(500).json({ error: 'Failed to add quick phrase', code: 'INTERNAL_ERROR' });
    }
});

/**
 * PUT /api/tts/phrases/:id
 * Update an existing quick phrase.
 */
router.put('/phrases/:id', authenticateClient, validate(updatePhraseSchema), async (req, res) => {
    try {
        const changes = await ttsService.updateQuickPhrase(req.user.id, req.params.id, req.body);
        if (changes === 0) {
            return res.status(404).json({ error: 'Phrase not found', code: 'NOT_FOUND' });
        }
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Quick phrase update error');
        res.status(500).json({ error: 'Failed to update quick phrase', code: 'INTERNAL_ERROR' });
    }
});

/**
 * DELETE /api/tts/phrases/:id
 * Delete a quick phrase.
 */
router.delete('/phrases/:id', authenticateClient, async (req, res) => {
    try {
        const changes = await ttsService.deleteQuickPhrase(req.user.id, req.params.id);
        if (changes === 0) {
            return res.status(404).json({ error: 'Phrase not found', code: 'NOT_FOUND' });
        }
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Quick phrase delete error');
        res.status(500).json({ error: 'Failed to delete quick phrase', code: 'INTERNAL_ERROR' });
    }
});

/**
 * POST /api/tts/seed-phrases
 * Seed default quick phrases for the authenticated client.
 */
router.post('/seed-phrases', authenticateClient, async (req, res) => {
    try {
        await ttsService.seedDefaultPhrases(req.user.id);
        const phrases = await ttsService.getQuickPhrases(req.user.id);
        res.json({ phrases });
    } catch (error) {
        req.log.error({ err: error }, 'Seed phrases error');
        res.status(500).json({ error: 'Failed to seed phrases', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
