/**
 * Queue Service
 *
 * Manages the interpreter queue matching logic:
 * - Receives interpreter requests from clients
 * - Matches with available interpreters
 * - Maintains queue positions
 * - Handles timeouts and expirations
 */

const db = require('../database');
const { metrics } = require('./metrics');
const log = require('./logger').module('queue');
const lifecycle = require('./call-lifecycle-logger');
const redis = require('./redis-client');

// Queue state
const queue = new Map(); // requestId -> request data
const availableInterpreters = new Map(); // interpreterId -> interpreter data
let paused = false;
let totalMatches = 0;

// In-flight matching lock to prevent double-booking.
// Maps requestId -> true while a match is being processed.
const matchingLocks = new Map();

const SERVER_STATE_KEY_PAUSED = 'queue.paused';
const SERVER_STATE_KEY_MATCHES = 'queue.totalMatches';
const REDIS_QUEUE_PREFIX = process.env.REDIS_QUEUE_PREFIX || 'vrs:queue';
const QUEUE_REQUEST_TTL_SECONDS = Number(process.env.REDIS_QUEUE_REQUEST_TTL_SECONDS || 8 * 60 * 60);
const INTERPRETER_TTL_SECONDS = Number(process.env.REDIS_INTERPRETER_TTL_SECONDS || 2 * 60);
const MATCH_LOCK_TTL_SECONDS = Number(process.env.REDIS_MATCH_LOCK_TTL_SECONDS || 30);

function redisRequestKey(requestId) {
    return `${REDIS_QUEUE_PREFIX}:request:${requestId}`;
}

function redisInterpreterKey(interpreterId) {
    return `${REDIS_QUEUE_PREFIX}:interpreter:${interpreterId}`;
}

function redisMatchLockKey(requestId) {
    return `${REDIS_QUEUE_PREFIX}:match-lock:${requestId}`;
}

function serializeDated(value) {
    return {
        ...value,
        availableAt: value.availableAt instanceof Date ? value.availableAt.toISOString() : value.availableAt,
        createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt
    };
}

function hydrateQueueRequest(value) {
    if (!value || !value.id) return null;
    return { ...value, createdAt: value.createdAt ? new Date(value.createdAt) : new Date() };
}

function hydrateInterpreter(value) {
    if (!value || !value.id) return null;
    return { ...value, availableAt: value.availableAt ? new Date(value.availableAt) : new Date() };
}

function persistQueueRequest(request) {
    redis.setJson(redisRequestKey(request.id), serializeDated(request), { exSeconds: QUEUE_REQUEST_TTL_SECONDS })
        .catch(err => log.warn({ err, requestId: request.id }, 'Failed to persist queue request to Redis'));
}

function removeQueueRequest(requestId) {
    redis.del(redisRequestKey(requestId), redisMatchLockKey(requestId)).catch(() => {});
}

function persistInterpreter(interpreter) {
    redis.setJson(redisInterpreterKey(interpreter.id), serializeDated(interpreter), { exSeconds: INTERPRETER_TTL_SECONDS })
        .catch(err => log.warn({ err, interpreterId: interpreter.id }, 'Failed to persist interpreter availability to Redis'));
}

function removeInterpreter(interpreterId) {
    redis.del(redisInterpreterKey(interpreterId)).catch(() => {});
}

async function acquireMatchLock(requestId) {
    if (matchingLocks.has(requestId)) return false;
    matchingLocks.set(requestId, true);

    const redisResult = await redis.setJson(redisMatchLockKey(requestId), {
        acquiredAt: new Date().toISOString(),
        requestId
    }, { exSeconds: MATCH_LOCK_TTL_SECONDS, nx: true });

    if (redis.isEnabled() && redisResult !== 'OK') {
        matchingLocks.delete(requestId);
        return false;
    }

    return true;
}

function releaseMatchLock(requestId) {
    matchingLocks.delete(requestId);
    redis.del(redisMatchLockKey(requestId)).catch(() => {});
}

// ============================================
// DATABASE RETRY HELPER
// ============================================

const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 200;

/**
 * Retry a database operation up to `retries` times with exponential backoff.
 */
