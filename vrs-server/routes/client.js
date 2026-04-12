/**
 * Client-facing authenticated routes — profile, call history, speed dial, P2P, missed calls.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');

const router = express.Router();

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

function sanitizePhoneNumber(raw) {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) return null;
    return cleaned;
}

// ============================================
// PROFILE
// ============================================

router.get('/profile', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    try {
        const client = await db.getClient(req.user.id);
        if (!client) {
            return res.status(404).json({ error: 'Client not found' });
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
        console.error('[Client Profile] Error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ============================================
// CALL HISTORY
// ============================================

router.get('/call-history', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const limit = parseInt(String(req.query.limit)) || 20;
    const offset = parseInt(String(req.query.offset)) || 0;

    try {
        const calls = await db.getClientCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        console.error('[Client Call History] Error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

// ============================================
// SPEED DIAL
// ============================================

router.get('/speed-dial', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    try {
        const entries = await db.getSpeedDialEntries(req.user.id);
        res.json({ entries });
    } catch (error) {
        console.error('[Speed Dial Get] Error:', error);
        res.status(500).json({ error: 'Failed to fetch speed dial' });
    }
});

router.post('/speed-dial', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const { name, phoneNumber, category } = req.body;
    if (!name || !phoneNumber) {
        return res.status(400).json({ error: 'Missing required field: name or phoneNumber' });
    }

    const sanitized = sanitizePhoneNumber(phoneNumber);
    if (!sanitized) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        const entry = await db.addSpeedDialEntry({
            clientId: req.user.id,
            name,
            phoneNumber: sanitized,
            category
        });
        res.status(201).json({ entry });
    } catch (error) {
        console.error('[Speed Dial Add] Error:', error);
        res.status(500).json({ error: 'Failed to add speed dial entry' });
    }
});

router.put('/speed-dial/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const { name, phoneNumber, category } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (phoneNumber !== undefined) {
            const sanitized = sanitizePhoneNumber(phoneNumber);
            if (!sanitized) {
                return res.status(400).json({ error: 'Invalid phone number' });
            }
            updates.phoneNumber = sanitized;
        }
        if (category !== undefined) updates.category = category;

        const changes = await db.updateSpeedDialEntry(req.params.id, req.user.id, updates);
        if (changes === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Speed Dial Update] Error:', error);
        res.status(500).json({ error: 'Failed to update speed dial entry' });
    }
});

router.delete('/speed-dial/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    try {
        const changes = await db.deleteSpeedDialEntry(req.params.id, req.user.id);
        if (changes === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Speed Dial Delete] Error:', error);
        res.status(500).json({ error: 'Failed to delete speed dial entry' });
    }
});

// ============================================
// MISSED CALLS + LOOKUP
// ============================================

router.get('/missed-calls', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    try {
        const missed = await db.getMissedCalls(req.user.id);
        res.json({ missed });
    } catch (error) {
        console.error('[Missed Calls] Error:', error);
        res.status(500).json({ error: 'Failed to fetch missed calls' });
    }
});

router.get('/lookup-phone', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const { phone } = req.query;
    if (!phone) {
        return res.status(400).json({ error: 'phone query parameter required' });
    }

    const sanitized = sanitizePhoneNumber(phone);
    if (!sanitized) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        const target = await db.getClientByPhoneNumber(sanitized);
        if (!target) {
            return res.status(404).json({ error: 'No client found with that number' });
        }

        res.json({
            id: target.id,
            name: target.name,
            phone: sanitized
        });
    } catch (error) {
        console.error('[Lookup Phone] Error:', error);
        res.status(500).json({ error: 'Lookup failed' });
    }
});

module.exports = router;
