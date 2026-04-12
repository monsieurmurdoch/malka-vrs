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
const state = require('../lib/state');
const { verifyJwtToken, normalizeAuthClaims, tokenMatchesRequestedRole } = require('../lib/auth');

function sanitizePhoneNumber(raw) {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) return null;
    return cleaned;
}

function requireAuthenticatedRole(ws, roles, message = 'Authentication required.') {
    const client = ws.clientInfo;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    if (!client || !client.authenticated || (allowedRoles[0] && !allowedRoles.includes(client.role))) {
        ws.send(JSON.stringify({ type: 'error', data: { message } }));
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
        ws.send(JSON.stringify({ type: 'error', data: { message: `${actionLabel} requires userId` } }));
        return null;
    }

    if (String(providedUserId) !== String(client.userId)) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'You can only manage your own session.' } }));
        return null;
    }

    return client;
}

// ============================================
// CONNECTION HANDLER
// ============================================

function handleConnection(ws, req) {
    const clientId = uuidv4();
    console.log('[WebSocket] New connection:', clientId);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return;
        }

        try {
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
                console.error('[WebSocket] Failed to deliver missed calls:', err);
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

// ============================================
// INTERPRETER STATUS
// ============================================

function handleInterpreterStatus(ws, data) {
    const wsClient = ws.clientInfo;
    if (!wsClient || !wsClient.authenticated) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Authentication required.' } }));
        return;
    }

    const payload = data.data || data;
    const { status, languages } = payload;

    for (const [, entry] of state.clients.interpreters) {
        if (entry.ws === ws) {
            entry.status = status;
            entry.languages = languages || entry.languages;

            state.broadcastToAdmins({
                type: 'interpreter_status_changed',
                data: { id: entry.userId, name: entry.name, status, languages: entry.languages, timestamp: Date.now() }
            });

            activityLogger.log('interpreter_status_change', {
                interpreterId: entry.userId, interpreterName: entry.name, status
            });

            if (status === 'online' || status === 'available' || status === 'active') {
                queueService.interpreterAvailable(entry.userId, entry.name, languages);
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
    const result = await queueService.requestInterpreter({
        clientId: client.userId,
        clientName: payload.clientName || client.name || 'Guest',
        language: payload.language || 'ASL',
        roomName: payload.roomName || `vrs-${client.clientId}`
    });

    if (!result.success) {
        ws.send(JSON.stringify({ type: 'error', data: { message: result.message } }));
        return;
    }

    ws.send(JSON.stringify({
        type: 'request_queued',
        data: { requestId: result.requestId, position: result.position, roomName: result.request.roomName, language: result.request.language }
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
        language: request.language
    };

    ws.send(JSON.stringify({ type: 'request_accepted', data: meetingData }));
    ws.send(JSON.stringify({ type: 'meeting_initiated', data: meetingData }));

    const clientSocket = state.findClientSocketByUserId(result.clientId);
    if (clientSocket) {
        clientSocket.send(JSON.stringify({ type: 'match_found', data: meetingData }));
        clientSocket.send(JSON.stringify({ type: 'meeting_initiated', data: meetingData }));
    }

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

        if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
            const callId = await db.createP2PCall({ callerId: caller.userId, calleeId: callee.id, roomName });

            caller.currentP2PCall = { callId, roomName, calleeId: callee.id, calleeName: callee.name };

            ws.send(JSON.stringify({
                type: 'p2p_ringing',
                data: { callId, roomName, calleeName: callee.name, calleePhone: phoneNumber }
            }));

            calleeWs.send(JSON.stringify({
                type: 'p2p_incoming_call',
                data: { callId, roomName, callerName: caller.name, callerId: caller.userId, calleeId: callee.id }
            }));

            activityLogger.log('p2p_call_ringing', { callerId: caller.userId, calleeId: callee.id, roomName });
        } else {
            await db.createMissedCall({ callerId: caller.userId, calleePhone: phoneNumber, calleeClientId: callee.id, roomName });

            ws.send(JSON.stringify({
                type: 'p2p_target_offline',
                data: { calleeName: callee.name, calleePhone: phoneNumber }
            }));

            activityLogger.log('p2p_call_missed', { callerId: caller.userId, calleeId: callee.id, calleePhone: phoneNumber });
        }
    } catch (error) {
        console.error('[P2P Call] Error:', error);
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
        console.error('[P2P End] Error ending call:', err);
    }

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

module.exports = { handleConnection };
