/**
 * Admin authenticated routes — dashboard stats, interpreter CRUD, clients, queue, activity, usage.
 */

const express = require('express');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const state = require('../lib/state');
const queueService = require('../lib/queue-service');
const log = require('../lib/logger').module('admin');
const {
    validate, nameSchema, emailSchema, passwordSchema,
    languagesArraySchema, serviceModesArraySchema, nonNegativeIntSchema,
    optionalSanitizedStringSchema, emptyBodySchema, z
} = require('../lib/validation');

const router = express.Router();

function normalizeDashboardStatus(status) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'available' || value === 'active' || value === 'online') return 'online';
    if (value === 'in_call' || value === 'incall' || value === 'on-call' || value === 'on_call') return 'in-call';
    if (value === 'busy') return 'busy';
    return 'offline';
}

function getInterpreterPresence() {
    const presence = new Map();
    for (const interpreter of state.clients.interpreters.values()) {
        if (!interpreter.userId || !interpreter.authenticated) continue;
        const id = interpreter.userId.toString();
        const status = normalizeDashboardStatus(interpreter.status);
        const existing = presence.get(id);
        if (!existing || existing.status === 'offline' || status === 'busy' || status === 'in-call') {
            presence.set(id, { ...interpreter, status });
        }
    }
    return presence;
}

function getClientPresence() {
    const presence = new Map();
    for (const client of state.clients.clients.values()) {
        if (!client.userId || !client.authenticated) continue;
        const id = client.userId.toString();
        const existing = presence.get(id);
        presence.set(id, {
            ...client,
            connections: (existing?.connections || 0) + 1
        });
    }
    return presence;
}

function withLivePresenceStats(stats) {
    const interpreterPresence = getInterpreterPresence();
    const clientPresence = getClientPresence();
    const onlineInterpreters = Array.from(interpreterPresence.values())
        .filter(interpreter => interpreter.status !== 'offline').length;

    return {
        ...stats,
        clients: {
            ...stats.clients,
            online: clientPresence.size,
            connected: clientPresence.size
        },
        interpreters: {
            ...stats.interpreters,
            online: onlineInterpreters,
            connected: interpreterPresence.size
        }
    };
}

// ============================================
// ADMIN AUTH MIDDLEWARE
// ============================================

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header', code: 'AUTH_REQUIRED' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = normalizeAuthClaims(verifyJwtToken(token));
        if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
            return res.status(403).json({ error: 'Admin role required', code: 'FORBIDDEN' });
        }
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token', code: 'AUTH_INVALID' });
    }
}

// ============================================
// ZOD SCHEMAS
// ============================================

const createInterpreterSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    languages: languagesArraySchema,
    serviceModes: serviceModesArraySchema,
    tenantId: z.string().min(1).max(60).optional(),
    password: passwordSchema.optional()
});

const updateInterpreterSchema = z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    languages: languagesArraySchema,
    password: passwordSchema.optional(),
    serviceModes: serviceModesArraySchema,
    tenantId: z.string().min(1).max(60).optional(),
    active: z.boolean().optional()
});

const scheduleWindowQuerySchema = z.object({
    startDate: z.string().min(1).optional(),
    endDate: z.string().min(1).optional(),
    tenantId: z.string().min(1).max(60).optional(),
    serviceMode: z.enum(['vrs', 'vri']).optional(),
    language: z.string().min(1).max(20).optional()
});

const scheduleStatusSchema = z.enum(['pending', 'scheduled', 'confirmed', 'unavailable', 'time-off', 'cancelled']);

const scheduleWindowSchema = z.object({
    interpreterId: z.string().min(1).max(120),
    startsAt: z.string().min(1).max(80),
    endsAt: z.string().min(1).max(80),
    tenantId: z.string().min(1).max(60).optional(),
    serviceModes: serviceModesArraySchema.optional(),
    languages: languagesArraySchema.optional(),
    status: scheduleStatusSchema.optional().default('confirmed'),
    managerNote: optionalSanitizedStringSchema
});

const updateScheduleWindowSchema = scheduleWindowSchema.partial()
    .refine(data => Object.keys(data).length > 0, { message: 'At least one field is required' });

const createClientSchema = z.object({
    name: nameSchema,
    email: emailSchema.optional(),
    organization: optionalSanitizedStringSchema,
    password: passwordSchema.optional(),
    serviceModes: serviceModesArraySchema,
    tenantId: z.string().min(1).max(60).optional()
});

