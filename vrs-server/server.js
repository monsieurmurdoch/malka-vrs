/**
 * MalkaVRS Server
 *
 * Main server file combining:
 * - Express REST API
 * - WebSocket server for queue and live updates
 * - Activity tracking
 * - Admin authentication
 */

try {
    require('dotenv').config();
} catch (error) {
    console.warn('[Server] dotenv not installed, continuing with process environment only.');
}
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Import database and routes
const db = require('./database');
const activityLogger = require('./lib/activity-logger');
const queueService = require('./lib/queue-service');
const handoffService = require('./lib/handoff-service');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.VRS_SHARED_JWT_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: VRS_SHARED_JWT_SECRET or JWT_SECRET environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
    process.exit(1);
}
const LEGACY_ADMIN_LOGIN_ENABLED = process.env.ENABLE_LEGACY_ADMIN_LOGIN === 'true';

function verifyJwtToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

function normalizeAuthClaims(decoded) {
    return {
        email: decoded.email,
        id: decoded.id || decoded.userId,
        name: decoded.name || decoded.username,
        role: decoded.role,
        username: decoded.username || decoded.email || decoded.name || decoded.userId
    };
}

function tokenMatchesRequestedRole(requestedRole, actualRole) {
    if (requestedRole === actualRole) {
        return true;
    }

    return requestedRole === 'admin' && actualRole === 'superadmin';
}

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Parse allowed CORS origins from env (comma-separated), fall back to localhost
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,https://localhost:8080,http://localhost:3002,http://localhost:3003')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

// Security headers via Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: [ "'self'" ],
            scriptSrc: [ "'self'", "'unsafe-inline'", "'unsafe-eval'" ],
            styleSrc: [ "'self'", "'unsafe-inline'" ],
            imgSrc: [ "'self'", 'data:' ],
            connectSrc: [ "'self'",
                'ws://localhost:3001', 'wss://localhost:3001',
                'http://localhost:3001', 'https://localhost:3001',
                'http://localhost:3002', 'http://localhost:3003' ],
            mediaSrc: [ "'self'", 'blob:' ],
            fontSrc: [ "'self'" ]
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Global rate limiter — 100 requests per minute per IP
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Stricter rate limiter for auth endpoints — 10 per minute per IP
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' }
});

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..')));

// ============================================
// INPUT VALIDATION HELPERS
// ============================================

/**
 * Validate that required fields exist in req.body and are non-empty strings.
 * Returns an error message string or null if valid.
 */
function validateRequired(body, fields) {
    for (const field of fields) {
        const value = body[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return `Missing required field: ${field}`;
        }
    }

    return null;
}

/**
 * Sanitize a phone number: keep digits and leading + only.
 * Returns the cleaned string or null if invalid.
 */
function sanitizePhoneNumber(raw) {
    if (typeof raw !== 'string') {
        return null;
    }
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) {
        return null;
    }

    return cleaned;
}

// ============================================
// WEBSOCKET SERVER
// ============================================

const wss = new WebSocket.Server({ server, path: '/ws' });

// Store connected clients by type
const clients = {
    interpreters: new Map(),
    clients: new Map(),
    admins: new Map()
};

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    ws.isAlive = true;
    ws.clientInfo = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[WebSocket] Received:', data.type, data);

            switch (data.type) {
                case 'auth':
                    // Authenticate client and set their role
                    ws.clientInfo = handleAuth(ws, data, clientId);
                    break;

                case 'interpreter_status':
                case 'interpreter_status_update':
                    // Interpreter updates their availability status
                    handleInterpreterStatus(ws, data);
                    break;

                case 'heartbeat':
                    // Keep connection alive
                    if (ws.isAlive === false) return;
                    ws.isAlive = true;
                    ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
                    break;

                case 'get_queue_status':
                    // Send current queue status
                    sendQueueStatus(ws);
                    break;

                case 'request_interpreter':
                    await handleInterpreterRequest(ws, data);
                    break;

                case 'cancel_request':
                    await handleCancelRequest(ws, data);
                    break;

                case 'accept_request':
                    await handleAcceptRequest(ws, data);
                    break;

                case 'decline_request':
                    handleDeclineRequest(ws, data);
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;

                case 'admin_subscribe':
                    // Admin subscribes to live updates
                    handleAdminSubscribe(ws, data);
                    break;

                // Handoff message types
                case 'session_register':
                    handleSessionRegister(ws, data);
                    break;

                case 'session_unregister':
                    handleSessionUnregister(ws, data);
                    break;

                case 'handoff_prepare':
                    await handleHandoffPrepare(ws, data);
                    break;

                case 'handoff_ready':
                    handleHandoffReady(ws, data);
                    break;

                case 'handoff_complete':
                    handleHandoffComplete(ws, data);
                    break;

                case 'handoff_cancel':
                    handleHandoffCancel(ws, data);
                    break;
            }
        } catch (error) {
            console.error('[WebSocket] Error:', error);
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected:', clientId);
        if (ws.clientInfo) {
            handleDisconnect(ws.clientInfo);
        }
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: Date.now()
    }));
});

