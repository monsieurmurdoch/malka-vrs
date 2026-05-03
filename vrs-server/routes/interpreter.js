/**
 * Interpreter authenticated routes — profile, call history, shifts, earnings, stats.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const log = require('../lib/logger').module('interpreter');
const { validate, nameSchema, emailSchema, languageSchema, serviceModesArraySchema, nonNegativeIntSchema, sanitizeStrict, z } = require('../lib/validation');

const router = express.Router();

const callHistoryQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(20),
    offset: nonNegativeIntSchema.optional().default(0)
});

const shiftsQuerySchema = z.object({
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional()
});

const shiftStatusSchema = z.enum(['scheduled', 'confirmed', 'pending', 'unavailable', 'time-off', 'completed', 'cancelled']);

const shiftWriteSchema = z.object({
    date: z.string().min(8).max(20),
    startTime: z.string().min(1).max(20),
    endTime: z.string().max(20).optional(),
    totalMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
    status: shiftStatusSchema.optional().default('scheduled')
});

const shiftUpdateSchema = z.object({
    endTime: z.string().max(20).optional(),
    totalMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
    status: shiftStatusSchema.optional()
});

const earningsQuerySchema = z.object({
    periodStart: z.string().min(1).optional(),
    periodEnd: z.string().min(1).optional()
});

const analyticsQuerySchema = z.object({
    periodStart: z.string().min(1).optional(),
    periodEnd: z.string().min(1).optional()
});

const breaksQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(20)
});

const startBreakSchema = z.object({
    breakType: z.enum(['general', 'meal', 'rest', 'admin', 'technical']).optional().default('general'),
    reason: z.string().max(500).transform(sanitizeStrict).optional(),
    paid: z.boolean().optional().default(false)
});

const continuityNotesQuerySchema = z.object({
    clientId: z.string().min(1).max(120).optional(),
    limit: nonNegativeIntSchema.optional().default(20)
});

const continuityNoteSchema = z.object({
    clientId: z.string().min(1).max(120).optional(),
    callId: z.string().min(1).max(120).optional(),
    note: z.string().min(1).max(2000).transform(sanitizeStrict),
    visibility: z.enum(['self', 'team', 'admin']).optional().default('self'),
    preferenceTags: z.array(z.string().min(1).max(40)).optional().default([])
});

const postCallSurveySchema = z.object({
    callId: z.string().min(1).max(120).optional(),
    rating: z.coerce.number().int().min(1).max(5),
    tags: z.array(z.string().min(1).max(40)).optional().default([]),
    comments: z.string().max(2000).transform(sanitizeStrict).optional()
});

const teamingQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(20)
});

const teamingRequestSchema = z.object({
    teammateInterpreterId: z.string().min(1).max(120).optional(),
    callId: z.string().min(1).max(120).optional(),
    roomName: z.string().min(1).max(120).optional(),
    notes: z.string().max(1000).transform(sanitizeStrict).optional()
});

const updateProfileSchema = z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    languages: z.array(languageSchema).min(1).optional(),
    serviceModes: serviceModesArraySchema
});

function defaultDateWindow() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { periodStart, periodEnd };
}

function defaultWeekWindow() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        periodStart: monday.toISOString().split('T')[0],
        periodEnd: sunday.toISOString().split('T')[0]
    };
}

function requireInterpreter(req, res) {
    if (req.user.role !== 'interpreter') {
        res.status(403).json({ error: 'Interpreter access required', code: 'FORBIDDEN' });
        return false;
    }
    return true;
}

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
    if (!requireInterpreter(req, res)) return;

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
            serviceModes: interpreter.service_modes || ['vrs'],
            tenantId: interpreter.tenant_id || 'malka',
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

router.put('/profile', authenticateUser, validate(updateProfileSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    const { name, email, languages, serviceModes } = req.body;

    try {
        await db.updateInterpreter(req.user.id, { name, email, languages, serviceModes });
        const interpreter = await db.getInterpreter(req.user.id);
        res.json({
            id: interpreter.id,
            name: interpreter.name,
            email: interpreter.email,
            languages: interpreter.languages,
            serviceModes: interpreter.service_modes || ['vrs'],
            tenantId: interpreter.tenant_id || 'malka',
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
    if (!requireInterpreter(req, res)) return;

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
    if (!requireInterpreter(req, res)) return;

    const { startDate, endDate } = req.query;

    try {
        const shifts = await db.getInterpreterShifts(
            req.user.id,
            startDate ? String(startDate) : undefined,
            endDate ? String(endDate) : undefined
        );
        res.json({ shifts });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter shifts error');
        res.status(500).json({ error: 'Failed to fetch shifts', code: 'INTERNAL_ERROR' });
    }
});

router.post('/shifts', authenticateUser, validate(shiftWriteSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const shift = await db.createInterpreterShift({
            interpreterId: req.user.id,
            date: req.body.date,
            startTime: req.body.startTime,
            endTime: req.body.endTime || null,
            totalMinutes: req.body.totalMinutes || 0,
            status: req.body.status || 'scheduled'
        });
        res.status(201).json({ shift });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter shift create error');
        res.status(500).json({ error: 'Failed to save shift', code: 'INTERNAL_ERROR' });
    }
});

router.put('/shifts/:id', authenticateUser, validate(shiftUpdateSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const shift = await db.updateInterpreterShift(req.params.id, {
            interpreterId: req.user.id,
            endTime: req.body.endTime,
            totalMinutes: req.body.totalMinutes,
            status: req.body.status
        });

        if (!shift || shift.interpreter_id !== req.user.id) {
            return res.status(404).json({ error: 'Shift not found', code: 'NOT_FOUND' });
        }

        res.json({ shift });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter shift update error');
        res.status(500).json({ error: 'Failed to update shift', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// EARNINGS
// ============================================

router.get('/earnings', authenticateUser, validate(earningsQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

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
    if (!requireInterpreter(req, res)) return;

    try {
        const stats = await db.getInterpreterStats(req.user.id);
        res.json(stats);
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter stats error');
        res.status(500).json({ error: 'Failed to fetch stats', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// INTERPRETER TOOLS
// ============================================

router.get('/analytics', authenticateUser, validate(analyticsQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    const defaults = defaultDateWindow();
    const periodStart = req.query.periodStart || defaults.periodStart;
    const periodEnd = req.query.periodEnd || defaults.periodEnd;

    try {
        const analytics = await db.getInterpreterAnalytics(req.user.id, periodStart, periodEnd);
        res.json({ analytics });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter analytics error');
        res.status(500).json({ error: 'Failed to fetch analytics', code: 'INTERNAL_ERROR' });
    }
});

router.get('/utilization', authenticateUser, validate(analyticsQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    const defaults = defaultWeekWindow();
    const periodStart = req.query.periodStart || defaults.periodStart;
    const periodEnd = req.query.periodEnd || defaults.periodEnd;

    try {
        const utilization = await db.getInterpreterUtilizationSummary(req.user.id, periodStart, periodEnd);
        res.json({ utilization });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter utilization error');
        res.status(500).json({ error: 'Failed to fetch utilization', code: 'INTERNAL_ERROR' });
    }
});

router.get('/breaks', authenticateUser, validate(breaksQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const breaks = await db.getInterpreterBreaks(req.user.id, req.query.limit);
        res.json({ breaks });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter breaks error');
        res.status(500).json({ error: 'Failed to fetch breaks', code: 'INTERNAL_ERROR' });
    }
});

router.post('/breaks/start', authenticateUser, validate(startBreakSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const activeBreaks = await db.getInterpreterBreaks(req.user.id, 1);
        if (activeBreaks[0] && !activeBreaks[0].ended_at) {
            return res.status(409).json({ error: 'Break already active', code: 'BREAK_ALREADY_ACTIVE' });
        }

        const breakSession = await db.startInterpreterBreak({
            interpreterId: req.user.id,
            breakType: req.body.breakType,
            reason: req.body.reason,
            paid: req.body.paid
        });
        res.status(201).json({ break: breakSession });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter break start error');
        res.status(500).json({ error: 'Failed to start break', code: 'INTERNAL_ERROR' });
    }
});

router.post('/breaks/:id/end', authenticateUser, async (req, res) => {
    if (!requireInterpreter(req, res)) return;
    if (!req.params.id || req.params.id.length > 120) {
        return res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: { id: 'Invalid break id' } });
    }

    try {
        const breakSession = await db.endInterpreterBreak({
            interpreterId: req.user.id,
            breakId: req.params.id
        });
        if (!breakSession) {
            return res.status(404).json({ error: 'Active break not found', code: 'NOT_FOUND' });
        }
        res.json({ break: breakSession });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter break end error');
        res.status(500).json({ error: 'Failed to end break', code: 'INTERNAL_ERROR' });
    }
});

router.get('/continuity-notes', authenticateUser, validate(continuityNotesQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const notes = await db.getInterpreterContinuityNotes(req.user.id, req.query.clientId, req.query.limit);
        res.json({ notes });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter continuity notes error');
        res.status(500).json({ error: 'Failed to fetch continuity notes', code: 'INTERNAL_ERROR' });
    }
});

router.post('/continuity-notes', authenticateUser, validate(continuityNoteSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const note = await db.createInterpreterContinuityNote({
            interpreterId: req.user.id,
            clientId: req.body.clientId,
            callId: req.body.callId,
            note: req.body.note,
            visibility: req.body.visibility,
            preferenceTags: req.body.preferenceTags
        });
        res.status(201).json({ note });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter continuity note create error');
        res.status(500).json({ error: 'Failed to create continuity note', code: 'INTERNAL_ERROR' });
    }
});

router.post('/post-call-survey', authenticateUser, validate(postCallSurveySchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const survey = await db.createPostCallSurvey({
            callId: req.body.callId,
            respondentId: req.user.id,
            respondentRole: 'interpreter',
            rating: req.body.rating,
            tags: req.body.tags,
            comments: req.body.comments
        });
        res.status(201).json({ survey });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter post-call survey error');
        res.status(500).json({ error: 'Failed to submit survey', code: 'INTERNAL_ERROR' });
    }
});

router.get('/teaming', authenticateUser, validate(teamingQuerySchema, 'query'), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const assignments = await db.getInterpreterTeamAssignments(req.user.id, req.query.limit);
        res.json({ assignments });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter teaming list error');
        res.status(500).json({ error: 'Failed to fetch teaming assignments', code: 'INTERNAL_ERROR' });
    }
});

router.post('/teaming/request', authenticateUser, validate(teamingRequestSchema), async (req, res) => {
    if (!requireInterpreter(req, res)) return;

    try {
        const assignment = await db.requestInterpreterTeamAssignment({
            interpreterId: req.user.id,
            teammateInterpreterId: req.body.teammateInterpreterId,
            callId: req.body.callId,
            roomName: req.body.roomName,
            notes: req.body.notes
        });
        res.status(201).json({ assignment });
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter teaming request error');
        res.status(500).json({ error: 'Failed to request teaming', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