const updateClientSchema = z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    organization: optionalSanitizedStringSchema,
    password: passwordSchema.optional(),
    serviceModes: serviceModesArraySchema,
    tenantId: z.string().min(1).max(60).optional()
});

const createCaptionerSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    languages: languagesArraySchema.optional().default(['en']),
    password: passwordSchema.optional()
});

const updateCaptionerSchema = z.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    languages: languagesArraySchema.optional(),
    active: z.boolean().optional()
});

const assignQueueSchema = z.object({
    interpreterId: z.string().min(1)
});

const voicemailSettingSchema = z.object({
    value: z.union([z.string().max(500), z.number().finite(), z.boolean()])
});

const activityQuerySchema = z.object({
    limit: nonNegativeIntSchema.optional().default(50),
    type: z.string().max(50).optional(),
    tenantId: z.string().max(80).optional(),
    serviceMode: z.enum(['vrs', 'vri']).optional(),
    role: z.enum(['client', 'interpreter', 'captioner', 'admin', 'superadmin']).optional()
});

const queueQuerySchema = z.object({
    tenantId: z.string().max(80).optional(),
    serviceMode: z.enum(['vrs', 'vri']).optional(),
    language: z.string().max(40).optional(),
    role: z.enum(['client', 'interpreter', 'captioner']).optional()
});

const usageQuerySchema = z.object({
    days: nonNegativeIntSchema.optional().default(7)
});

// ============================================
// AUTH ENDPOINTS
// ============================================

router.post('/logout', authenticateAdmin, validate(emptyBodySchema), (req, res) => {
    activityLogger.log('admin_logout', { adminId: req.admin.id });
    res.json({ success: true });
});

router.get('/verify', authenticateAdmin, (req, res) => {
    res.json({
        valid: true,
        admin: { id: req.admin.id, username: req.admin.username, name: req.admin.name }
    });
});

// ============================================
// DASHBOARD STATS
// ============================================