// WebSocket handlers
function handleAuth(ws, data, clientId) {
    const { role, userId, name, token } = data;
    let clientInfo;
    const requiresSecureAuth = role === 'interpreter' || role === 'admin';

    if (requiresSecureAuth && !token) {
        ws.send(JSON.stringify({
            type: 'auth_error',
            data: { message: `${role} authentication requires a valid token` }
        }));
        return null;
    }

    // Validate token if provided
    if (token) {
        try {
            const claims = normalizeAuthClaims(verifyJwtToken(token));

            if (requiresSecureAuth && !tokenMatchesRequestedRole(role, claims.role)) {
                ws.send(JSON.stringify({
                    type: 'auth_error',
                    data: { message: 'Role mismatch for authentication token' }
                }));
                return null;
            }

            clientInfo = {
                clientId,
                role,
                userId: claims.id || userId,
                name: claims.name || name,
                email: claims.email,
                ws,
                authenticated: true
            };
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'auth_error',
                data: { message: 'Invalid token' }
            }));
            return null;
        }
    } else {
        clientInfo = { clientId, role, userId, name, ws, authenticated: false };
    }

    // Store client in appropriate map
    if (role === 'interpreter') {
        clients.interpreters.set(clientId, clientInfo);
        // Set initial status to offline
        clientInfo.status = 'offline';
        clientInfo.currentCall = null;

        // Notify admins of new interpreter
        broadcastToAdmins({
            type: 'interpreter_connected',
            data: {
                id: userId,
                name: name,
                status: 'offline',
                timestamp: Date.now()
            }
        });

        activityLogger.log('interpreter_online', {
            interpreterId: userId,
            interpreterName: name
        });

    } else if (role === 'client') {
        clients.clients.set(clientId, clientInfo);

        activityLogger.log('client_connected', {
            clientId: userId,
            clientName: name
        });

    } else if (role === 'admin') {
        clients.admins.set(clientId, clientInfo);
        // Send current state to admin
        sendAdminDashboard(ws);
    }

    ws.send(JSON.stringify({
        type: 'auth_success',
        role,
        clientId
    }));

    sendQueueStatus(ws);

    return clientInfo;
}

function handleInterpreterStatus(ws, data) {
    const payload = data.data || data;
    const { status, languages } = payload;

    // Find this interpreter in our client list
    for (const [id, client] of clients.interpreters) {
        if (client.ws === ws) {
            client.status = status;
            client.languages = languages || client.languages;

            // Notify admins
            broadcastToAdmins({
                type: 'interpreter_status_changed',
                data: {
                    id: client.userId,
                    name: client.name,
                    status: status,
                    languages: client.languages,
                    timestamp: Date.now()
                }
            });

            activityLogger.log('interpreter_status_change', {
                interpreterId: client.userId,
                interpreterName: client.name,
                status: status
            });

            // If going online/offline, update queue service
            if (status === 'online' || status === 'available' || status === 'active') {
                queueService.interpreterAvailable(client.userId, client.name, languages);
                notifyInterpreterOfPendingRequests(ws);
            } else if (status === 'offline' || status === 'busy' || status === 'inactive') {
                queueService.interpreterUnavailable(client.userId);
            }

            ws.send(JSON.stringify({
                type: 'status_updated',
                status: status
            }));
            broadcastQueueStatus();
            break;
        }
    }
}

async function handleInterpreterRequest(ws, data) {
    const client = ws.clientInfo;
    const payload = data.data || {};

    if (!client || client.role !== 'client') {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Client authentication required before requesting an interpreter.' }
        }));
        return;
    }

    const result = await queueService.requestInterpreter({
        clientId: client.userId,
        clientName: payload.clientName || client.name || 'Guest',
        language: payload.language || 'ASL',
        roomName: payload.roomName || `vrs-${client.clientId}`
    });

    if (!result.success) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: result.message }
        }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'request_queued',
        data: {
            requestId: result.requestId,
            position: result.position,
            roomName: result.request.roomName,
            language: result.request.language
        }
    }));

    notifyAvailableInterpreters(result.request);
    broadcastQueueStatus();
}

