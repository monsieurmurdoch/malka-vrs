/**
 * WebSocket message handler.
 *
 * Handles all WebSocket message types: auth, queue, handoff, P2P, admin.
 * Uses shared state from lib/state.js for connection maps.
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const activityLogger = require('../lib/activity-logger');
const queueService = require('../lib/queue-service');
const handoffService = require('../lib/handoff-service');
const voicemailService = require('../dist/lib/voicemail-service');
const ttsService = require('../lib/tts-service');
const state = require('../lib/state');
const { verifyJwtToken, normalizeAuthClaims, tokenMatchesRequestedRole } = require('../lib/auth');
const log = require('../lib/logger').module('ws');
const { validatePayload } = require('../lib/validation');
const { messageSchemas } = require('./schemas');

// Friendly room name adjectives/nouns used so the Jitsi header shows something
// human-readable instead of a raw UUID (e.g. "vrs-amber-bridge-4712").
const ROOM_ADJECTIVES = ['amber', 'azure', 'cedar', 'coral', 'delta', 'ember',
    'fern', 'jade', 'maple', 'ocean', 'pearl', 'river', 'sage', 'slate', 'solar'];
const ROOM_NOUNS = ['arc', 'bay', 'bridge', 'cove', 'dale', 'glen', 'grove',
    'hill', 'isle', 'lake', 'mesa', 'path', 'peak', 'pond', 'vale'];

function generateFriendlyRoomName() {
    const adj  = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)];
    const noun = ROOM_NOUNS[Math.floor(Math.random() * ROOM_NOUNS.length)];
    const num  = String(Math.floor(Math.random() * 9000) + 1000); // 4-digit
    return `vrs-${adj}-${noun}-${num}`;
}

function sanitizePhoneNumber(raw) {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) return null;
    return cleaned;
}

function sendWsMessage(ws, type, data = {}) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, data }));
    }
}

function sendWsError(ws, message, code = 'BAD_REQUEST', type = 'error', details) {
    const data = { message, code };
    if (details) {
        data.details = details;
    }

    sendWsMessage(ws, type, data);
}

function requireAuthenticatedRole(ws, roles, message = 'Authentication required.') {
    const client = ws.clientInfo;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!client || !client.authenticated || (allowedRoles[0] && !allowedRoles.includes(client.role))) {
        sendWsError(ws, message, 'AUTH_REQUIRED');
        return null;
    }
    return client;
}

function requireOwnedUserId(ws, providedUserId, actionLabel) {
    const client = requireAuthenticatedRole(ws, 'client', 'Client authentication required.');
    if (!client) {
        return null;
    }

    if (!providedUserId) {
        sendWsError(ws, `${actionLabel} requires userId`, 'VALIDATION_ERROR');
        return null;
    }

    if (String(providedUserId) !== String(client.userId)) {
        sendWsError(ws, 'You can only manage your own session.', 'FORBIDDEN');
        return null;
    }

    return client;
}

// ============================================
// CONNECTION HANDLER
// ============================================

function handleConnection(ws, req) {
    const clientId = uuidv4();
    log.info({ clientId }, 'WebSocket client connected');

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            sendWsError(ws, 'Invalid JSON payload.', 'INVALID_JSON');
            return;
        }

        try {
            // Validate message payload against Zod schemas
            const schema = messageSchemas[data.type];
            if (schema) {
                const payload = data.data || data;
                const result = validatePayload(schema, payload);
                if (!result.success) {
                    sendWsMessage(ws, 'validation_error', result.error);
                    return;
                }
                // Replace data with sanitized/parsed version
                data.data = result.data;
            }

            switch (data.type) {
                case 'auth':
                    handleAuth(ws, data, clientId);
                    break;

                case 'interpreter_status':
                    handleInterpreterStatus(ws, data);
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
                    handleAdminSubscribe(ws, data);
                    break;

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

                case 'p2p_call':
                    await handleP2PCall(ws, data);
                    break;

                case 'p2p_accept':
                    await handleP2PAccept(ws, data);
                    break;

                case 'p2p_decline':
                    await handleP2PDecline(ws, data);
                    break;

                case 'p2p_cancel':
                    await handleP2PCancel(ws, data);
                    break;

                case 'p2p_end':
                    await handleP2PEnd(ws, data);
                    break;

                case 'voicemail_start':
                    await handleVoicemailStart(ws, data);
                    break;

                case 'voicemail_cancel':
                    await handleVoicemailCancel(ws, data);
                    break;

                case 'voicemail_delete':
                    await handleVoicemailDelete(ws, data);
                    break;

                case 'voicemail_mark_seen':
                    await handleVoicemailMarkSeen(ws, data);
                    break;

                // Call Management & UX
                case 'call_waiting_respond':
                    await handleCallWaitingRespond(ws, data);
                    break;

                case 'call_transfer':
                    await handleCallTransfer(ws, data);
                    break;

                case 'call_transfer_accept':
                    await handleCallTransferAccept(ws, data);
                    break;

                case 'call_transfer_cancel':
                    await handleCallTransferCancel(ws, data);
                    break;

                case 'call_hold':
                    await handleCallHold(ws, data);
                    break;

                case 'conference_add':
                    await handleConferenceAdd(ws, data);
                    break;

                case 'conference_remove':
                    await handleConferenceRemove(ws, data);
                    break;

                case 'chat_send':
                    await handleChatSend(ws, data);
                    break;

                case 'chat_history':
                    await handleChatHistory(ws, data);
                    break;

                case 'preferences_update':
                    await handlePreferencesUpdate(ws, data);
                    break;

                // TTS / VCO
                case 'vco_start':
                    await handleVCOStart(ws, data);
                    break;

                case 'vco_end':
                    await handleVCOEnd(ws, data);
                    break;

                case 'tts_speak':
                    await handleTTSSpeak(ws, data);
                    break;

                case 'tts_quick_speak':
                    await handleTTSQuickSpeak(ws, data);
                    break;

                case 'heartbeat':
                    // Client keepalive from InterpreterQueueService (sent every
                    // 15s). The client's message handler treats 'heartbeat_ack'
                    // as a no-op, so responding keeps the socket warm without
                    // further client-side work. ('ping' is handled separately
                    // above.)
                    try {
                        ws.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
                    } catch (e) { /* socket closed — ignore */ }
                    break;

                default:
                    sendWsError(ws, `Unsupported message type: ${String(data.type || 'unknown')}`, 'UNSUPPORTED_MESSAGE');
                    break;
            }
        } catch (error) {
            log.error({ err: error, clientId }, 'WebSocket error');
            sendWsError(ws, 'WebSocket request failed.', 'INTERNAL_ERROR');
        }
    });

    ws.on('close', () => {
        log.info({ clientId }, 'WebSocket client disconnected');
        if (ws.clientInfo) {
            handleDisconnect(ws.clientInfo);
        }
    });

    ws.on('error', (error) => {
        log.error({ err: error }, 'WebSocket error');
    });

    ws.send(JSON.stringify({ type: 'connected', clientId, timestamp: Date.now() }));
}

