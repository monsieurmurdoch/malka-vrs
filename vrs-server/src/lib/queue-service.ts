/**
 * Queue Service
 *
 * Manages the interpreter queue matching logic:
 * - Receives interpreter requests from clients
 * - Matches with available interpreters
 * - Maintains queue positions
 * - Handles timeouts and expirations
 */

import * as db from '../database';
import { moduleLogger } from './logger';

const log = moduleLogger('queue');

interface QueueRequest {
    id: string;
    requestId: string;
    clientId: string | null;
    clientName: string;
    language: string;
    targetPhone: string | null;
    roomName: string;
    position: number;
    status: string;
    createdAt: Date;
    callType?: 'vrs' | 'vri';
    serviceMode?: 'vrs' | 'vri';
    serviceModes?: Array<'vri' | 'vrs'>;
    tenantId?: string;
}

interface AvailableInterpreter {
    id: string;
    name: string;
    languages: string[];
    serviceModes?: Array<'vri' | 'vrs'>;
    availableAt: Date;
}

// Queue state
const queue = new Map<string, QueueRequest>();
const availableInterpreters = new Map<string, AvailableInterpreter>();
let paused = false;
let totalMatches = 0;

// In-flight matching lock to prevent double-booking.
const matchingLocks = new Map<string, boolean>();

// ============================================
// DATABASE RETRY HELPER
// ============================================

const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 200;

