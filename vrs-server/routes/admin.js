/**
 * Admin authenticated routes — dashboard stats, interpreter CRUD, clients, queue, activity, usage.
 */

const express = require('express');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const state = require('../lib/state');
const queueService = require('../lib/queue-service');

const router = express.Router();

// ============================================
// ADMIN AUTH MIDDLEWARE
// ============================================

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = normalizeAuthClaims(verifyJwtToken(token));
        if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
            return res.status(403).json({ error: 'Admin role required' });
        }
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function validateRequired(body, fields) {
    for (const field of fields) {
        const value = body[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return `Missing required field: ${field}`;
        }
    }
    return null;
}

// ============================================
// AUTH ENDPOINTS
// ============================================

router.post('/logout', authenticateAdmin, (req, res) => {
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
        res.json(stats);
    } catch (error) {
        console.error('[Stats] Error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================
// INTERPRETERS
// ============================================

router.get('/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const interpreters = await db.getAllInterpreters();

        const connectedIds = new Set(
            Array.from(state.clients.interpreters.values()).map(i => i.userId)
        );

        const interpretersWithStatus = interpreters.map(interp => ({
            ...interp,
            connected: connectedIds.has(interp.id.toString()),
            currentStatus: Array.from(state.clients.interpreters.values())
                .find(i => i.userId === interp.id.toString())?.status || 'offline'
        }));

        res.json(interpretersWithStatus);
    } catch (error) {
        console.error('[Interpreters] Error:', error);
        res.status(500).json({ error: 'Failed to fetch interpreters' });
    }
});

router.post('/interpreters', authenticateAdmin, async (req, res) => {
    const validationError = validateRequired(req.body, ['name', 'email']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, languages, password } = req.body;

    try {
        const interpreterId = await db.createInterpreter({
            name, email, languages: languages || ['ASL'], password
        });

        activityLogger.log('interpreter_created', {
            adminId: req.admin.id, interpreterId, name, email
        });

        res.json({ success: true, id: interpreterId });
    } catch (error) {
        console.error('[Create Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to create interpreter' });
    }
});

router.put('/interpreters/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, email, languages, active } = req.body;

    try {
        await db.updateInterpreter(id, { name, email, languages, active });

        activityLogger.log('interpreter_updated', {
            adminId: req.admin.id, interpreterId: id, updates: { name, email, languages, active }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Update Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to update interpreter' });
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
        console.error('[Delete Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to delete interpreter' });
    }
});

// ============================================
// CLIENTS
// ============================================

router.get('/clients', authenticateAdmin, async (req, res) => {
    try {
        const clients = await db.getAllClients();
        res.json(clients);
    } catch (error) {
        console.error('[Clients] Error:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

router.post('/clients', authenticateAdmin, async (req, res) => {
    const validationError = validateRequired(req.body, ['name']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, organization } = req.body;

    try {
        const clientId = await db.createClient({ name, email, organization });

        activityLogger.log('client_created', {
            adminId: req.admin.id, clientId, name, email, organization
        });

        res.json({ success: true, id: clientId });
    } catch (error) {
        console.error('[Create Client] Error:', error);
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// ============================================
// QUEUE
// ============================================

router.get('/queue', authenticateAdmin, (req, res) => {
    const queue = queueService.getQueue();
    res.json(queue);
});

router.post('/queue/pause', authenticateAdmin, (req, res) => {
    queueService.pause();
    activityLogger.log('queue_paused', { adminId: req.admin.id });
    res.json({ success: true, paused: true });
});

router.post('/queue/resume', authenticateAdmin, (req, res) => {
    queueService.resume();
    activityLogger.log('queue_resumed', { adminId: req.admin.id });
    res.json({ success: true, paused: false });
});

router.post('/queue/:requestId/assign', authenticateAdmin, async (req, res) => {
    const { requestId } = req.params;
    const validationError = validateRequired(req.body, ['interpreterId']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { interpreterId } = req.body;

    try {
        const result = await queueService.assignInterpreter(requestId, interpreterId);

        activityLogger.log('queue_manual_assign', {
            adminId: req.admin.id, requestId, interpreterId
        });

        res.json(result);
    } catch (error) {
        console.error('[Assign] Error:', error);
        res.status(500).json({ error: 'Failed to assign interpreter' });
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
            console.error('[Queue Remove] Error:', error);
            res.status(500).json({ error: 'Failed to remove queue request' });
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
        console.error('[Active Calls] Error:', error);
        res.status(500).json({ error: 'Failed to fetch active calls' });
    }
});

// ============================================
// ACTIVITY LOG
// ============================================

router.get('/activity', authenticateAdmin, async (req, res) => {
    const { limit = 50, type } = req.query;

    try {
        const activity = await db.getActivityLog({
            limit: parseInt(limit), type
        });
        res.json(activity);
    } catch (error) {
        console.error('[Activity] Error:', error);
        res.status(500).json({ error: 'Failed to fetch activity log' });
    }
});

// ============================================
// USAGE STATS
// ============================================

router.get('/usage/daily', authenticateAdmin, async (req, res) => {
    const { days = 7 } = req.query;

    try {
        const stats = await db.getDailyUsageStats(parseInt(days));
        res.json(stats);
    } catch (error) {
        console.error('[Usage] Error:', error);
        res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
});

router.get('/usage/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const stats = await db.getInterpreterStats();
        res.json(stats);
    } catch (error) {
        console.error('[Interpreter Usage] Error:', error);
        res.status(500).json({ error: 'Failed to fetch interpreter stats' });
    }
});

module.exports = router;