// ============================================
// AUTH
// ============================================

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
                clientId, role,
                userId: claims.id || userId,
                name: claims.name || name,
                email: claims.email,
                ws, authenticated: true
            };
        } catch (error) {
            ws.send(JSON.stringify({ type: 'auth_error', data: { message: 'Invalid token' } }));
            return null;
        }
    } else {
        clientInfo = { clientId, role, userId, name, ws, authenticated: false };
    }

    if (role === 'interpreter') {
        state.clients.interpreters.set(clientId, clientInfo);
        clientInfo.status = 'offline';
        clientInfo.currentCall = null;

        state.broadcastToAdmins({
            type: 'interpreter_connected',
            data: { id: clientInfo.userId, name: clientInfo.name, status: 'offline', timestamp: Date.now() }
        });

        activityLogger.log('interpreter_online', { interpreterId: clientInfo.userId, interpreterName: clientInfo.name });

    } else if (role === 'client') {
        state.clients.clients.set(clientId, clientInfo);

        activityLogger.log('client_connected', { clientId: clientInfo.userId, clientName: clientInfo.name });

        if (clientInfo.authenticated) {
            db.getMissedCalls(clientInfo.userId).then(missed => {
                if (missed && missed.length > 0) {
                    ws.send(JSON.stringify({ type: 'missed_calls', data: missed }));
                }
            }).catch(err => {
                log.error({ err }, 'Failed to deliver missed calls');
            });

            // Send voicemail unread count on connect
            voicemailService.getUnreadCount(clientInfo.userId).then(count => {
                if (count > 0) {
                    ws.send(JSON.stringify({ type: 'voicemail_unread_count', data: { count } }));
                }
            }).catch(err => {
                log.error({ err }, 'Failed to deliver voicemail unread count');
            });

            // Send client preferences on connect
            db.getClientPreferences(clientInfo.userId).then(prefs => {
                ws.send(JSON.stringify({ type: 'preferences_updated', data: prefs }));
            }).catch(err => {
                log.error({ err }, 'Failed to deliver client preferences');
            });
        }

    } else if (role === 'admin') {
        state.clients.admins.set(clientId, clientInfo);
        sendAdminDashboard(ws);
    }

    ws.clientInfo = clientInfo;

    ws.send(JSON.stringify({ type: 'auth_success', role, clientId }));
    sendQueueStatus(ws);

    return clientInfo;
}

function coerceInterpreterStatus(payload = {}) {
    if (typeof payload.status === 'string' && payload.status.trim()) {
        return payload.status.trim().toLowerCase();
    }

    if (payload.available === true) {
        return 'available';
    }

    if (payload.available === false) {
        return 'offline';
    }

    return null;
}

// ============================================
// INTERPRETER STATUS
// ============================================

async function handleInterpreterStatus(ws, data) {
    const wsClient = ws.clientInfo;
    if (!wsClient || !wsClient.authenticated) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Authentication required.' } }));
        return;
    }

    const payload = data.data || data;
    const status = coerceInterpreterStatus(payload);
    const { languages } = payload;

    if (!status) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'interpreter_status requires a valid status.' }
        }));
        return;
    }

    for (const [, entry] of state.clients.interpreters) {
        if (entry.ws === ws) {
            entry.status = status;
            entry.languages = languages || entry.languages;
            if (!entry.serviceModes) {
                const interpreter = await db.getInterpreter(entry.userId).catch(() => null);
                entry.serviceModes = interpreter?.service_modes || ['vrs'];
            }

            state.broadcastToAdmins({
                type: 'interpreter_status_changed',
                data: { id: entry.userId, name: entry.name, status, languages: entry.languages, serviceModes: entry.serviceModes, timestamp: Date.now() }
            });

            activityLogger.log('interpreter_status_change', {
                interpreterId: entry.userId, interpreterName: entry.name, status
            });

            if (status === 'online' || status === 'available' || status === 'active') {
                queueService.interpreterAvailable(entry.userId, entry.name, entry.languages, entry.serviceModes);
                notifyInterpreterOfPendingRequests(ws);
            } else if (status === 'offline' || status === 'busy' || status === 'inactive') {
                queueService.interpreterUnavailable(entry.userId);
            }

            ws.send(JSON.stringify({ type: 'status_updated', status }));
            state.broadcastQueueStatus(queueService);
            break;
        }
    }
}

// ============================================
// QUEUE REQUESTS
// ============================================

async function handleInterpreterRequest(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Client authentication required before requesting an interpreter.' } }));
        return;
    }

    const payload = data.data || {};
    const targetPhone = sanitizePhoneNumber(payload.targetPhone);
    if (payload.targetPhone && !targetPhone) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'A valid hearing-party phone number is required.' }
        }));
        return;
    }
    const callType = targetPhone ? 'vrs' : 'vri';
    const clientRecord = await db.getClient(client.userId).catch(() => null);
    const clientModes = clientRecord?.service_modes || client.serviceModes || ['vrs'];
    if (!clientModes.includes(callType)) {
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: callType === 'vrs' ? 'This account is not enabled for VRS phone calls.' : 'This account is not enabled for VRI sessions.' }
        }));
        return;
    }

    const result = await queueService.requestInterpreter({
        clientId: client.userId,
        clientName: payload.clientName || client.name || 'Guest',
        language: payload.language || 'ASL',
        targetPhone,
        callType,
        roomName: payload.roomName || generateFriendlyRoomName()
    });

    if (!result.success) {
        ws.send(JSON.stringify({ type: 'error', data: { message: result.message } }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'request_queued',
        data: {
            requestId: result.requestId,
            position: result.position,
            roomName: result.request.roomName,
            language: result.request.language,
            targetPhone: result.request.targetPhone || null
        }
    }));

    notifyAvailableInterpreters(result.request);
    state.broadcastQueueStatus(queueService);
}