/**
 * Retry a database operation up to `retries` times with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries: number = MAX_DB_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            const delay = DB_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            log.warn({ attempt, delay, err: error, retries }, 'queue_db_retry');
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    // Unreachable, but TS needs it
    throw new Error('withRetry: exhausted retries');
}

interface InitializeResult {
    success: boolean;
    queueSize: number;
}

async function initialize(): Promise<InitializeResult> {
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
            createdAt: request.created_at ? new Date(request.created_at) : new Date(),
            callType: request.service_mode || request.call_type || (request.target_phone ? 'vrs' : undefined),
            serviceMode: request.service_mode || request.call_type || (request.target_phone ? 'vrs' : 'vri'),
            serviceModes: request.service_modes || [],
            tenantId: request.tenant_id || 'malka'
        });
    });

    reorderQueue();

    log.info({ count: queue.size }, 'queue_rehydrated');

    return {
        success: true,
        queueSize: queue.size
    };
}

// ============================================
// CLIENT REQUESTS
// ============================================

interface RequestInterpreterInput {
    clientId?: string | null;
    clientName: string;
    language: string;
    roomName: string;
    targetPhone?: string | null;
    callType?: 'vrs' | 'vri';
    inviteTokens?: string[];
}

interface RequestResult {
    success: boolean;
    message?: string;
    requestId?: string;
    position?: number;
    request?: QueueRequest;
}

async function requestInterpreter({ clientId, clientName, language, roomName, targetPhone = null, callType, inviteTokens = [] }: RequestInterpreterInput): Promise<RequestResult> {
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

    const request: QueueRequest = {
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
        serviceMode: callType || (targetPhone ? 'vrs' : 'vri'),
    };

    queue.set(id, request);
    log.info({
        callType: request.callType,
        clientId: request.clientId,
        language: request.language,
        requestId: id,
        roomName: request.roomName,
        targetPhone: Boolean(request.targetPhone)
    }, 'call_lifecycle.request_created');

    if (request.callType === 'vri' && clientId && inviteTokens.length) {
        await withRetry(() => db.attachVriInvitesToQueue({
            clientId,
            inviteTokens,
            requestId: id,
            roomName
        }));
    }

    // Notify admins
    notifyAdmins('queue_request_added', request);
    log.info({ position, queueDepth: queue.size, requestId: id }, 'call_lifecycle.queue_join');

    return {
        success: true,
        requestId: id,
        position,
        request,
        message: 'Request added to queue'
    };
}

async function cancelRequest(requestId: string): Promise<{ success: boolean; message?: string }> {
    const request = queue.get(requestId);

    if (request) {
        queue.delete(requestId);
        matchingLocks.delete(requestId);
        await withRetry(() => db.expireVriInvitesForQueue(requestId));
        await withRetry(() => db.removeFromQueue(requestId));
        reorderQueue();

        notifyAdmins('queue_request_cancelled', { requestId });

        return { success: true };
    }

    return { success: false, message: 'Request not found' };
}

async function cancelRequestsForClient(clientId: string | null | undefined): Promise<{ success: boolean; cancelled: number }> {
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

function interpreterAvailable(interpreterId: string, interpreterName: string, languages: string[] = ['ASL'], serviceModes: Array<'vri' | 'vrs'> = ['vrs']): { success: boolean } {
    availableInterpreters.set(interpreterId, {
        id: interpreterId,
        name: interpreterName,
        languages,
        serviceModes,
        availableAt: new Date()
    });

    log.info({ interpreterId, interpreterName, languages, serviceModes }, 'queue_interpreter_available');

    return { success: true };
}

function interpreterUnavailable(interpreterId: string): { success: boolean } {
    availableInterpreters.delete(interpreterId);

    log.info({ interpreterId }, 'queue_interpreter_unavailable');

    return { success: true };
}

function updateInterpreterStatus(interpreterId: string, status: string): { success: boolean } {
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

interface QueueStatus {
    paused: boolean;
    queueSize: number;
    activeInterpreters: AvailableInterpreter[];
    pendingRequests: QueueRequestWithWait[];
    totalMatches: number;
}

interface QueueRequestWithWait extends QueueRequest {
    wait_time: string;
}

function getStatus(): QueueStatus {
    return {
        paused,
        queueSize: queue.size,
        activeInterpreters: Array.from(availableInterpreters.values()),
        pendingRequests: getQueue(),
        totalMatches
    };
}

function getQueue(): QueueRequestWithWait[] {
    return Array.from(queue.values()).map(req => ({
        ...req,
        wait_time: calculateWaitTime(req.createdAt)
    }));
}

function pause(): void {
    paused = true;
    notifyAdmins('queue_paused', { timestamp: new Date() });
}

function resume(): void {
    paused = false;
    notifyAdmins('queue_resumed', { timestamp: new Date() });
}

// ============================================
// MATCHING LOGIC
// ============================================

async function tryMatch(): Promise<void> {
    if (paused) return;

    // Get waiting requests from database (with retry)
    const waitingRequests = await withRetry(() => db.getQueueRequests('waiting'));

    if (waitingRequests.length === 0) return;

    // Get available interpreters
    const interpreters = Array.from(availableInterpreters.values());

    if (interpreters.length === 0) {
        log.info({ waitingRequests: waitingRequests.length }, 'queue_no_interpreters_available');
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
                log.error({ err: error, requestId: request.id }, 'call_lifecycle.interpreter_match_failed');
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

function findBestMatch(request: { id: string; language: string; callType?: 'vri' | 'vrs' | null; call_type?: 'vri' | 'vrs' | null; targetPhone?: string | null; target_phone?: string | null }, interpreters: AvailableInterpreter[]): AvailableInterpreter | null {
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
    matching.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());

    return matching[0];
}

interface MatchResult {
    success: boolean;
    callId?: string;
    interpreter?: { id: string; name: string };
    clientId?: string | null;
    clientName?: string;
    roomName?: string;
    targetPhone?: string | null;
    message?: string;
}

async function completeMatch(request: db.QueueRequest | QueueRequest, interpreter: AvailableInterpreter): Promise<MatchResult> {
    const clientId = (request as QueueRequest).clientId ?? (request as db.QueueRequest).client_id ?? null;
    const clientName = (request as QueueRequest).clientName ?? (request as db.QueueRequest).client_name ?? 'Guest';
    const targetPhone = (request as QueueRequest).targetPhone ?? (request as db.QueueRequest).target_phone ?? null;
    const roomName = (request as QueueRequest).roomName ?? (request as db.QueueRequest).room_name;
    const language = (request as QueueRequest).language ?? (request as db.QueueRequest).language;
    const localRequest = queue.get(request.id);

    // Update database (with retry)
    await withRetry(() => db.assignInterpreterToRequest(request.id, interpreter.id));

    // Remove from local queue
    queue.delete(request.id);

    // Create call record (with retry)
    const callType = (request as QueueRequest).callType
        || (request as db.QueueRequest).call_type
        || localRequest?.callType
        || (targetPhone ? 'vrs' : 'vri');
    const callId = await withRetry(() => db.createCall({
        clientId,
        interpreterId: interpreter.id,
        roomName,
        language,
        callType,
    }));

    if (callType === 'vri') {
        await withRetry(() => db.activateVriInvitesForQueue({
            requestId: request.id,
            roomName
        }));
    }

    totalMatches += 1;

    log.info({ callId, callType, clientId, clientName, interpreterId: interpreter.id, interpreterName: interpreter.name, requestId: request.id, roomName }, 'call_lifecycle.room_created');
    log.info({ callId, clientName, interpreterId: interpreter.id, interpreterName: interpreter.name, requestId: request.id, roomName }, 'call_lifecycle.interpreter_match');

    // Notify admins
    notifyAdmins('queue_match_complete', {
        requestId: request.id,
        clientId,
        clientName,
        interpreterId: interpreter.id,
        interpreterName: interpreter.name,
        roomName,
        language,
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

async function assignInterpreter(requestId: string, interpreterId: string): Promise<MatchResult> {
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
        log.error({ err: error, requestId }, 'queue_assign_interpreter_failed');

        return { success: false, message: 'Failed to complete assignment' };
    } finally {
        matchingLocks.delete(requestId);
    }
}

function getRequest(requestId: string): QueueRequest | undefined {
    return queue.get(requestId);
}

function getPendingRequests(): QueueRequest[] {
    return Array.from(queue.values());
}

async function removeFromQueue(requestId: string): Promise<{ success: boolean; message?: string; removedFromMemory?: boolean }> {
    const request = queue.get(requestId);

    if (request) {
        return cancelRequest(requestId);
    }

    matchingLocks.delete(requestId);
    await withRetry(() => db.expireVriInvitesForQueue(requestId));
    await withRetry(() => db.removeFromQueue(requestId));
    await withRetry(() => db.reorderQueue());
    reorderQueue();

    notifyAdmins('queue_request_removed', { requestId });

    return { success: true, removedFromMemory: false };
}

// ============================================
// HELPERS
// ============================================

function reorderQueue(): void {
    const requests = Array.from(queue.values())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    requests.forEach((req, index) => {
        req.position = index + 1;
    });
}

function calculateWaitTime(createdAt: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000);

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

type BroadcastFn = ((type: string, data: unknown) => void) | undefined;

// Admin notifications (would broadcast via WebSocket)
let _broadcastToAdmins: BroadcastFn;

function notifyAdmins(type: string, data: unknown): void {
    if (_broadcastToAdmins) {
        _broadcastToAdmins(type, data);
    }
}

// ============================================
// EXPORT
// ============================================

const queueServiceExports = {
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
    tryMatch,
    set broadcastToAdmins(fn: BroadcastFn) {
        _broadcastToAdmins = fn;
    },
    get broadcastToAdmins(): BroadcastFn {
        return _broadcastToAdmins;
    }
};

export default queueServiceExports;