async function handleCancelRequest(ws, data) {
    const payload = data.data || {};
    const requestId = payload.requestId;

    if (!requestId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'requestId is required to cancel a queue request.' }
        }));
        return;
    }

    const result = await queueService.cancelRequest(requestId);

    ws.send(JSON.stringify({
        type: 'request_cancelled',
        data: { requestId, success: result.success }
    }));

    broadcastQueueStatus();
}

async function handleAcceptRequest(ws, data) {
    const interpreter = ws.clientInfo;
    const payload = data.data || {};
    const requestId = payload.requestId;

    if (!interpreter || interpreter.role !== 'interpreter') {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Interpreter authentication required before accepting requests.' }
        }));
        return;
    }

    const request = queueService.getRequest(requestId);
    if (!request) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Queue request not found or already assigned.' }
        }));
        return;
    }

    const result = await queueService.assignInterpreter(requestId, interpreter.userId);

    if (!result.success) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: result.message || 'Unable to accept queue request.' }
        }));
        return;
    }

    interpreter.status = 'busy';
    queueService.interpreterUnavailable(interpreter.userId);

    const meetingData = {
        callId: result.callId,
        requestId,
        roomName: result.roomName,
        clientId: result.clientId,
        clientName: result.clientName,
        interpreterId: interpreter.userId,
        interpreterName: interpreter.name,
        language: request.language
    };

    ws.send(JSON.stringify({
        type: 'request_accepted',
        data: meetingData
    }));

    ws.send(JSON.stringify({
        type: 'meeting_initiated',
        data: meetingData
    }));

    const clientSocket = findClientSocketByUserId(result.clientId);
    if (clientSocket) {
        clientSocket.send(JSON.stringify({
            type: 'match_found',
            data: meetingData
        }));
        clientSocket.send(JSON.stringify({
            type: 'meeting_initiated',
            data: meetingData
        }));
    }

    broadcastQueueStatus();
}

function handleDeclineRequest(ws, data) {
    const payload = data.data || {};

    ws.send(JSON.stringify({
        type: 'request_declined',
        data: {
            requestId: payload.requestId,
            declinedBy: ws.clientInfo?.userId || null
        }
    }));
}

function handleDisconnect(clientInfo) {
    const { clientId, role, userId, name } = clientInfo;

    if (role === 'interpreter') {
        clients.interpreters.delete(clientId);
        queueService.interpreterUnavailable(userId);

        broadcastToAdmins({
            type: 'interpreter_disconnected',
            data: {
                id: userId,
                name: name,
                timestamp: Date.now()
            }
        });

        activityLogger.log('interpreter_offline', {
            interpreterId: userId,
            interpreterName: name
        });

    } else if (role === 'client') {
        clients.clients.delete(clientId);

        activityLogger.log('client_disconnected', {
            clientId: userId,
            clientName: name
        });

    } else if (role === 'admin') {
        clients.admins.delete(clientId);
    }

    broadcastQueueStatus();
}

function handleAdminSubscribe(ws, data) {
    // Send all current data to admin
    sendAdminDashboard(ws);
}

function sendQueueStatus(ws) {
    ws.send(JSON.stringify({
        type: 'queue_status',
        data: queueService.getStatus()
    }));
}

function sendAdminDashboard(ws) {
    db.getDashboardStats().then(stats => {
        ws.send(JSON.stringify({
            type: 'dashboard_data',
            data: stats
        }));
    });

    // Send current interpreters
    const interpretersList = Array.from(clients.interpreters.values()).map(i => ({
        id: i.userId,
        name: i.name,
        status: i.status,
        languages: i.languages || [],
        connected: true
    }));

    ws.send(JSON.stringify({
        type: 'interpreters_list',
        data: interpretersList
    }));

    // Send current queue
    ws.send(JSON.stringify({
        type: 'queue_update',
        data: queueService.getQueue()
    }));
}

function broadcastToAdmins(message) {
    const msg = JSON.stringify(message);
    for (const [id, client] of clients.admins) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

function broadcastQueueStatus() {
    const msg = JSON.stringify({
        type: 'queue_status',
        data: queueService.getStatus()
    });

    [ ...clients.clients.values(), ...clients.interpreters.values() ].forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    });
}