async function handleCancelRequest(ws, data) {
    const client = requireAuthenticatedRole(ws, 'client', 'Client authentication required before cancelling requests.');
    if (!client) return;

    const payload = data.data || {};
    const requestId = payload.requestId;
    if (!requestId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'requestId is required to cancel a queue request.' } }));
        return;
    }

    const request = queueService.getRequest(requestId);
    if (!request) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Queue request not found.' } }));
        return;
    }

    if (String(request.clientId) !== String(client.userId)) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'You can only cancel your own queue requests.' } }));
        return;
    }

    const result = await queueService.cancelRequest(requestId);
    ws.send(JSON.stringify({ type: 'request_cancelled', data: { requestId, success: result.success } }));
    state.broadcastQueueStatus(queueService);
}

async function handleAcceptRequest(ws, data) {
    const interpreter = ws.clientInfo;
    const payload = data.data || {};
    const requestId = payload.requestId;

    if (!interpreter || interpreter.role !== 'interpreter' || !interpreter.authenticated) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Interpreter authentication required before accepting requests.' } }));
        return;
    }

    const request = queueService.getRequest(requestId);
    if (!request) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Queue request not found or already assigned.' } }));
        return;
    }

    const result = await queueService.assignInterpreter(requestId, interpreter.userId);
    if (!result.success) {
        ws.send(JSON.stringify({ type: 'error', data: { message: result.message || 'Unable to accept queue request.' } }));
        return;
    }

    interpreter.status = 'busy';
    queueService.interpreterUnavailable(interpreter.userId);

    const meetingData = {
        callId: result.callId, requestId,
        roomName: result.roomName,
        clientId: result.clientId, clientName: result.clientName,
        interpreterId: interpreter.userId, interpreterName: interpreter.name,
        language: request.language,
        targetPhone: request.targetPhone || null
    };

    ws.send(JSON.stringify({ type: 'request_accepted', data: meetingData }));
    ws.send(JSON.stringify({ type: 'meeting_initiated', data: meetingData }));

    const clientSocket = state.findClientSocketByUserId(result.clientId);
    if (clientSocket) {
        clientSocket.send(JSON.stringify({ type: 'match_found', data: meetingData }));
        clientSocket.send(JSON.stringify({ type: 'meeting_initiated', data: meetingData }));
    }

    log.info({ requestId, clientId: result.clientId, interpreterId: interpreter.userId }, 'Interpreter matched to request');

    log.info({ callId: result.callId, clientId: result.clientId, interpreterId: interpreter.userId, roomName: result.roomName }, 'Call started');

    state.broadcastQueueStatus(queueService);
}

function handleDeclineRequest(ws, data) {
    const interpreter = requireAuthenticatedRole(ws, 'interpreter', 'Interpreter authentication required before declining requests.');
    if (!interpreter) return;

    const payload = data.data || {};
    ws.send(JSON.stringify({
        type: 'request_declined',
        data: { requestId: payload.requestId, declinedBy: interpreter.userId }
    }));
}

// ============================================
// DISCONNECT
// ============================================

function handleDisconnect(clientInfo) {
    const { clientId, role, userId, name } = clientInfo;

    if (role === 'interpreter') {
        state.clients.interpreters.delete(clientId);
        queueService.interpreterUnavailable(userId);

        state.broadcastToAdmins({
            type: 'interpreter_disconnected',
            data: { id: userId, name, timestamp: Date.now() }
        });

        activityLogger.log('interpreter_offline', { interpreterId: userId, interpreterName: name });

    } else if (role === 'client') {
        state.clients.clients.delete(clientId);
        activityLogger.log('client_disconnected', { clientId: userId, clientName: name });

    } else if (role === 'admin') {
        state.clients.admins.delete(clientId);
    }

    state.broadcastQueueStatus(queueService);
}

// ============================================
// ADMIN
// ============================================

function handleAdminSubscribe(ws, data) {
    const client = ws.clientInfo;
    if (!client || !client.authenticated || client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Admin authentication required.' } }));
        return;
    }
    sendAdminDashboard(ws);
}

function sendQueueStatus(ws) {
    ws.send(JSON.stringify({ type: 'queue_status', data: queueService.getStatus() }));
}

function sendAdminDashboard(ws) {
    db.getDashboardStats().then(stats => {
        ws.send(JSON.stringify({ type: 'dashboard_data', data: stats }));
    });

    const interpretersList = Array.from(state.clients.interpreters.values()).map(i => ({
        id: i.userId, name: i.name, status: i.status, languages: i.languages || [], connected: true
    }));

    ws.send(JSON.stringify({ type: 'interpreters_list', data: interpretersList }));
    ws.send(JSON.stringify({ type: 'queue_update', data: queueService.getQueue() }));
}

// ============================================
// HANDOFF WEBSOCKET HANDLERS
// ============================================

function handleSessionRegister(ws, data) {
    const { userId, roomName, deviceId } = data.data || data;
    const client = requireOwnedUserId(ws, userId, 'session_register');
    if (!client) return;

    if (!roomName || !deviceId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'session_register requires userId, roomName, deviceId' } }));
        return;
    }

    handoffService.registerSession(client.userId, roomName, deviceId, ws);

    ws.send(JSON.stringify({ type: 'session_registered', data: { userId: client.userId, roomName, deviceId } }));
    activityLogger.log('session_registered', { userId: client.userId, roomName, deviceId });
}

function handleSessionUnregister(ws, data) {
    const { userId } = data.data || data;
    const client = requireOwnedUserId(ws, userId, 'session_unregister');
    if (!client) return;

    handoffService.unregisterSession(client.userId);
    ws.send(JSON.stringify({ type: 'session_unregistered', data: { userId: client.userId } }));
    activityLogger.log('session_unregistered', { userId: client.userId });
}