router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json(withLivePresenceStats(stats));
    } catch (error) {
        req.log.error({ err: error }, 'Stats error');
        res.status(500).json({ error: 'Failed to fetch stats', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// INTERPRETERS
// ============================================

router.get('/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const interpreters = await db.getAllInterpreters();
        const presence = getInterpreterPresence();

        const interpretersWithStatus = interpreters.map(interp => ({
            ...interp,
            connected: presence.has(interp.id.toString()),
            currentStatus: presence.get(interp.id.toString())?.status || 'offline'
        }));

        res.json(interpretersWithStatus);
    } catch (error) {
        req.log.error({ err: error }, 'Interpreters error');
        res.status(500).json({ error: 'Failed to fetch interpreters', code: 'INTERNAL_ERROR' });
    }
});

router.post('/interpreters', authenticateAdmin, validate(createInterpreterSchema), async (req, res) => {
    const { name, email, languages, password, serviceModes, tenantId } = req.body;

    try {
        const interpreterId = await db.createInterpreter({
            name, email, languages, password, serviceModes, tenantId
        });

        activityLogger.log('interpreter_created', {
            adminId: req.admin.id, interpreterId, name, email
        });

        res.json({ success: true, id: interpreterId });
    } catch (error) {
        req.log.error({ err: error }, 'Create interpreter error');
        res.status(500).json({ error: 'Failed to create interpreter', code: 'INTERNAL_ERROR' });
    }
});

router.put('/interpreters/:id', authenticateAdmin, validate(updateInterpreterSchema), async (req, res) => {
    const { id } = req.params;
    const { name, email, languages, active, password, serviceModes, tenantId } = req.body;

    try {
        await db.updateInterpreter(id, { name, email, languages, active, password, serviceModes, tenantId });

        activityLogger.log('interpreter_updated', {
            adminId: req.admin.id, interpreterId: id, updates: { name, email, languages, active, passwordChanged: Boolean(password), serviceModes, tenantId }
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Update interpreter error');
        res.status(500).json({ error: 'Failed to update interpreter', code: 'INTERNAL_ERROR' });
    }
});

router.delete('/interpreters/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await db.deleteInterpreter(id);

        activityLogger.log('interpreter_deleted', {
            adminId: req.admin.id, interpreterId: id
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Delete interpreter error');
        res.status(500).json({ error: 'Failed to delete interpreter', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// CAPTIONERS
// ============================================

router.get('/captioners', authenticateAdmin, async (req, res) => {
    try {
        const captioners = await db.getAllCaptioners();
        res.json(captioners);
    } catch (error) {
        req.log.error({ err: error }, 'Captioners error');
        res.status(500).json({ error: 'Failed to fetch captioners', code: 'INTERNAL_ERROR' });
    }
});

router.post('/captioners', authenticateAdmin, validate(createCaptionerSchema), async (req, res) => {
    const { name, email, languages, password } = req.body;

    try {
        const captionerId = await db.createCaptioner({
            name, email, languages: languages || ['en'], password
        });

        activityLogger.log('captioner_created', {
            adminId: req.admin.id, captionerId, name, email
        });

        res.json({ success: true, id: captionerId });
    } catch (error) {
        req.log.error({ err: error }, 'Create captioner error');
        res.status(500).json({ error: 'Failed to create captioner', code: 'INTERNAL_ERROR' });
    }
});

router.put('/captioners/:id', authenticateAdmin, validate(updateCaptionerSchema), async (req, res) => {
    const { id } = req.params;
    const { name, email, languages, active } = req.body;

    try {
        await db.updateCaptioner(id, { name, email, languages, active });

        activityLogger.log('captioner_updated', {
            adminId: req.admin.id, captionerId: id, updates: { name, email, languages, active }
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Update captioner error');
        res.status(500).json({ error: 'Failed to update captioner', code: 'INTERNAL_ERROR' });
    }
});

router.delete('/captioners/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await db.deleteCaptioner(id);

        activityLogger.log('captioner_deleted', {
            adminId: req.admin.id, captionerId: id
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Delete captioner error');
        res.status(500).json({ error: 'Failed to delete captioner', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// INTERPRETER SCHEDULING
// ============================================

router.get('/scheduling/windows', authenticateAdmin, validate(scheduleWindowQuerySchema, 'query'), async (req, res) => {
    try {
        const windows = await db.getInterpreterScheduleWindows({
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            tenantId: req.query.tenantId,
            serviceMode: req.query.serviceMode,
            language: req.query.language
        });
        res.json({ windows });
    } catch (error) {
        req.log.error({ err: error }, 'Scheduling windows error');
        res.status(500).json({ error: 'Failed to fetch schedule windows', code: 'INTERNAL_ERROR' });
    }
});

router.post('/scheduling/windows', authenticateAdmin, validate(scheduleWindowSchema), async (req, res) => {
    try {
        const window = await db.createInterpreterScheduleWindow({
            interpreterId: req.body.interpreterId,
            startsAt: req.body.startsAt,
            endsAt: req.body.endsAt,
            tenantId: req.body.tenantId || 'malka',
            serviceModes: req.body.serviceModes || ['vrs'],
            languages: req.body.languages || ['ASL'],
            status: req.body.status || 'confirmed',
            managerNote: req.body.managerNote
        });
        activityLogger.log('interpreter_schedule_window_created', {
            adminId: req.admin.id,
            interpreterId: req.body.interpreterId,
            scheduleWindowId: window.id,
            status: window.status
        });
        res.status(201).json({ window });
    } catch (error) {
        req.log.error({ err: error }, 'Create scheduling window error');
        res.status(500).json({ error: 'Failed to create schedule window', code: 'INTERNAL_ERROR' });
    }
});

router.put('/scheduling/windows/:id', authenticateAdmin, validate(updateScheduleWindowSchema), async (req, res) => {
    try {
        const window = await db.updateInterpreterScheduleWindow(req.params.id, {
            interpreterId: req.body.interpreterId,
            startsAt: req.body.startsAt,
            endsAt: req.body.endsAt,
            tenantId: req.body.tenantId,
            serviceModes: req.body.serviceModes,
            languages: req.body.languages,
            status: req.body.status,
            managerNote: req.body.managerNote
        });
        if (!window) {
            return res.status(404).json({ error: 'Schedule window not found', code: 'NOT_FOUND' });
        }
        activityLogger.log('interpreter_schedule_window_updated', {
            adminId: req.admin.id,
            scheduleWindowId: req.params.id,
            updates: req.body
        });
        res.json({ window });
    } catch (error) {
        req.log.error({ err: error }, 'Update scheduling window error');
        res.status(500).json({ error: 'Failed to update schedule window', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// CLIENTS
// ============================================

router.get('/clients', authenticateAdmin, async (req, res) => {
    try {
        const clients = await db.getAllClients();
        const presence = getClientPresence();
        const clientsWithStatus = clients.map(client => {
            const live = presence.get(client.id.toString());
            return {
                ...client,
                connected: Boolean(live),
                currentStatus: live ? 'online' : 'offline',
                activeConnections: live?.connections || 0
            };
        });
        res.json(clientsWithStatus);
    } catch (error) {
        req.log.error({ err: error }, 'Clients error');
        res.status(500).json({ error: 'Failed to fetch clients', code: 'INTERNAL_ERROR' });
    }
});

router.post('/clients', authenticateAdmin, validate(createClientSchema), async (req, res) => {
    const { name, email, organization, password, serviceModes, tenantId } = req.body;

    try {
        const client = await db.createClient({ name, email, organization, password, serviceModes, tenantId });

        activityLogger.log('client_created', {
            adminId: req.admin.id, clientId: client.id, name, email, organization, serviceModes, tenantId
        });

        res.json({ success: true, id: client.id });
    } catch (error) {
        req.log.error({ err: error }, 'Create client error');
        res.status(500).json({ error: 'Failed to create client', code: 'INTERNAL_ERROR' });
    }
});

router.put('/clients/:id', authenticateAdmin, validate(updateClientSchema), async (req, res) => {
    const { id } = req.params;
    const { name, email, organization, password, serviceModes, tenantId } = req.body;

    try {
        await db.updateClient(id, { name, email, organization, password, serviceModes, tenantId });

        activityLogger.log('client_updated', {
            adminId: req.admin.id, clientId: id, updates: { name, email, organization, passwordChanged: Boolean(password), serviceModes, tenantId }
        });

        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Update client error');
        res.status(500).json({ error: 'Failed to update client', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// QUEUE
// ============================================

function normalizeQueueItem(item) {
    return {
        ...item,
        callType: item.callType || item.call_type || item.serviceMode || item.service_mode || (item.targetPhone || item.target_phone ? 'vrs' : 'vri'),
        clientId: item.clientId || item.client_id || null,
        clientName: item.clientName || item.client_name,
        roomName: item.roomName || item.room_name,
        serviceMode: item.serviceMode || item.service_mode || item.callType || item.call_type || (item.targetPhone || item.target_phone ? 'vrs' : 'vri'),
        serviceModes: item.serviceModes || item.service_modes || [],
        targetPhone: item.targetPhone || item.target_phone || null,
        tenantId: item.tenantId || item.tenant_id || 'malka',
        wait_time: item.wait_time || item.waitTime || '—'
    };
}

function filterActivityItem(item, { tenantId, serviceMode, role }) {
    const data = item.data && typeof item.data === 'object' ? item.data : {};
    const updates = data.updates && typeof data.updates === 'object' ? data.updates : {};
    const haystack = JSON.stringify(data).toLowerCase();

    if (tenantId) {
        const tenant = String(tenantId).toLowerCase();
        if (
            String(data.tenantId || data.tenant_id || updates.tenantId || updates.tenant_id || '').toLowerCase() !== tenant
            && !haystack.includes(`"tenantid":"${tenant}"`)
            && !haystack.includes(`"tenant_id":"${tenant}"`)
        ) {
            return false;
        }
    }

    if (serviceMode) {
        const mode = String(serviceMode).toLowerCase();
        const modes = [
            ...(Array.isArray(data.serviceModes) ? data.serviceModes : []),
            ...(Array.isArray(data.service_modes) ? data.service_modes : []),
            ...(Array.isArray(updates.serviceModes) ? updates.serviceModes : []),
            ...(Array.isArray(updates.service_modes) ? updates.service_modes : []),
            data.serviceMode,
            data.service_mode,
            updates.serviceMode,
            updates.service_mode
        ].filter(Boolean).map(value => String(value).toLowerCase());
        if (!modes.includes(mode) && !haystack.includes(`"${mode}"`)) {
            return false;
        }
    }

    if (role) {
        const expectedRole = String(role).toLowerCase();
        const type = String(item.type || '').toLowerCase();
        const roles = [
            data.role,
            data.createdRole,
            data.actorRole,
            data.accountRole,
            updates.role
        ].filter(Boolean).map(value => String(value).toLowerCase());

        if (!roles.includes(expectedRole) && !type.includes(expectedRole)) {
            return false;
        }
    }

    return true;
}

router.get('/queue', validate(queueQuerySchema, 'query'), authenticateAdmin, async (req, res) => {
    const { language, role, serviceMode, tenantId } = req.query;

    if (role && role !== 'client') {
        return res.json([]);
    }

    try {
        const queue = (await db.getQueueRequests('waiting'))
            .map(normalizeQueueItem)
            .filter(item => !tenantId || item.tenantId === tenantId)
            .filter(item => !serviceMode || item.serviceMode === serviceMode)
            .filter(item => !language || String(item.language || '').toLowerCase() === String(language).toLowerCase());

        res.json(queue);
    } catch (error) {
        req.log.error({ err: error }, 'Queue fetch error');
        res.status(500).json({ error: 'Failed to fetch queue', code: 'INTERNAL_ERROR' });
    }
});

router.post('/queue/pause', authenticateAdmin, validate(emptyBodySchema), (req, res) => {
    queueService.pause();
    activityLogger.log('queue_paused', { adminId: req.admin.id });
    res.json({ success: true, paused: true });
});

router.post('/queue/resume', authenticateAdmin, validate(emptyBodySchema), (req, res) => {
    queueService.resume();
    activityLogger.log('queue_resumed', { adminId: req.admin.id });
    res.json({ success: true, paused: false });
});

router.post('/queue/:requestId/assign', authenticateAdmin, validate(assignQueueSchema), async (req, res) => {
    const { requestId } = req.params;
    const { interpreterId } = req.body;

    try {
        const result = await queueService.assignInterpreter(requestId, interpreterId);

        activityLogger.log('queue_manual_assign', {
            adminId: req.admin.id, requestId, interpreterId
        });

        res.json(result);
    } catch (error) {
        req.log.error({ err: error }, 'Assign error');
        res.status(500).json({ error: 'Failed to assign interpreter', code: 'INTERNAL_ERROR' });
    }
});

router.delete('/queue/:requestId', authenticateAdmin, (req, res) => {
    const { requestId } = req.params;
    Promise.resolve(queueService.removeFromQueue(requestId))
        .then(() => {
            activityLogger.log('queue_request_removed', {
                adminId: req.admin.id, requestId
            });

            state.broadcastQueueStatus(queueService);
            res.json({ success: true });
        })
        .catch(error => {
            req.log.error({ err: error }, 'Queue remove error');
            res.status(500).json({ error: 'Failed to remove queue request', code: 'INTERNAL_ERROR' });
        });
});

// ============================================
// ACTIVE CALLS
// ============================================

router.get('/calls/active', authenticateAdmin, async (req, res) => {
    try {
        const calls = await db.getActiveCalls();
        res.json(calls);
    } catch (error) {
        req.log.error({ err: error }, 'Active calls error');
        res.status(500).json({ error: 'Failed to fetch active calls', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// ACTIVITY LOG
// ============================================

router.get('/activity', validate(activityQuerySchema, 'query'), authenticateAdmin, async (req, res) => {
    const { limit, role, serviceMode, tenantId, type } = req.query;
    try {
        const fetchLimit = role || serviceMode || tenantId ? Math.max(Number(limit) * 5, 250) : limit;
        const activity = await db.getActivityLog({ limit: fetchLimit, type });
        const filtered = activity.filter(item => filterActivityItem(item, { role, serviceMode, tenantId }));
        res.json(filtered.slice(0, Number(limit)));
    } catch (error) {
        req.log.error({ err: error }, 'Activity error');
        res.status(500).json({ error: 'Failed to fetch activity log', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// USAGE STATS
// ============================================

router.get('/usage/daily', validate(usageQuerySchema, 'query'), authenticateAdmin, async (req, res) => {
    const { days } = req.query;
    try {
        const stats = await db.getDailyUsageStats(days);
        res.json(stats);
    } catch (error) {
        req.log.error({ err: error }, 'Usage error');
        res.status(500).json({ error: 'Failed to fetch usage stats', code: 'INTERNAL_ERROR' });
    }
});

router.get('/usage/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const stats = await db.getInterpreterStats();
        res.json(stats);
    } catch (error) {
        req.log.error({ err: error }, 'Interpreter usage error');
        res.status(500).json({ error: 'Failed to fetch interpreter stats', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// VOICEMAIL ADMIN ENDPOINTS
// ============================================

// Voicemail service — set via setVoicemailServiceForAdmin()
let voicemailServiceForAdmin = null;

function setVoicemailServiceForAdmin(service) {
    voicemailServiceForAdmin = service;
}

/**
 * GET /api/admin/voicemail/settings
 */
router.get('/voicemail/settings', authenticateAdmin, async (req, res) => {
    try {
        if (!voicemailServiceForAdmin) {
            return res.status(503).json({ error: 'Voicemail service not available', code: 'SERVICE_UNAVAILABLE' });
        }
        const settings = await voicemailServiceForAdmin.getSettings();
        res.json({ settings });
    } catch (error) {
        req.log.error({ err: error }, 'Voicemail settings fetch error');
        res.status(500).json({ error: 'Failed to fetch voicemail settings', code: 'INTERNAL_ERROR' });
    }
});

/**
 * PUT /api/admin/voicemail/settings/:key
 */
router.put('/voicemail/settings/:key', authenticateAdmin, validate(voicemailSettingSchema), async (req, res) => {
    try {
        if (!voicemailServiceForAdmin) {
            return res.status(503).json({ error: 'Voicemail service not available', code: 'SERVICE_UNAVAILABLE' });
        }
        const { value } = req.body;
        await voicemailServiceForAdmin.updateSetting(req.params.key, String(value), req.admin.id);
        res.json({ success: true });
    } catch (error) {
        req.log.error({ err: error }, 'Voicemail settings update error');
        res.status(500).json({ error: 'Failed to update voicemail setting', code: 'INTERNAL_ERROR' });
    }
});

/**
 * GET /api/admin/voicemail/messages
 */
router.get('/voicemail/messages', authenticateAdmin, async (req, res) => {
    try {
        if (!voicemailServiceForAdmin) {
            return res.status(503).json({ error: 'Voicemail service not available', code: 'SERVICE_UNAVAILABLE' });
        }
        const filters = {
            status: req.query.status,
            callerId: req.query.callerId,
            calleeId: req.query.calleeId,
            limit: Math.min(parseInt(String(req.query.limit)) || 50, 200),
            offset: parseInt(String(req.query.offset)) || 0
        };
        const messages = await db.getAllVoicemailMessages(filters);
        res.json({ messages });
    } catch (error) {
        req.log.error({ err: error }, 'Voicemail messages fetch error');
        res.status(500).json({ error: 'Failed to fetch voicemail messages', code: 'INTERNAL_ERROR' });
    }
});

/**
 * DELETE /api/admin/voicemail/messages/:id
 */
router.delete('/voicemail/messages/:id', authenticateAdmin, async (req, res) => {
    try {
        if (!voicemailServiceForAdmin) {
            return res.status(503).json({ error: 'Voicemail service not available', code: 'SERVICE_UNAVAILABLE' });
        }
        await voicemailServiceForAdmin.adminDeleteMessage(req.params.id);
        res.json({ success: true });
    } catch (error) {
        if (error.message === 'Message not found') {
            return res.status(404).json({ error: 'Message not found', code: 'NOT_FOUND' });
        }
        req.log.error({ err: error }, 'Voicemail admin delete error');
        res.status(500).json({ error: 'Failed to delete voicemail message', code: 'INTERNAL_ERROR' });
    }
});

/**
 * GET /api/admin/voicemail/stats
 */
router.get('/voicemail/stats', authenticateAdmin, async (req, res) => {
    try {
        if (!voicemailServiceForAdmin) {
            return res.status(503).json({ error: 'Voicemail service not available', code: 'SERVICE_UNAVAILABLE' });
        }
        const stats = await voicemailServiceForAdmin.getStats();
        res.json(stats);
    } catch (error) {
        req.log.error({ err: error }, 'Voicemail stats fetch error');
        res.status(500).json({ error: 'Failed to fetch voicemail stats', code: 'INTERNAL_ERROR' });
    }
});

module.exports = { router, setVoicemailServiceForAdmin };
