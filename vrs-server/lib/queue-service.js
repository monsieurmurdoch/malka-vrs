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

// Queue state
const queue = new Map(); // requestId -> request data
const availableInterpreters = new Map(); // interpreterId -> interpreter data
let paused = false;
let totalMatches = 0;

// In-flight matching lock to prevent double-booking.
// Maps requestId -> true while a match is being processed.
const matchingLocks = new Map();

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
            console.warn(`[Queue] DB operation failed (attempt ${attempt}/${retries}), retrying in ${delay}ms…`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function initialize() {
    queue.clear();
    matchingLocks.clear();

    const waitingRequests = await withRetry(() => db.getQueueRequests('waiting'));

    waitingRequests.forEach(request => {
        queue.set(request.id, {
            id: request.id,
            requestId: request.id,
            clientId: request.client_id ?? null,
            clientName: request.client_name,
            language: request.language,
            targetPhone: request.target_phone || null,
            roomName: request.room_name,
            position: request.position,
            status: request.status || 'waiting',
            createdAt: request.created_at ? new Date(request.created_at) : new Date()
        });
    });

    reorderQueue();

    console.log(`[Queue] Rehydrated ${queue.size} waiting request${queue.size === 1 ? '' : 's'} from database`);

    return {
        success: true,
        queueSize: queue.size
    };
}

// ============================================
// CLIENT REQUESTS
// ============================================

async function requestInterpreter({ clientId, clientName, language, roomName, targetPhone = null }) {
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
        targetPhone
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
        createdAt: new Date()
    };

    queue.set(id, request);

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
        matchingLocks.delete(requestId);
        await withRetry(() => db.removeFromQueue(requestId));
        reorderQueue();

        notifyAdmins('queue_request_cancelled', { requestId });

        return { success: true };
    }

    return { success: false, message: 'Request not found' };
}

// ============================================
// INTERPRETER AVAILABILITY
// ============================================

function interpreterAvailable(interpreterId, interpreterName, languages = ['ASL']) {
    availableInterpreters.set(interpreterId, {
        id: interpreterId,
        name: interpreterName,
        languages,
        availableAt: new Date()
    });

    console.log(`[Queue] Interpreter ${interpreterName} (${languages.join(', ')}) is now available`);

    return { success: true };
}

function interpreterUnavailable(interpreterId) {
    availableInterpreters.delete(interpreterId);

    console.log(`[Queue] Interpreter ${interpreterId} is now unavailable`);

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
    notifyAdmins('queue_paused', { timestamp: new Date() });
}

function resume() {
    paused = false;
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
        console.log('[Queue] No interpreters available,', waitingRequests.length, 'requests waiting');
        return;
    }

    // Match requests with interpreters — use per-request locking
    for (const request of waitingRequests) {
        // Skip requests already being matched
        if (matchingLocks.has(request.id)) {
            continue;
        }

        // Check the in-memory queue — if already gone, skip
        if (!queue.has(request.id) && !request.id) {
            continue;
        }

        const matched = findBestMatch(request, interpreters);

        if (matched) {
            // Acquire lock before processing
            matchingLocks.set(request.id, true);

            try {
                await completeMatch(request, matched);
            } catch (error) {
                console.error(`[Queue] Error completing match for request ${request.id}:`, error);
                matchingLocks.delete(request.id);
                continue;
            }

            // Remove interpreter from available list
            const idx = interpreters.indexOf(matched);
            if (idx > -1) {
                interpreters.splice(idx, 1);
            }
            availableInterpreters.delete(matched.id);
            matchingLocks.delete(request.id);
        }
    }
}

function findBestMatch(request, interpreters) {
    // Find interpreters who match the language
    const matching = interpreters.filter(interp =>
        interp.languages && interp.languages.includes(request.language)
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

    // Update database (with retry)
    await withRetry(() => db.assignInterpreter(request.id, interpreter.id));

    // Remove from local queue
    queue.delete(request.id);

    // Create call record (with retry)
    const callId = await withRetry(() => db.createCall({
        clientId,
        interpreterId: interpreter.id,
        roomName,
        language: request.language
    }));

    totalMatches += 1;

    // Notify participants
    // In production: this would trigger WebSocket messages to both parties

    console.log(`[Queue] Matched: ${clientName} -> ${interpreter.name}`);

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
    if (matchingLocks.has(requestId)) {
        return { success: false, message: 'Request is already being processed' };
    }

    const request = queue.get(requestId);
    const interpreter = availableInterpreters.get(interpreterId);

    if (!request) {
        return { success: false, message: 'Request not found' };
    }

    if (!interpreter) {
        return { success: false, message: 'Interpreter not available' };
    }

    matchingLocks.set(requestId, true);

    try {
        const result = await completeMatch(request, interpreter);

        // Remove interpreter from available list
        availableInterpreters.delete(interpreterId);

        return result;
    } catch (error) {
        console.error(`[Queue] Error assigning interpreter for request ${requestId}:`, error);

        return { success: false, message: 'Failed to complete assignment' };
    } finally {
        matchingLocks.delete(requestId);
    }
}

function getRequest(requestId) {
    return queue.get(requestId);
}

function getPendingRequests() {
    return Array.from(queue.values());
}

async function removeFromQueue(requestId) {
    return cancelRequest(requestId);
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