async function handleHandoffPrepare(ws, data) {
    const { userId, targetDeviceId } = data.data || data;
    const client = requireOwnedUserId(ws, userId, 'handoff_prepare');
    if (!client) return;

    if (!targetDeviceId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'handoff_prepare requires userId and targetDeviceId' } }));
        return;
    }

    const result = handoffService.prepareHandoff(client.userId, targetDeviceId);
    if (result.error) {
        ws.send(JSON.stringify({ type: 'handoff_error', data: { message: result.error } }));
        return;
    }

    ws.send(JSON.stringify({ type: 'handoff_prepared', data: { token: result.token, roomName: result.roomName } }));

    const session = handoffService.getActiveSession(client.userId);
    if (session && session.interpreterId) {
        const interpreterWs = state.findInterpreterSocketByUserId(session.interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({
                type: 'handoff_in_progress',
                data: { userId: client.userId, roomName: session.roomName, estimatedDuration: '2s' }
            }));
        }
    }

    activityLogger.log('handoff_prepared', { userId: client.userId, targetDeviceId, roomName: result.roomName });
}

function handleHandoffReady(ws, data) {
    const client = requireAuthenticatedRole(ws, 'client', 'Client authentication required.');
    if (!client) return;

    const { token, newDeviceId } = data.data || data;
    if (!token || !newDeviceId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'handoff_ready requires token and newDeviceId' } }));
        return;
    }

    const pendingHandoff = handoffService.getHandoffByToken(token);
    if (!pendingHandoff) {
        ws.send(JSON.stringify({ type: 'handoff_error', data: { message: 'Invalid or expired handoff token' } }));
        return;
    }

    if (String(pendingHandoff.userId) !== String(client.userId)) {
        ws.send(JSON.stringify({ type: 'handoff_error', data: { message: 'You can only complete your own handoff.' } }));
        return;
    }

    const result = handoffService.executeHandoff(token, newDeviceId);
    if (result.error) {
        ws.send(JSON.stringify({ type: 'handoff_error', data: { message: result.error } }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'handoff_executed',
        data: { roomName: result.roomName, interpreterId: result.interpreterId, userId: result.userId, fromDeviceId: result.fromDeviceId }
    }));

    const session = handoffService.getActiveSession(result.userId);
    if (session && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: 'handoff_consumed', data: { newDeviceId, roomName: result.roomName } }));
    }

    activityLogger.log('handoff_ready', { userId: result.userId, newDeviceId });
}

function handleHandoffComplete(ws, data) {
    const { userId } = data.data || data;
    const client = requireOwnedUserId(ws, userId, 'handoff_complete');
    if (!client) return;

    handoffService.unregisterSession(client.userId);

    const { interpreterId } = data.data || {};
    if (interpreterId) {
        const interpreterWs = state.findInterpreterSocketByUserId(interpreterId);
        if (interpreterWs) {
            interpreterWs.send(JSON.stringify({ type: 'handoff_complete', data: { userId: client.userId } }));
        }
    }

    ws.send(JSON.stringify({ type: 'handoff_completed', data: { userId: client.userId } }));
    activityLogger.log('handoff_completed', { userId: client.userId });
}

function handleHandoffCancel(ws, data) {
    const { userId } = data.data || data;
    const client = requireOwnedUserId(ws, userId, 'handoff_cancel');
    if (!client) return;

    handoffService.cancelHandoff(client.userId);
    ws.send(JSON.stringify({ type: 'handoff_cancelled', data: { userId: client.userId } }));
    activityLogger.log('handoff_cancelled', { userId: client.userId });
}

// ============================================
// P2P CLIENT-TO-CLIENT
// ============================================

async function handleP2PCall(ws, data) {
    const caller = ws.clientInfo;
    const payload = data.data || {};

    if (!caller || caller.role !== 'client' || !caller.authenticated) {
        ws.send(JSON.stringify({ type: 'p2p_call_failed', data: { message: 'Authenticated client required.' } }));
        return;
    }

    const phoneNumber = sanitizePhoneNumber(payload.phoneNumber);
    if (!phoneNumber) {
        ws.send(JSON.stringify({ type: 'p2p_call_failed', data: { message: 'Invalid phone number.' } }));
        return;
    }

    try {
        const callee = await db.getClientByPhoneNumber(phoneNumber);
        if (!callee) {
            ws.send(JSON.stringify({ type: 'p2p_call_failed', data: { message: 'No client found with that phone number.' } }));
            return;
        }

        if (callee.id === caller.userId) {
            ws.send(JSON.stringify({ type: 'p2p_call_failed', data: { message: 'You cannot call your own number.' } }));
            return;
        }

        const roomName = 'p2p-' + uuidv4().substring(0, 8);
        const calleeWs = state.findClientSocketByUserId(callee.id);

        // Check Do Not Disturb
        const isDND = await db.isClientDND(callee.id);
        if (isDND) {
            // Route to voicemail instead of ringing
            ws.send(JSON.stringify({
                type: 'p2p_target_dnd',
                data: { calleeName: callee.name, calleePhone: phoneNumber, calleeId: callee.id, voicemailAvailable: true }
            }));

            activityLogger.log('p2p_call_dnd', { callerId: caller.userId, calleeId: callee.id, calleePhone: phoneNumber });
            return;
        }

        if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
            const callId = await db.createP2PCall({ callerId: caller.userId, calleeId: callee.id, roomName });

            caller.currentP2PCall = { callId, roomName, calleeId: callee.id, calleeName: callee.name };

            log.info({ callId, clientId: caller.userId, interpreterId: callee.id, roomName }, 'Call started');

            // Check if callee is already on a call (call waiting scenario)
            const calleeActiveCall = await db.getActiveCallForClient(callee.id);

            ws.send(JSON.stringify({
                type: 'p2p_ringing',
                data: { callId, roomName, calleeName: callee.name, calleePhone: phoneNumber }
            }));

            if (calleeActiveCall && calleeActiveCall.id !== callId) {
                // Callee is on another call — send call waiting notification
                calleeWs.send(JSON.stringify({
                    type: 'p2p_incoming_call_waiting',
                    data: {
                        callId,
                        roomName,
                        callerName: caller.name,
                        callerId: caller.userId,
                        calleeId: callee.id,
                        currentCallId: calleeActiveCall.id
                    }
                }));
            } else {
                calleeWs.send(JSON.stringify({
                    type: 'p2p_incoming_call',
                    data: { callId, roomName, callerName: caller.name, callerId: caller.userId, calleeId: callee.id }
                }));
            }

            activityLogger.log('p2p_call_ringing', { callerId: caller.userId, calleeId: callee.id, roomName });
        } else {
            await db.createMissedCall({ callerId: caller.userId, calleePhone: phoneNumber, calleeClientId: callee.id, roomName });

            ws.send(JSON.stringify({
                type: 'p2p_target_offline',
                data: { calleeName: callee.name, calleePhone: phoneNumber, calleeId: callee.id, voicemailAvailable: true }
            }));

            activityLogger.log('p2p_call_missed', { callerId: caller.userId, calleeId: callee.id, calleePhone: phoneNumber });
        }
    } catch (error) {
        log.error({ err: error }, 'P2P call error');
        ws.send(JSON.stringify({ type: 'p2p_call_failed', data: { message: 'Failed to place call.' } }));
    }
}