function notifyAvailableInterpreters(request) {
    const msg = JSON.stringify({
        type: 'interpreter_request',
        data: request
    });

    for (const client of clients.interpreters.values()) {
        if (client.ws.readyState === WebSocket.OPEN
            && (client.status === 'available' || client.status === 'online' || client.status === 'active')) {
            client.ws.send(msg);
        }
    }
}

function notifyInterpreterOfPendingRequests(ws) {
    queueService.getQueue().forEach(request => {
        ws.send(JSON.stringify({
            type: 'interpreter_request',
            data: request
        }));
    });
}

function findClientSocketByUserId(userId) {
    for (const client of clients.clients.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }

    return null;
}

// Broadcast to all interpreters
function broadcastToInterpreters(message) {
    const msg = JSON.stringify(message);
    for (const [id, client] of clients.interpreters) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(msg);
        }
    }
}

// ============================================
// HANDOFF WEBSOCKET HANDLERS
// ============================================

function handleSessionRegister(ws, data) {
    const { userId, roomName, deviceId } = data.data || data;
    if (!userId || !roomName || !deviceId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'session_register requires userId, roomName, deviceId' }
        }));
        return;
    }

    handoffService.registerSession(userId, roomName, deviceId, ws);

    ws.send(JSON.stringify({
        type: 'session_registered',
        data: { userId, roomName, deviceId }
    }));

    activityLogger.log('session_registered', { userId, roomName, deviceId });
}

function handleSessionUnregister(ws, data) {
    const { userId } = data.data || data;
    if (!userId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'session_unregister requires userId' }
        }));
        return;
    }

    handoffService.unregisterSession(userId);

    ws.send(JSON.stringify({
        type: 'session_unregistered',
        data: { userId }
    }));

    activityLogger.log('session_unregistered', { userId });
}

async function handleHandoffPrepare(ws, data) {
    const { userId, targetDeviceId } = data.data || data;
    if (!userId || !targetDeviceId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'handoff_prepare requires userId and targetDeviceId' }
        }));
        return;
    }

    const result = handoffService.prepareHandoff(userId, targetDeviceId);

    if (result.error) {
        ws.send(JSON.stringify({
            type: 'handoff_error',
            data: { message: result.error }
        }));
        return;
    }

    // Confirm to the sending device
    ws.send(JSON.stringify({
        type: 'handoff_prepared',
        data: { token: result.token, roomName: result.roomName }
    }));

    // Notify the interpreter in the same room about the handoff
    const session = handoffService.getActiveSession(userId);
    if (session && session.interpreterId) {
        const interpreterWs = findInterpreterSocketByUserId(session.interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({
                type: 'handoff_in_progress',
                data: {
                    userId,
                    roomName: session.roomName,
                    estimatedDuration: '2s'
                }
            }));
        }
    }

    activityLogger.log('handoff_prepared', { userId, targetDeviceId, roomName: result.roomName });
}

function handleHandoffReady(ws, data) {
    const { token, newDeviceId } = data.data || data;
    if (!token || !newDeviceId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'handoff_ready requires token and newDeviceId' }
        }));
        return;
    }

    const result = handoffService.executeHandoff(token, newDeviceId);

    if (result.error) {
        ws.send(JSON.stringify({
            type: 'handoff_error',
            data: { message: result.error }
        }));
        return;
    }

    // Confirm to the receiving device
    ws.send(JSON.stringify({
        type: 'handoff_executed',
        data: {
            roomName: result.roomName,
            interpreterId: result.interpreterId,
            userId: result.userId,
            fromDeviceId: result.fromDeviceId
        }
    }));

    // Notify the original device that the handoff was consumed
    const session = handoffService.getActiveSession(result.userId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
            type: 'handoff_consumed',
            data: { newDeviceId, roomName: result.roomName }
        }));
    }

    activityLogger.log('handoff_ready', { userId: result.userId, newDeviceId });
}

function handleHandoffComplete(ws, data) {
    const { userId } = data.data || data;
    if (!userId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'handoff_complete requires userId' }
        }));
        return;
    }

    handoffService.unregisterSession(userId);

    // Notify interpreter that handoff is done
    const { interpreterId } = data.data || {};
    if (interpreterId) {
        const interpreterWs = findInterpreterSocketByUserId(interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({
                type: 'handoff_complete',
                data: { userId }
            }));
        }
    }

    ws.send(JSON.stringify({
        type: 'handoff_completed',
        data: { userId }
    }));

    activityLogger.log('handoff_completed', { userId });
}

