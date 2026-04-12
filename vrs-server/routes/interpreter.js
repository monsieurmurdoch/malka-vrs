/**
 * Interpreter authenticated routes — profile, call history, shifts, earnings, stats.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');

const router = express.Router();

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

// ============================================
// PROFILE
// ============================================

router.get('/profile', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    try {
        const interpreter = await db.getInterpreter(req.user.id);
        if (!interpreter) {
            return res.status(404).json({ error: 'Interpreter not found' });
        }

        res.json({
            id: interpreter.id,
            name: interpreter.name,
            email: interpreter.email,
            languages: interpreter.languages,
            active: interpreter.active
        });
    } catch (error) {
        console.error('[Interpreter Profile] Error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ============================================
// CALL HISTORY
// ============================================

router.get('/call-history', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const limit = parseInt(String(req.query.limit)) || 20;
    const offset = parseInt(String(req.query.offset)) || 0;

    try {
        const calls = await db.getInterpreterCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        console.error('[Interpreter Call History] Error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

// ============================================
// SHIFTS
// ============================================

router.get('/shifts', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const { startDate, endDate } = req.query;

    try {
        const shifts = await db.getInterpreterShifts(req.user.id, String(startDate), String(endDate));
        res.json({ shifts });
    } catch (error) {
        console.error('[Interpreter Shifts] Error:', error);
        res.status(500).json({ error: 'Failed to fetch shifts' });
    }
});

// ============================================
// EARNINGS
// ============================================

router.get('/earnings', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const periodStart = String(req.query.periodStart) || defaultStart;
    const periodEnd = String(req.query.periodEnd) || defaultEnd;

    try {
        const earnings = await db.getInterpreterEarnings(req.user.id, periodStart, periodEnd);
        res.json({ earnings });
    } catch (error) {
        console.error('[Interpreter Earnings] Error:', error);
        res.status(500).json({ error: 'Failed to fetch earnings' });
    }
});

// ============================================
// STATS
// ============================================

router.get('/stats', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    try {
        const stats = await db.getInterpreterStats(req.user.id);
        res.json(stats);
    } catch (error) {
        console.error('[Interpreter Stats] Error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