async function handleP2PAccept(ws, data) {
    const callee = ws.clientInfo;
    const payload = data.data || {};

    if (!callee || callee.role !== 'client' || !callee.authenticated) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Client authentication required.' } }));
        return;
    }

    const { callId, roomName, callerId } = payload;
    if (!callId || !roomName || !callerId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Missing call parameters.' } }));
        return;
    }

    const callerWs = state.findClientSocketByUserId(callerId);
    if (callerWs && callerWs.readyState === WebSocket.OPEN) {
        callerWs.send(JSON.stringify({
            type: 'p2p_accepted',
            data: { callId, roomName, calleeName: callee.name, calleeId: callee.userId }
        }));
    }

    ws.send(JSON.stringify({
        type: 'p2p_join_room',
        data: { callId, roomName, callerName: payload.callerName || 'Unknown', callerId }
    }));

    activityLogger.log('p2p_call_accepted', { callId, callerId, calleeId: callee.userId, roomName });
}

async function handleP2PDecline(ws, data) {
    const callee = ws.clientInfo;
    const payload = data.data || {};

    if (!callee || callee.role !== 'client' || !callee.authenticated) return;

    const { callId, callerId } = payload;
    if (!callerId) return;

    const callerWs = state.findClientSocketByUserId(callerId);
    if (callerWs && callerWs.readyState === WebSocket.OPEN) {
        callerWs.send(JSON.stringify({ type: 'p2p_declined', data: { callId, calleeName: callee.name, calleeId: callee.userId } }));
    }

    activityLogger.log('p2p_call_declined', { callId, callerId, calleeId: callee.userId });
}

async function handleP2PCancel(ws, data) {
    const caller = ws.clientInfo;
    const payload = data.data || {};

    if (!caller || caller.role !== 'client' || !caller.authenticated) return;

    const { callId, calleeId } = payload;
    if (!calleeId) return;

    const calleeWs = state.findClientSocketByUserId(calleeId);
    if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
        calleeWs.send(JSON.stringify({ type: 'p2p_call_cancelled', data: { callId, callerName: caller.name } }));
    }

    activityLogger.log('p2p_call_cancelled', { callId, callerId: caller.userId, calleeId });
}

async function handleP2PEnd(ws, data) {
    const client = ws.clientInfo;
    const payload = data.data || {};

    if (!client || client.role !== 'client' || !client.authenticated) return;

    const { callId, roomName, otherId } = payload;
    if (!callId || !otherId) return;

    try {
        await db.endCall(callId, payload.durationMinutes || 0);
    } catch (err) {
        log.error({ err }, 'P2P end call error');
    }

    // Create billing CDR (best-effort, non-blocking)
    try {
        const call = await db.getCall(callId);
        if (call && call.status === 'completed') {
            const { createCdr } = require('../dist/billing/cdr-service');
            await createCdr({
                callId: call.id,
                callType: call.call_type || 'vrs',
                callerId: call.client_id,
                interpreterId: call.interpreter_id,
                startTime: new Date(call.started_at),
                endTime: call.ended_at ? new Date(call.ended_at) : new Date(),
                durationSeconds: (call.duration_minutes || 0) * 60,
                language: call.language,
            });
        }
    } catch (cdrErr) {
        // Non-fatal: CDR creation failure should not disrupt call flow
        log.warn({ err: cdrErr, callId }, 'Billing CDR creation failed (non-fatal)');
    }

    const durationMs = (payload.durationMinutes || 0) * 60 * 1000;
    log.info({ callId, durationMs }, 'Call ended');

    const otherWs = state.findClientSocketByUserId(otherId);
    if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        otherWs.send(JSON.stringify({ type: 'p2p_call_ended', data: { callId, roomName, endedBy: client.name } }));
    }

    activityLogger.log('p2p_call_ended', { callId, roomName, endedBy: client.userId });
}

// ============================================
// HELPERS
// ============================================

function notifyAvailableInterpreters(request) {
    const msg = JSON.stringify({ type: 'interpreter_request', data: request });
    for (const client of state.clients.interpreters.values()) {
        if (client.ws.readyState === WebSocket.OPEN
            && (client.status === 'available' || client.status === 'online' || client.status === 'active')) {
            client.ws.send(msg);
        }
    }
}

function notifyInterpreterOfPendingRequests(ws) {
    queueService.getQueue().forEach(request => {
        ws.send(JSON.stringify({ type: 'interpreter_request', data: request }));
    });
}

// ============================================
// VOICEMAIL HANDLERS
// ============================================

async function handleVoicemailStart(ws, data) {
    const caller = ws.clientInfo;
    if (!caller || caller.role !== 'client') {
        return ws.send(JSON.stringify({ type: 'voicemail_error', data: { message: 'Authentication required' } }));
    }

    const payload = data.data || {};
    const calleePhone = payload.calleePhone;

    try {
        let calleeId = null;
        if (calleePhone) {
            const callee = await db.getClientByPhoneNumber(calleePhone);
            if (callee) {
                calleeId = callee.id;
            }
        }

        const result = await voicemailService.startRecording(caller.userId, calleeId, calleePhone || null);
        ws.send(JSON.stringify({ type: 'voicemail_recording_started', data: result }));
    } catch (error) {
        ws.send(JSON.stringify({ type: 'voicemail_error', data: { message: error.message } }));
    }
}

async function handleVoicemailCancel(ws, data) {
    const caller = ws.clientInfo;
    if (!caller || caller.role !== 'client') return;

    const payload = data.data || {};
    try {
        await voicemailService.cancelRecording(payload.messageId, caller.userId);
        ws.send(JSON.stringify({ type: 'voicemail_recording_cancelled', data: { messageId: payload.messageId } }));
    } catch (error) {
        ws.send(JSON.stringify({ type: 'voicemail_error', data: { message: error.message } }));
    }
}