function handleHandoffCancel(ws, data) {
    const { userId } = data.data || data;
    if (!userId) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'handoff_cancel requires userId' }
        }));
        return;
    }

    handoffService.cancelHandoff(userId);

    ws.send(JSON.stringify({
        type: 'handoff_cancelled',
        data: { userId }
    }));

    activityLogger.log('handoff_cancelled', { userId });
}

function findInterpreterSocketByUserId(userId) {
    for (const client of clients.interpreters.values()) {
        if (client.userId === userId) {
            return client.ws;
        }
    }
    return null;
}

// Keep-alive mechanism for WebSocket
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.send(JSON.stringify({ type: 'ping' }));
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// ============================================
// AUTHENTICATION MIDDLEWARE
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

// ============================================
// REST API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        websocket: wss.clients.size + ' clients connected'
    });
});

// ===== AUTH ROUTES =====

app.post('/api/admin/login', authLimiter, async (req, res) => {
    if (!LEGACY_ADMIN_LOGIN_ENABLED) {
        return res.status(410).json({
            error: 'Legacy admin login is disabled. Use the ops authentication service.'
        });
    }

    const validationError = validateRequired(req.body, [ 'username', 'password' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { username, password } = req.body;

    try {
        const admin = await db.getAdminByUsername(username);

        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: admin.id,
                username: admin.username,
                role: 'admin'
            },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        activityLogger.log('admin_login', {
            adminId: admin.id,
            username: admin.username
        });

        res.json({
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                name: admin.name
            }
        });

    } catch (error) {
        console.error('[Login] Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/logout', authenticateAdmin, (req, res) => {
    activityLogger.log('admin_logout', {
        adminId: req.admin.id
    });
    res.json({ success: true });
});

// Verify token endpoint
app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
    res.json({
        valid: true,
        admin: {
            id: req.admin.id,
            username: req.admin.username,
            name: req.admin.name
        }
    });
});

// ===== DASHBOARD STATS =====

app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('[Stats] Error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ===== INTERPRETERS =====

app.get('/api/admin/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const interpreters = await db.getAllInterpreters();

        // Merge with connected interpreters from WebSocket
        const connectedIds = new Set(
            Array.from(clients.interpreters.values()).map(i => i.userId)
        );

        const interpretersWithStatus = interpreters.map(interp => ({
            ...interp,
            connected: connectedIds.has(interp.id.toString()),
            // Current status from WebSocket if connected
            currentStatus: Array.from(clients.interpreters.values())
                .find(i => i.userId === interp.id.toString())?.status || 'offline'
        }));

        res.json(interpretersWithStatus);
    } catch (error) {
        console.error('[Interpreters] Error:', error);
        res.status(500).json({ error: 'Failed to fetch interpreters' });
    }
});

app.post('/api/admin/interpreters', authenticateAdmin, async (req, res) => {
    const validationError = validateRequired(req.body, [ 'name', 'email' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, languages, password } = req.body;

    try {
        const interpreterId = await db.createInterpreter({
            name,
            email,
            languages: languages || ['ASL'],
            password
        });

        activityLogger.log('interpreter_created', {
            adminId: req.admin.id,
            interpreterId,
            name,
            email
        });

        res.json({
            success: true,
            id: interpreterId
        });
    } catch (error) {
        console.error('[Create Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to create interpreter' });
    }
});

app.put('/api/admin/interpreters/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, email, languages, active } = req.body;

    try {
        await db.updateInterpreter(id, { name, email, languages, active });

        activityLogger.log('interpreter_updated', {
            adminId: req.admin.id,
            interpreterId: id,
            updates: { name, email, languages, active }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Update Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to update interpreter' });
    }
});

app.delete('/api/admin/interpreters/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        await db.deleteInterpreter(id);

        activityLogger.log('interpreter_deleted', {
            adminId: req.admin.id,
            interpreterId: id
        });

        res.json({ success: true });
    } catch (error) {
        console.error('[Delete Interpreter] Error:', error);
        res.status(500).json({ error: 'Failed to delete interpreter' });
    }
});

// ===== CLIENTS =====