async function withRetry(fn, retries = MAX_DB_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            const delay = DB_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            log.warn({ attempt, retries, delay, err: error.message }, 'DB operation failed, retrying');
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function initialize() {
    queue.clear();
    matchingLocks.clear();

    try {
        const savedPaused = await db.getServerState(SERVER_STATE_KEY_PAUSED);
        paused = savedPaused === 'true';
        const savedMatches = await db.getServerState(SERVER_STATE_KEY_MATCHES);
        totalMatches = savedMatches ? parseInt(savedMatches, 10) : 0;
    } catch (err) { /* use defaults */ }

    const waitingRequests = await withRetry(() => db.getQueueRequests('waiting'));

    waitingRequests.forEach(request => {
        const hydrated = {
            id: request.id,
            requestId: request.id,
            clientId: request.client_id ?? null,
            clientName: request.client_name,
            language: request.language,
            targetPhone: request.target_phone || null,
            roomName: request.room_name,
            position: request.position,
            status: request.status || 'waiting',
            createdAt: request.created_at ? new Date(request.created_at) : new Date(),
            callType: request.service_mode || request.call_type || (request.target_phone ? 'vrs' : undefined),
            serviceMode: request.service_mode || request.call_type || (request.target_phone ? 'vrs' : 'vri'),
            serviceModes: request.service_modes || [],
            tenantId: request.tenant_id || 'malka'
        };
        queue.set(request.id, hydrated);
        persistQueueRequest(hydrated);
    });

    const redisRequests = await redis.getJsonByPattern(`${REDIS_QUEUE_PREFIX}:request:*`);
    for (const value of redisRequests) {
        const request = hydrateQueueRequest(value);
        if (request && !queue.has(request.id)) {
            queue.set(request.id, request);
        }
    }

    const redisInterpreters = await redis.getJsonByPattern(`${REDIS_QUEUE_PREFIX}:interpreter:*`);
    for (const value of redisInterpreters) {
        const interpreter = hydrateInterpreter(value);
        if (interpreter) {
            availableInterpreters.set(interpreter.id, interpreter);
        }
    }

    reorderQueue();

    log.info({
        availableInterpreters: availableInterpreters.size,
        count: queue.size,
        redisEnabled: redis.isEnabled()
    }, 'Rehydrated waiting requests from database and Redis');

    return {
        success: true,
        queueSize: queue.size
    };
}

// ============================================
// CLIENT REQUESTS
// ============================================

async function requestInterpreter({
    clientId,
    clientName,
    language,
    roomName,
    targetPhone = null,
    callType,
    inviteTokens = [],
    correlationId
}) {
    if (paused) {
        return {
            success: false,
            message: 'Queue is currently paused. Please try again later.'
        };
    }

    // Add to database queue (with retry)
    const { id, position } = await withRetry(() => db.addToQueue({
        clientId,
        clientName,
        language,
        roomName,
        targetPhone,
        callType
    }));

    const request = {
        id,
        requestId: id,
        clientId: clientId || null,
        clientName,
        language,
        targetPhone,
        roomName,
        position,
        status: 'waiting',
        createdAt: new Date(),
        callType: callType || (targetPhone ? 'vrs' : 'vri'),
        correlationId,
        serviceMode: callType || (targetPhone ? 'vrs' : 'vri')
    };

    queue.set(id, request);
    persistQueueRequest(request);
    lifecycle.logCallEvent('queue_join', {
        callType: request.callType,
        clientId,
        correlationId,
        language,
        position,
        requestId: id,
        roomName
    });

    if (request.callType === 'vri' && clientId && inviteTokens.length) {
        await withRetry(() => db.attachVriInvitesToQueue({
            clientId,
            inviteTokens,
            requestId: id,
            roomName
        }));
    }

    // Track queue depth
    metrics.queueDepth.set(queue.size);

    // Notify admins
    notifyAdmins('queue_request_added', request);

    return {
        success: true,
        requestId: id,
        position,
        request,
        message: 'Request added to queue'
    };
}

async function cancelRequest(requestId) {
    const request = queue.get(requestId);

    if (request) {
        queue.delete(requestId);
        releaseMatchLock(requestId);
        removeQueueRequest(requestId);
        await withRetry(() => db.expireVriInvitesForQueue(requestId));
        await withRetry(() => db.removeFromQueue(requestId));
        reorderQueue();

        metrics.queueCancellationsTotal.inc();
        metrics.queueDepth.set(queue.size);

        notifyAdmins('queue_request_cancelled', { requestId });

        return { success: true };
    }

    return { success: false, message: 'Request not found' };
}

async function cancelRequestsForClient(clientId) {
    if (!clientId) {
        return { success: true, cancelled: 0 };
    }

    const requestIds = Array.from(queue.values())
        .filter(request => String(request.clientId || '') === String(clientId))
        .map(request => request.id);

    for (const requestId of requestIds) {
        await cancelRequest(requestId);
    }

    return { success: true, cancelled: requestIds.length };
}

// ============================================
// INTERPRETER AVAILABILITY
// ============================================

function interpreterAvailable(interpreterId, interpreterName, languages = ['ASL'], serviceModes = ['vrs']) {
    const interpreter = {
        id: interpreterId,
        name: interpreterName,
        languages,
        serviceModes,
        availableAt: new Date()
    };

    availableInterpreters.set(interpreterId, interpreter);
    persistInterpreter(interpreter);

    log.info({ interpreterId, interpreterName, languages, serviceModes }, 'Interpreter now available');

    return { success: true };
}

function interpreterUnavailable(interpreterId) {
    availableInterpreters.delete(interpreterId);
    removeInterpreter(interpreterId);

    log.info({ interpreterId }, 'Interpreter now unavailable');

    return { success: true };
}

function updateInterpreterStatus(interpreterId, status) {
    if (status === 'online' || status === 'active' || status === 'available') {
        const interp = availableInterpreters.get(interpreterId);
        if (interp) {
            // Already marked as available
            return { success: true };
        }
    } else if (status === 'offline' || status === 'inactive' || status === 'busy') {
        return interpreterUnavailable(interpreterId);
    }

    return { success: true };
}

// ============================================
// QUEUE STATUS
// ============================================

function getStatus() {
    return {
        paused,
        queueSize: queue.size,
        activeInterpreters: Array.from(availableInterpreters.values()),
        pendingRequests: getQueue(),
        totalMatches
    };
}

function getQueue() {
    return Array.from(queue.values()).map(req => ({
        ...req,
        wait_time: calculateWaitTime(req.createdAt)
    }));
}

function pause() {
    paused = true;
    db.setServerState(SERVER_STATE_KEY_PAUSED, 'true').catch(() => {});
    notifyAdmins('queue_paused', { timestamp: new Date() });
}

function resume() {
    paused = false;
    db.setServerState(SERVER_STATE_KEY_PAUSED, 'false').catch(() => {});
    notifyAdmins('queue_resumed', { timestamp: new Date() });
}

// ============================================
// MATCHING LOGIC
// ============================================

async function tryMatch() {
    if (paused) return;

    // Get waiting requests from database (with retry)
    const waitingRequests = await withRetry(() => db.getQueueRequests('waiting'));

    if (waitingRequests.length === 0) return;

    // Get available interpreters
    const interpreters = Array.from(availableInterpreters.values());

    if (interpreters.length === 0) {
        log.info({ waiting: waitingRequests.length }, 'No interpreters available, requests waiting');
        return;
    }

    // Match requests with interpreters — use per-request locking
    for (const request of waitingRequests) {
        // Skip requests already being matched
        if (!(await acquireMatchLock(request.id))) {
            continue;
        }

        // Check the in-memory queue — if already gone, skip
        if (!queue.has(request.id) && !request.id) {
            releaseMatchLock(request.id);
            continue;
        }

        const matched = findBestMatch(request, interpreters);

        if (matched) {
            try {
                await completeMatch(request, matched);
            } catch (error) {
                log.error({ err: error, requestId: request.id }, 'Error completing match');
                releaseMatchLock(request.id);
                continue;
            }

            // Remove interpreter from available list
            const idx = interpreters.indexOf(matched);
            if (idx > -1) {
                interpreters.splice(idx, 1);
            }
            availableInterpreters.delete(matched.id);
            removeInterpreter(matched.id);
            releaseMatchLock(request.id);
        } else {
            releaseMatchLock(request.id);
        }
    }
}

function findBestMatch(request, interpreters) {
    const localRequest = queue.get(request.id);
    const requestMode = request.callType || request.call_type || localRequest?.callType
        || (request.targetPhone || request.target_phone ? 'vrs' : 'vri');
    // Find interpreters who match the language
    const matching = interpreters.filter(interp =>
        interp.languages && interp.languages.includes(request.language)
        && (!interp.serviceModes || interp.serviceModes.includes(requestMode))
    );

    if (matching.length === 0) {
        return null;
    }

    // Select the one who's been available longest (FIFO)
    matching.sort((a, b) => a.availableAt - b.availableAt);

    return matching[0];
}

async function completeMatch(request, interpreter) {
    const clientId = request.clientId ?? request.client_id ?? null;
    const clientName = request.clientName ?? request.client_name ?? 'Guest';
    const targetPhone = request.targetPhone ?? request.target_phone ?? null;
    const roomName = request.roomName ?? request.room_name;
    const localRequest = queue.get(request.id);

    // Update database (with retry)
    await withRetry(() => db.assignInterpreter(request.id, interpreter.id));

    // Remove from local queue
    queue.delete(request.id);
    removeQueueRequest(request.id);

    // Create call record (with retry)
    const callType = request.callType || request.call_type || localRequest?.callType || (targetPhone ? 'vrs' : 'vri');
    const callId = await withRetry(() => db.createCall({
        clientId,
        interpreterId: interpreter.id,
        roomName,
        language: request.language,
        callType
    }));

    if (callType === 'vri') {
        await withRetry(() => db.activateVriInvitesForQueue({
            requestId: request.id,
            roomName
        }));
    }

    totalMatches += 1;
    db.setServerState(SERVER_STATE_KEY_MATCHES, String(totalMatches)).catch(() => {});

    // Track metrics
    const language = request.language || 'unknown';
    metrics.queueMatchesTotal.inc({ language });
    metrics.queueDepth.set(queue.size);

    // Track queue wait time (time from request creation to match)
    const waitSeconds = (Date.now() - new Date(request.createdAt).getTime()) / 1000;
    metrics.queueWaitTime.observe({ language }, waitSeconds);

    // Track call setup time
    metrics.callSetupTime.observe({ language }, waitSeconds);

    // Notify participants
    // In production: this would trigger WebSocket messages to both parties

    log.info({ clientName, interpreterName: interpreter.name, callId, roomName }, 'Client-interpreter match completed');
    lifecycle.logCallEvent('interpreter_match', {
        callId,
        callType,
        clientId,
        correlationId: request.correlationId,
        interpreterId: interpreter.id,
        language: request.language,
        requestId: request.id,
        waitSeconds
    });
    lifecycle.logCallEvent('room_created', {
        callId,
        callType,
        correlationId: request.correlationId,
        requestId: request.id,
        roomName
    });

    // Notify admins
    notifyAdmins('queue_match_complete', {
        requestId: request.id,
        clientId,
        clientName,
        interpreterId: interpreter.id,
        interpreterName: interpreter.name,
        roomName,
        language: request.language,
        targetPhone,
        callId
    });

    return {
        success: true,
        callId,
        interpreter: {
            id: interpreter.id,
            name: interpreter.name
        },
        clientId,
        clientName,
        roomName,
        targetPhone
    };
}

async function assignInterpreter(requestId, interpreterId) {
    // Prevent double-assignment through the manual path too
    if (!(await acquireMatchLock(requestId))) {
        return { success: false, message: 'Request is already being processed' };
    }

    const request = queue.get(requestId);
    const interpreter = availableInterpreters.get(interpreterId);

    if (!request) {
        releaseMatchLock(requestId);
        return { success: false, message: 'Request not found' };
    }

    if (!interpreter) {
        releaseMatchLock(requestId);
        return { success: false, message: 'Interpreter not available' };
    }

    try {
        const result = await completeMatch(request, interpreter);

        // Remove interpreter from available list
        availableInterpreters.delete(interpreterId);
        removeInterpreter(interpreterId);

        return result;
    } catch (error) {
        log.error({ err: error, requestId }, 'Error assigning interpreter');

        return { success: false, message: 'Failed to complete assignment' };
    } finally {
        releaseMatchLock(requestId);
    }
}

function getRequest(requestId) {
    return queue.get(requestId);
}

function getPendingRequests() {
    return Array.from(queue.values());
}

async function removeFromQueue(requestId) {
    const request = queue.get(requestId);

    if (request) {
        return cancelRequest(requestId);
    }

    matchingLocks.delete(requestId);
    await withRetry(() => db.expireVriInvitesForQueue(requestId));
    await withRetry(() => db.removeFromQueue(requestId));
    await withRetry(() => db.reorderQueue());
    reorderQueue();

    metrics.queueDepth.set(queue.size);
    notifyAdmins('queue_request_removed', { requestId });

    return { success: true, removedFromMemory: false };
}

// ============================================
// HELPERS
// ============================================

function reorderQueue() {
    const requests = Array.from(queue.values())
        .sort((a, b) => a.createdAt - b.createdAt);

    requests.forEach((req, index) => {
        req.position = index + 1;
    });
}

function calculateWaitTime(createdAt) {
    const now = new Date();
    const diff = Math.floor((now - new Date(createdAt)) / 1000);

    if (diff < 60) {
        return `${diff}s`;
    }

    const minutes = Math.floor(diff / 60);
    if (minutes < 60) {
        return `${minutes}m ${diff % 60}s`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

// Admin notifications (would broadcast via WebSocket)
function notifyAdmins(type, data) {
    // This will be called from the main server
    if (module.exports.broadcastToAdmins) {
        module.exports.broadcastToAdmins(type, data);
    }
}

// ============================================
// EXPORT
// ============================================

module.exports = {
    initialize,
    requestInterpreter,
    cancelRequest,
    cancelRequestsForClient,
    removeFromQueue,
    interpreterAvailable,
    interpreterUnavailable,
    updateInterpreterStatus,
    getStatus,
    getQueue,
    getPendingRequests,
    getRequest,
    pause,
    resume,
    assignInterpreter,
    tryMatch
};