async function handleVoicemailDelete(ws, data) {
    const user = ws.clientInfo;
    if (!user || user.role !== 'client') return;

    const payload = data.data || {};
    try {
        await voicemailService.deleteMessage(payload.messageId, user.userId);
        ws.send(JSON.stringify({ type: 'voicemail_message_deleted', data: { messageId: payload.messageId } }));
    } catch (error) {
        ws.send(JSON.stringify({ type: 'voicemail_error', data: { message: error.message } }));
    }
}

async function handleVoicemailMarkSeen(ws, data) {
    const user = ws.clientInfo;
    if (!user || user.role !== 'client') return;

    const payload = data.data || {};
    try {
        await voicemailService.markMessageSeen(payload.messageId, user.userId);
    } catch (error) {
        // Silently ignore — seen status is non-critical
    }
}

// ============================================
// CALL WAITING HANDLERS
// ============================================

async function handleCallWaitingRespond(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const { incomingCallId, currentCallId, action } = data.data || data;

    if (action === 'reject') {
        // Reject incoming call — treat as declined
        const incomingCall = await db.getCall(incomingCallId);
        if (incomingCall) {
            const otherId = incomingCall.client_id === client.userId
                ? incomingCall.callee_id
                : incomingCall.client_id;
            const otherWs = state.findClientSocketByUserId(otherId);
            if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(JSON.stringify({
                    type: 'p2p_declined',
                    data: { callId: incomingCallId, calleeName: client.name, calleeId: client.userId }
                }));
            }
        }
        ws.send(JSON.stringify({ type: 'call_waiting_responded', data: { action: 'rejected', callId: incomingCallId } }));
        activityLogger.log('call_waiting_rejected', { clientId: client.userId, incomingCallId });
        return;
    }

    if (action === 'hold_and_accept') {
        // Put current call on hold, then accept incoming
        await db.setCallOnHold(currentCallId, true);

        // Notify the other party on the current call
        const currentCall = await db.getCall(currentCallId);
        if (currentCall) {
            const otherId = currentCall.client_id === client.userId
                ? currentCall.callee_id || currentCall.interpreter_id
                : currentCall.client_id;
            const otherWs = state.findClientSocketByUserId(otherId);
            if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(JSON.stringify({
                    type: 'call_on_hold',
                    data: { callId: currentCallId, heldBy: client.name }
                }));
            }
        }
    }

    // Accept the incoming call (works for both 'accept' and 'hold_and_accept')
    const incomingCall = await db.getCall(incomingCallId);
    if (!incomingCall) {
        return sendWsError(ws, 'Incoming call not found.', 'NOT_FOUND');
    }

    const callerId = incomingCall.client_id === client.userId
        ? incomingCall.callee_id
        : incomingCall.client_id;
    const callerWs = state.findClientSocketByUserId(callerId);

    if (callerWs && callerWs.readyState === WebSocket.OPEN) {
        callerWs.send(JSON.stringify({
            type: 'p2p_accepted',
            data: { callId: incomingCallId, roomName: incomingCall.room_name, calleeName: client.name, calleeId: client.userId }
        }));
    }

    ws.send(JSON.stringify({
        type: 'call_waiting_responded',
        data: { action, callId: incomingCallId, roomName: incomingCall.room_name, callerName: callerId }
    }));

    ws.send(JSON.stringify({
        type: 'p2p_join_room',
        data: { callId: incomingCallId, roomName: incomingCall.room_name, callerId }
    }));

    activityLogger.log('call_waiting_accepted', { clientId: client.userId, incomingCallId, currentCallId, action });
}

// ============================================
// CALL TRANSFER HANDLERS
// ============================================

async function handleCallTransfer(ws, data) {
    const interpreter = ws.clientInfo;
    if (!interpreter || interpreter.role !== 'interpreter' || !interpreter.authenticated) {
        return sendWsError(ws, 'Interpreter authentication required.', 'AUTH_REQUIRED');
    }

    const payload = data.data || data;
    const { callId, toPhoneNumber, toInterpreterId, transferType, reason } = payload;

    const call = await db.getCall(callId);
    if (!call) {
        return sendWsError(ws, 'Call not found.', 'NOT_FOUND');
    }

    const transfer = await db.createCallTransfer({
        callId,
        fromInterpreterId: interpreter.userId,
        toPhoneNumber: toPhoneNumber || null,
        toInterpreterId: toInterpreterId || null,
        transferType: transferType || 'blind',
        reason: reason || null
    });

    // Notify admin dashboard
    notifyAdmins('call_transfer_initiated', {
        transferId: transfer.id,
        callId,
        fromInterpreterId: interpreter.userId,
        fromInterpreterName: interpreter.name,
        toPhoneNumber: toPhoneNumber || null,
        toInterpreterId: toInterpreterId || null,
        transferType: transferType || 'blind'
    });

    // Notify the client on the call
    const clientWs = state.findClientSocketByUserId(call.client_id);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
            type: 'call_transfer_initiated',
            data: {
                transferId: transfer.id,
                callId,
                transferType: transferType || 'blind',
                toPhoneNumber: toPhoneNumber || null,
                interpreterName: interpreter.name
            }
        }));
    }

    ws.send(JSON.stringify({
        type: 'call_transfer_pending',
        data: { transferId: transfer.id, callId }
    }));

    activityLogger.log('call_transfer_initiated', {
        transferId: transfer.id, callId,
        fromInterpreterId: interpreter.userId,
        toPhoneNumber: toPhoneNumber || null,
        toInterpreterId: toInterpreterId || null,
        transferType: transferType || 'blind'
    });
}

async function handleCallTransferAccept(ws, data) {
    const interpreter = ws.clientInfo;
    if (!interpreter || interpreter.role !== 'interpreter' || !interpreter.authenticated) {
        return sendWsError(ws, 'Interpreter authentication required.', 'AUTH_REQUIRED');
    }

    const { transferId } = data.data || data;
    await db.updateCallTransferStatus(transferId, 'accepted');

    ws.send(JSON.stringify({
        type: 'call_transfer_accepted',
        data: { transferId }
    }));

    activityLogger.log('call_transfer_accepted', { transferId, interpreterId: interpreter.userId });
}

