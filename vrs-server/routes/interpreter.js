/**
 * Interpreter authenticated routes — profile, call history, shifts, earnings, stats.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('interpreter');
const { validate, nonNegativeIntSchema, z } = require('../lib/validation');

const router = express.Router();

const callHistoryQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(20),
    offset: nonNegativeIntSchema.optional().default(0)
});

const shiftsQuerySchema = z.object({
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional()
});

const earningsQuerySchema = z.object({
    periodStart: z.string().min(1).optional(),
    periodEnd: z.string().min(1).optional()
});

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
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
    }

    try {
        const interpreter = await db.getInterpreter(req.user.id);
        if (!interpreter) {
            return res.status(404).json({ error: 'Interpreter not found', code: 'NOT_FOUND' });
        }

        res.json({
            id: interpreter.id,
            name: interpreter.name,
            email: interpreter.email,
            languages: interpreter.languages,
            active: interpreter.active
        });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter profile error');
        res.status(500).json({ error: 'Failed to fetch profile', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// UPDATE PROFILE
// ============================================

router.put('/profile', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
    }

    const { name, email, languages } = req.body;

    try {
        await db.updateInterpreter(req.user.id, { name, email, languages });
        const interpreter = await db.getInterpreter(req.user.id);
        res.json({
            id: interpreter.id,
            name: interpreter.name,
            email: interpreter.email,
            languages: interpreter.languages,
            active: interpreter.active
        });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter profile update error');
        res.status(500).json({ error: 'Failed to update profile', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// CALL HISTORY
// ============================================

router.get('/call-history', authenticateUser, validate(callHistoryQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
    }

    const { limit, offset } = req.query;

    try {
        const calls = await db.getInterpreterCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter call history error');
        res.status(500).json({ error: 'Failed to fetch call history', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// SHIFTS
// ============================================

router.get('/shifts', authenticateUser, validate(shiftsQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
    }

    const { startDate, endDate } = req.query;

    try {
        const shifts = await db.getInterpreterShifts(req.user.id, String(startDate), String(endDate));
        res.json({ shifts });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter shifts error');
        res.status(500).json({ error: 'Failed to fetch shifts', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// EARNINGS
// ============================================

router.get('/earnings', authenticateUser, validate(earningsQuerySchema, 'query'), async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
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
        req.log.error({ err: error }, 'Interpreter earnings error');
        res.status(500).json({ error: 'Failed to fetch earnings', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// STATS
// ============================================

router.get('/stats', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
    }

    try {
        const stats = await db.getInterpreterStats(req.user.id);
        res.json(stats);
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter stats error');
        res.status(500).json({ error: 'Failed to fetch stats', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