app.get('/api/admin/clients', authenticateAdmin, async (req, res) => {
    try {
        const clients = await db.getAllClients();
        res.json(clients);
    } catch (error) {
        console.error('[Clients] Error:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

app.post('/api/admin/clients', authenticateAdmin, async (req, res) => {
    const validationError = validateRequired(req.body, [ 'name' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, organization } = req.body;

    try {
        const clientId = await db.createClient({
            name,
            email,
            organization
        });

        activityLogger.log('client_created', {
            adminId: req.admin.id,
            clientId,
            name,
            email,
            organization
        });

        res.json({
            success: true,
            id: clientId
        });
    } catch (error) {
        console.error('[Create Client] Error:', error);
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// ===== QUEUE =====

app.get('/api/admin/queue', authenticateAdmin, (req, res) => {
    const queue = queueService.getQueue();
    res.json(queue);
});

app.post('/api/admin/queue/pause', authenticateAdmin, (req, res) => {
    queueService.pause();
    activityLogger.log('queue_paused', {
        adminId: req.admin.id
    });
    res.json({ success: true, paused: true });
});

app.post('/api/admin/queue/resume', authenticateAdmin, (req, res) => {
    queueService.resume();
    activityLogger.log('queue_resumed', {
        adminId: req.admin.id
    });
    res.json({ success: true, paused: false });
});

app.post('/api/admin/queue/:requestId/assign', authenticateAdmin, async (req, res) => {
    const { requestId } = req.params;
    const validationError = validateRequired(req.body, [ 'interpreterId' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { interpreterId } = req.body;

    try {
        const result = await queueService.assignInterpreter(requestId, interpreterId);

        activityLogger.log('queue_manual_assign', {
            adminId: req.admin.id,
            requestId,
            interpreterId
        });

        res.json(result);
    } catch (error) {
        console.error('[Assign] Error:', error);
        res.status(500).json({ error: 'Failed to assign interpreter' });
    }
});

app.delete('/api/admin/queue/:requestId', authenticateAdmin, (req, res) => {
    const { requestId } = req.params;
    Promise.resolve(queueService.removeFromQueue(requestId))
        .then(() => {
            activityLogger.log('queue_request_removed', {
                adminId: req.admin.id,
                requestId
            });

            broadcastQueueStatus();
            res.json({ success: true });
        })
        .catch(error => {
            console.error('[Queue Remove] Error:', error);
            res.status(500).json({ error: 'Failed to remove queue request' });
        });
});

// ===== ACTIVITY LOG =====

app.get('/api/admin/activity', authenticateAdmin, async (req, res) => {
    const { limit = 50, type } = req.query;

    try {
        const activity = await db.getActivityLog({
            limit: parseInt(limit),
            type
        });
        res.json(activity);
    } catch (error) {
        console.error('[Activity] Error:', error);
        res.status(500).json({ error: 'Failed to fetch activity log' });
    }
});

// ===== USAGE STATS =====

app.get('/api/admin/usage/daily', authenticateAdmin, async (req, res) => {
    const { days = 7 } = req.query;

    try {
        const stats = await db.getDailyUsageStats(parseInt(days));
        res.json(stats);
    } catch (error) {
        console.error('[Usage] Error:', error);
        res.status(500).json({ error: 'Failed to fetch usage stats' });
    }
});

app.get('/api/admin/usage/interpreters', authenticateAdmin, async (req, res) => {
    try {
        const stats = await db.getInterpreterStats();
        res.json(stats);
    } catch (error) {
        console.error('[Interpreter Usage] Error:', error);
        res.status(500).json({ error: 'Failed to fetch interpreter stats' });
    }
});

// ============================================
// CLIENT-FACING API (no auth required)
// ============================================

// Register new client
app.post('/api/vrs/register', async (req, res) => {
    const validationError = validateRequired(req.body, [ 'name', 'role' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, role } = req.body;

    try {
        if (role === 'interpreter') {
            // Interpreters need approval or invitation
            return res.status(400).json({
                error: 'Interpreter registration requires approval. Please contact administrator.'
            });
        }

        const clientId = await db.createClient({
            name,
            email,
            organization: req.body.organization || 'Personal'
        });

        res.json({
            success: true,
            id: clientId
        });
    } catch (error) {
        console.error('[Register] Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// ============================================
// USER AUTHENTICATION (client + interpreter)
// ============================================

/**
 * Authenticate any user by JWT Bearer token.
 * Sets req.user with decoded token claims.
 */
function authenticateUser(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = normalizeAuthClaims(verifyJwtToken(token));
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// --- Client Auth ---

app.post('/api/auth/client/register', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, [ 'name', 'email', 'password' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, password, organization } = req.body;

    try {
        const existing = await db.getClientByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const client = await db.createClient({ name, email, password, organization });

        // Assign a phone number
        const phoneNum = `+1-555-${String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`;
        await db.assignClientPhoneNumber({ clientId: client.id, phoneNumber: phoneNum, isPrimary: true });

        const token = jwt.sign(
            { id: client.id, email, name, role: 'client' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        activityLogger.log('client_registered', { clientId: client.id, name, email });

        res.json({
            success: true,
            token,
            user: { id: client.id, name, email, role: 'client', phoneNumber: phoneNum }
        });
    } catch (error) {
        console.error('[Client Register] Error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/client/login', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, [ 'email', 'password' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { email, password } = req.body;

    try {
        const client = await db.getClientByEmail(email);
        if (!client || !client.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, client.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: client.id, email: client.email, name: client.name, role: 'client' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const phones = await db.getClientPhoneNumbers(client.id);
        const primary = phones.find(p => p.is_primary);

        activityLogger.log('client_login', { clientId: client.id });

        res.json({
            success: true,
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                role: 'client',
                phoneNumber: primary?.phone_number
            }
        });
    } catch (error) {
        console.error('[Client Login] Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Interpreter Auth ---

app.post('/api/auth/interpreter/login', authLimiter, async (req, res) => {
    const validationError = validateRequired(req.body, [ 'email', 'password' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { email, password } = req.body;

    try {
        const interpreters = await db.getAllInterpreters();
        const interpreter = interpreters.find(i => i.email === email);

        if (!interpreter || !interpreter.password_hash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, interpreter.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!interpreter.active) {
            return res.status(403).json({ error: 'Account is inactive' });
        }

        const token = jwt.sign(
            { id: interpreter.id, email: interpreter.email, name: interpreter.name, role: 'interpreter' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        activityLogger.log('interpreter_login', { interpreterId: interpreter.id });

        res.json({
            success: true,
            token,
            user: {
                id: interpreter.id,
                name: interpreter.name,
                email: interpreter.email,
                role: 'interpreter',
                languages: interpreter.languages
            }
        });
    } catch (error) {
        console.error('[Interpreter Login] Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============================================
// CLIENT PROFILE ENDPOINTS (authenticated)
// ============================================

app.get('/api/client/profile', authenticateUser, async (req, res) => {
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

app.get('/api/client/call-history', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
        const calls = await db.getClientCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        console.error('[Client Call History] Error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

app.get('/api/client/speed-dial', authenticateUser, async (req, res) => {
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

app.post('/api/client/speed-dial', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const validationError = validateRequired(req.body, [ 'name', 'phoneNumber' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, phoneNumber, category } = req.body;
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

app.put('/api/client/speed-dial/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    const { name, phoneNumber, category } = req.body;

    try {
        const entries = await db.getSpeedDialEntries(req.user.id);
        const entry = entries.find(e => e.id === req.params.id);
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        const updates: Record<string, string> = {};
        if (name !== undefined) updates.name = name;
        if (phoneNumber !== undefined) {
            const sanitized = sanitizePhoneNumber(phoneNumber);
            if (!sanitized) {
                return res.status(400).json({ error: 'Invalid phone number' });
            }
            updates.phoneNumber = sanitized;
        }
        if (category !== undefined) updates.category = category;

        await db.updateSpeedDialEntry(req.params.id, updates);
        res.json({ success: true });
    } catch (error) {
        console.error('[Speed Dial Update] Error:', error);
        res.status(500).json({ error: 'Failed to update speed dial entry' });
    }
});

app.delete('/api/client/speed-dial/:id', authenticateUser, async (req, res) => {
    if (req.user.role !== 'client') {
        return res.status(403).json({ error: 'Client access required' });
    }

    try {
        const entries = await db.getSpeedDialEntries(req.user.id);
        if (!entries.find(e => e.id === req.params.id)) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        await db.deleteSpeedDialEntry(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[Speed Dial Delete] Error:', error);
        res.status(500).json({ error: 'Failed to delete speed dial entry' });
    }
});

// ============================================
// INTERPRETER PROFILE ENDPOINTS (authenticated)
// ============================================

app.get('/api/interpreter/profile', authenticateUser, async (req, res) => {
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
            role: 'interpreter',
            languages: interpreter.languages
        });
    } catch (error) {
        console.error('[Interpreter Profile] Error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.get('/api/interpreter/call-history', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
        const calls = await db.getInterpreterCallHistory(req.user.id, limit, offset);
        res.json({ calls });
    } catch (error) {
        console.error('[Interpreter Call History] Error:', error);
        res.status(500).json({ error: 'Failed to fetch call history' });
    }
});

app.get('/api/interpreter/shifts', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const { startDate, endDate } = req.query;

    try {
        const shifts = await db.getInterpreterShifts(req.user.id, startDate as string, endDate as string);
        res.json({ shifts });
    } catch (error) {
        console.error('[Interpreter Shifts] Error:', error);
        res.status(500).json({ error: 'Failed to fetch shifts' });
    }
});

app.get('/api/interpreter/earnings', authenticateUser, async (req, res) => {
    if (req.user.role !== 'interpreter') {
        return res.status(403).json({ error: 'Interpreter access required' });
    }

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const periodStart = (req.query.periodStart as string) || defaultStart;
    const periodEnd = (req.query.periodEnd as string) || defaultEnd;

    try {
        const earnings = await db.getInterpreterEarnings(req.user.id, periodStart, periodEnd);
        res.json({ earnings });
    } catch (error) {
        console.error('[Interpreter Earnings] Error:', error);
        res.status(500).json({ error: 'Failed to fetch earnings' });
    }
});

app.get('/api/interpreter/stats', authenticateUser, async (req, res) => {
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

// ===== HANDOFF ENDPOINTS =====

/**
 * Prepare a handoff by creating a one-time token.
 * The sending device calls this when the user confirms transfer.
 *
 * Body: { userId, targetDeviceId }
 * Returns: { token, roomName, interpreterId }
 */
app.post('/api/handoff/prepare', (req, res) => {
    const validationError = validateRequired(req.body, [ 'userId', 'targetDeviceId' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { userId, targetDeviceId } = req.body;
    const result = handoffService.prepareHandoff(userId, targetDeviceId);

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    // Notify the interpreter in the same room about the handoff
    const session = handoffService.getActiveSession(userId);
    if (session && session.interpreterId) {
        const interpreterWs = findInterpreterSocketByUserId(session.interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({
                type: 'handoff_in_progress',
                data: {
                    userId,
                    roomName: session.roomName,
                    estimatedDuration: '2s'
                }
            }));
        }
    }

    activityLogger.log('handoff_prepare_rest', { userId, targetDeviceId, roomName: result.roomName });

    res.json(result);
});

/**
 * Execute a handoff by redeeming a one-time token.
 * The receiving device calls this when it's ready to join.
 *
 * Body: { token, newDeviceId }
 * Returns: { roomName, interpreterId, userId, fromDeviceId }
 */
app.post('/api/handoff/execute', (req, res) => {
    const validationError = validateRequired(req.body, [ 'token', 'newDeviceId' ]);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { token, newDeviceId } = req.body;
    const result = handoffService.executeHandoff(token, newDeviceId);

    if (result.error) {
        return res.status(400).json({ error: result.error });
    }

    // Notify the original device that the token was consumed
    const session = handoffService.getActiveSession(result.userId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
            type: 'handoff_consumed',
            data: { newDeviceId, roomName: result.roomName }
        }));
    }

    activityLogger.log('handoff_execute_rest', { userId: result.userId, newDeviceId });

    res.json(result);
});

/**
 * Check if a handoff is in progress for a user.
 *
 * Query: ?userId=xxx
 * Returns: { inProgress, targetDeviceId?, roomName?, expiresAt? }
 */
app.get('/api/handoff/status', (req, res) => {
    const { userId } = req.query;
    if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
    }

    const status = handoffService.getHandoffStatus(userId);
    res.json(status);
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((error, req, res, next) => {
    console.error('[Server] Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ============================================
// START SERVER
// ============================================

// Initialize database then start server
db.initialize().then(() => {
    queueService.broadcastToAdmins = (type, data) => broadcastToAdmins({ type, data });
    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║           MalkaVRS Server Started Successfully!            ║
╠════════════════════════════════════════════════════════════╣
║  HTTP Server:   http://localhost:${PORT}                      ║
║  WebSocket:     ws://localhost:${PORT}/ws                     ║
║  API Base:      /api                                          ║
║  Admin Panel:   /vrs-admin-dashboard.html                     ║
╠════════════════════════════════════════════════════════════╣
║  Environment:   ${process.env.NODE_ENV || 'development'}                       ║
╚════════════════════════════════════════════════════════════╝
        `);
    });
}).catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});

module.exports = { app, server, wss, db, queueService };