async function handleCallTransferCancel(ws, data) {
    const { transferId } = data.data || data;
    await db.updateCallTransferStatus(transferId, 'cancelled');

    ws.send(JSON.stringify({
        type: 'call_transfer_cancelled',
        data: { transferId }
    }));

    activityLogger.log('call_transfer_cancelled', { transferId });
}

// ============================================
// CALL HOLD HANDLER
// ============================================

async function handleCallHold(ws, data) {
    const client = ws.clientInfo;
    if (!client || !client.authenticated) {
        return sendWsError(ws, 'Authentication required.', 'AUTH_REQUIRED');
    }

    const { callId, onHold } = data.data || data;
    await db.setCallOnHold(callId, onHold);

    // Notify the other party
    const call = await db.getCall(callId);
    if (call) {
        const otherId = call.client_id === client.userId
            ? (call.callee_id || call.interpreter_id)
            : call.client_id;
        const otherWs = state.findClientSocketByUserId(otherId);
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(JSON.stringify({
                type: onHold ? 'call_on_hold' : 'call_off_hold',
                data: { callId, heldBy: client.name }
            }));
        }
    }

    ws.send(JSON.stringify({
        type: 'call_hold_updated',
        data: { callId, onHold }
    }));

    activityLogger.log(onHold ? 'call_on_hold' : 'call_off_hold', { callId, userId: client.userId });
}

// ============================================
// CONFERENCE (3-WAY) CALL HANDLERS
// ============================================

async function handleConferenceAdd(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const payload = data.data || data;
    const { callId, phoneNumber, clientId: thirdPartyId } = payload;

    let targetClientId = thirdPartyId || null;

    // Resolve phone number to client
    if (phoneNumber && !targetClientId) {
        const target = await db.getClientByPhoneNumber(phoneNumber);
        if (!target) {
            return sendWsError(ws, 'No client found with that phone number.', 'NOT_FOUND');
        }
        targetClientId = target.id;
    }

    if (!targetClientId) {
        return sendWsError(ws, 'Must provide phoneNumber or clientId.', 'VALIDATION_ERROR');
    }

    // Check DND
    const isDND = await db.isClientDND(targetClientId);
    if (isDND) {
        return sendWsError(ws, 'Target has Do Not Disturb enabled.', 'TARGET_DND');
    }

    // Add participant to conference
    await db.addConferenceParticipant({ callId, participantId: targetClientId, participantRole: 'party' });

    const call = await db.getCall(callId);

    // Notify the third party
    const thirdPartyWs = state.findClientSocketByUserId(targetClientId);
    if (thirdPartyWs && thirdPartyWs.readyState === WebSocket.OPEN) {
        thirdPartyWs.send(JSON.stringify({
            type: 'conference_invite',
            data: {
                callId,
                roomName: call ? call.room_name : null,
                invitedByName: client.name,
                invitedById: client.userId
            }
        }));
    } else {
        await db.createMissedCall({
            callerId: client.userId,
            calleePhone: phoneNumber || null,
            calleeClientId: targetClientId,
            roomName: call ? call.room_name : null
        });

        ws.send(JSON.stringify({
            type: 'conference_add_offline',
            data: { targetClientId, callId }
        }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'conference_add_ringing',
        data: { targetClientId, callId }
    }));

    activityLogger.log('conference_add', { callId, addedById: client.userId, targetClientId });
}

async function handleConferenceRemove(ws, data) {
    const client = ws.clientInfo;
    if (!client || !client.authenticated) {
        return sendWsError(ws, 'Authentication required.', 'AUTH_REQUIRED');
    }

    const { callId, participantId } = data.data || data;
    await db.removeConferenceParticipant(callId, participantId);

    // Notify removed participant
    const participantWs = state.findClientSocketByUserId(participantId);
    if (participantWs && participantWs.readyState === WebSocket.OPEN) {
        participantWs.send(JSON.stringify({
            type: 'conference_removed',
            data: { callId, removedBy: client.name }
        }));
    }

    ws.send(JSON.stringify({
        type: 'conference_participant_removed',
        data: { callId, participantId }
    }));

    activityLogger.log('conference_remove', { callId, removedBy: client.userId, participantId });
}

// ============================================
// IN-CALL CHAT HANDLERS
// ============================================

async function handleChatSend(ws, data) {
    const client = ws.clientInfo;
    if (!client || !client.authenticated) {
        return sendWsError(ws, 'Authentication required.', 'AUTH_REQUIRED');
    }

    const { callId, message } = data.data || data;

    const result = await db.addChatMessage({
        callId,
        senderId: client.userId,
        senderName: client.name || 'Unknown',
        message
    });

    // Broadcast to all participants on the call
    const call = await db.getCall(callId);
    if (call) {
        const participantIds = [call.client_id, call.callee_id, call.interpreter_id].filter(Boolean);
        const chatMsg = JSON.stringify({
            type: 'chat_message',
            data: {
                id: result.id,
                callId,
                senderId: client.userId,
                senderName: client.name || 'Unknown',
                message,
                timestamp: Date.now()
            }
        });

        for (const pid of participantIds) {
            if (pid === client.userId) continue;
            const participantWs = state.findClientSocketByUserId(pid);
            if (participantWs && participantWs.readyState === WebSocket.OPEN) {
                participantWs.send(chatMsg);
            }
        }
    }

    ws.send(JSON.stringify({
        type: 'chat_message_sent',
        data: { id: result.id, callId, message }
    }));
}

async function handleChatHistory(ws, data) {
    const client = ws.clientInfo;
    if (!client || !client.authenticated) {
        return sendWsError(ws, 'Authentication required.', 'AUTH_REQUIRED');
    }

    const { callId, limit, offset } = data.data || data;
    const messages = await db.getChatMessages(callId, limit || 100, offset || 0);

    ws.send(JSON.stringify({
        type: 'chat_history',
        data: { callId, messages }
    }));
}

// ============================================
// CLIENT PREFERENCES HANDLER
// ============================================

async function handlePreferencesUpdate(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const updates = data.data || data;
    await db.updateClientPreferences(client.userId, updates);

    // Return the updated preferences
    const prefs = await db.getClientPreferences(client.userId);
    ws.send(JSON.stringify({
        type: 'preferences_updated',
        data: prefs
    }));

    activityLogger.log('preferences_updated', { clientId: client.userId, updates });
}

// ============================================
// TTS / VCO HANDLERS
// ============================================

async function handleVCOStart(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const payload = data.data || {};
    const targetPhone = sanitizePhoneNumber(payload.targetPhone);
    const roomName = payload.roomName || generateFriendlyRoomName();

    try {
        const callId = await db.createVCOCall({
            clientId: client.userId,
            roomName,
            targetPhone: targetPhone || null
        });

        ttsService.startSession(callId, client.userId, roomName, targetPhone || null);

        ws.send(JSON.stringify({
            type: 'vco_started',
            data: {
                callId,
                roomName,
                callMode: 'vco',
                targetPhone: targetPhone || null,
                message: 'VCO call started. Use tts_speak to send text messages.'
            }
        }));

        // If target phone was provided and Twilio is available, initiate outbound call
        if (targetPhone) {
            try {
                const twilioBase = process.env.TWILIO_VOICE_URL || 'http://localhost:3002';
                const twilioRes = await fetch(twilioBase + '/api/voice/call', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phoneNumber: targetPhone,
                        interpreterId: 'tts-fallback-' + client.userId,
                        sessionId: callId
                    })
                });
                const twilioData = await twilioRes.json();
                if (twilioData.success) {
                    ttsService.attachCallSid(callId, twilioData.callSid);
                    ws.send(JSON.stringify({
                        type: 'vco_outbound_initiated',
                        data: { callId, callSid: twilioData.callSid, targetPhone }
                    }));
                }
            } catch (twilioErr) {
                log.warn({ err: twilioErr }, 'Twilio outbound failed for VCO (non-fatal)');
            }
        }

        activityLogger.log('vco_call_started', { callId, clientId: client.userId, roomName, targetPhone });
        log.info({ callId, clientId: client.userId, roomName }, 'VCO call started');
    } catch (error) {
        log.error({ err: error }, 'VCO start error');
        sendWsError(ws, 'Failed to start VCO call.', 'INTERNAL_ERROR');
    }
}

async function handleVCOEnd(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) return;

    const payload = data.data || {};
    const { callId } = payload;
    if (!callId) return;

    try {
        await db.endCall(callId, payload.durationMinutes || 0);
        ttsService.endSession(callId);

        ws.send(JSON.stringify({
            type: 'vco_ended',
            data: { callId, roomName: payload.roomName }
        }));

        activityLogger.log('vco_call_ended', { callId, clientId: client.userId, durationMinutes: payload.durationMinutes || 0 });
        log.info({ callId, durationMs: (payload.durationMinutes || 0) * 60000 }, 'VCO call ended');
    } catch (err) {
        log.error({ err }, 'VCO end error');
    }
}

async function handleTTSSpeak(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const payload = data.data || {};
    const { callId, text, voiceSettings } = payload;

    if (!callId || !text) {
        return sendWsError(ws, 'callId and text are required.', 'VALIDATION_ERROR');
    }

    // Verify the call belongs to this client
    const session = ttsService.getSession(callId);
    if (!session || String(session.clientId) !== String(client.userId)) {
        return sendWsError(ws, 'TTS session not found or not owned by you.', 'NOT_FOUND');
    }

    // Get client voice settings (merge with any overrides from this message)
    const settings = await ttsService.getSettings(client.userId);
    const mergedVoice = {
        voiceName: voiceSettings?.voiceName || settings.voiceName,
        voiceGender: voiceSettings?.voiceGender || settings.voiceGender,
        voiceSpeed: voiceSettings?.voiceSpeed || settings.voiceSpeed,
        voicePitch: voiceSettings?.voicePitch || settings.voicePitch
    };
    const twilioVoice = mergedVoice.voiceGender === 'male' ? 'man' : 'alice';

    // If there is an active outbound Twilio leg, inject <Say> into that live call
    // before confirming success back to the client.
    if (session.callSid) {
        try {
            const twilioBase = process.env.TWILIO_VOICE_URL || 'http://localhost:3002';
            const twilioRes = await fetch(twilioBase + '/api/voice/tts-say', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callSid: session.callSid,
                    text,
                    voice: twilioVoice
                })
            });

            if (!twilioRes.ok) {
                const errorText = await twilioRes.text();
                log.warn({ callId, callSid: session.callSid, status: twilioRes.status, errorText }, 'Twilio TTS relay failed');
                return sendWsError(ws, 'Failed to relay TTS to the live phone call.', 'TTS_RELAY_FAILED');
            }
        } catch (twilioErr) {
            log.warn({ err: twilioErr, callId, callSid: session.callSid }, 'Twilio TTS relay failed');
            return sendWsError(ws, 'Failed to relay TTS to the live phone call.', 'TTS_RELAY_FAILED');
        }
    }

    // Broadcast the TTS message to the client UI so they get confirmation and
    // local playback for verification.
    ws.send(JSON.stringify({
        type: 'tts_message_sent',
        data: {
            callId,
            text,
            voiceSettings: mergedVoice,
            timestamp: Date.now()
        }
    }));

    activityLogger.log('tts_speak', { callId, clientId: client.userId, textLength: text.length });
    log.info({ callId, textLength: text.length, hasOutboundRelay: Boolean(session.callSid) }, 'TTS speak relayed');
}

async function handleTTSQuickSpeak(ws, data) {
    const client = ws.clientInfo;
    if (!client || client.role !== 'client' || !client.authenticated) {
        return sendWsError(ws, 'Client authentication required.', 'AUTH_REQUIRED');
    }

    const payload = data.data || {};
    const { callId, phraseId } = payload;

    if (!callId || !phraseId) {
        return sendWsError(ws, 'callId and phraseId are required.', 'VALIDATION_ERROR');
    }

    try {
        const phrases = await ttsService.getQuickPhrases(client.userId);
        const phrase = phrases.find(p => p.id === phraseId);
        if (!phrase) {
            return sendWsError(ws, 'Quick phrase not found.', 'NOT_FOUND');
        }

        // Reuse the speak handler with the phrase text
        await handleTTSSpeak(ws, {
            data: {
                callId,
                text: phrase.text
            }
        });
    } catch (error) {
        log.error({ err: error }, 'TTS quick speak error');
        sendWsError(ws, 'Failed to speak quick phrase.', 'INTERNAL_ERROR');
    }
}

// ============================================
// DND CHECK (used by P2P call to check if callee has DND on)
// ============================================

module.exports = { handleConnection };
