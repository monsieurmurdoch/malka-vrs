/**
 * WebSocket service for interpreter queue management.
 *
 * This client speaks the same protocol as the local `vrs-server` queue
 * backend at `/ws`.
 */

import { getUserRole } from '../base/user-role/functions';
import { APP_TYPE } from '../base/whitelabel/constants';
import { getAppType, getWhitelabelConfig } from '../base/whitelabel/functions';
import { mobileLog } from '../mobile/navigation/logging';
import { getPersistentJson, removePersistentItem } from '../vrs-auth/storage';

declare var config: any;

export interface QueueMessage {
    type: string;
    data?: any;
    clientId?: string;
    role?: string;
    userId?: string;
    name?: string;
    token?: string;
}

export interface InterpreterInfo {
    id: string;
    name: string;
    status: 'active' | 'busy' | 'inactive';
    languages: string[];
}

export interface RequestInfo {
    id: string;
    clientName: string;
    language: string;
    timestamp?: number;
    roomName?: string;
    position?: number;
}

export interface QueueStatus {
    activeInterpreters: InterpreterInfo[];
    pendingRequests: RequestInfo[];
    totalMatches: number;
    paused?: boolean;
}

interface StoredAuthToken {
    token?: string;
    userId?: string;
    name?: string;
}

interface StoredUserInfo {
    id?: string;
    name?: string;
}

interface StoredActiveCall {
    callId?: string;
    roomName?: string;
}

const CONNECTION_ERROR_LOG_INTERVAL = 60000;
const SEND_WARNING_LOG_INTERVAL = 30000;

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    const maybeError = error as { message?: unknown; type?: unknown };

    if (typeof maybeError?.message === 'string' && maybeError.message) {
        return maybeError.message;
    }

    if (typeof maybeError?.type === 'string' && maybeError.type) {
        return maybeError.type;
    }

    return fallback;
}

function getTenantQueueDomain(role: string): string | undefined {
    const domains = getWhitelabelConfig()?.domains;

    if (!domains) {
        return undefined;
    }

    if (role === 'interpreter') {
        return domains.queue || domains.interpreter || domains.api || domains.clientVri || domains.clientVrs;
    }

    if (getAppType() === APP_TYPE.VRI) {
        return domains.queue || domains.api || domains.clientVri || domains.clientVrs || domains.interpreter;
    }

    return domains.queue || domains.api || domains.clientVrs || domains.clientVri || domains.interpreter;
}

function getDefaultQueueServiceUrl() {
    if (typeof window !== 'undefined' && window.location?.host) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        return `${wsProtocol}//${window.location.host}/ws`;
    }

    const domain = getTenantQueueDomain(getUserRole());

    if (domain) {
        return `wss://${domain}/ws`;
    }

    return 'wss://vrs.malkacomm.com/ws';
}

function getVRSConfig() {
    const defaults = {
        queueServiceUrl: getDefaultQueueServiceUrl(),
        queue: {
            maxWaitTime: 10,
            estimatedWaitPerPerson: 2
        }
    };

    if (typeof config !== 'undefined' && config.vrs) {
        return { ...defaults, ...config.vrs };
    }

    return defaults;
}

function getStoredJson<T>(key: string): T | null {
    return getPersistentJson<T>(key);
}

function getCurrentRoomName(): string | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const path = window.location.pathname.split('/').filter(Boolean);
    const roomName = path[path.length - 1];

    if (!roomName || roomName.endsWith('.html')) {
        return undefined;
    }

    return roomName;
}

function hasQueueAuthForRole(role: string): boolean {
    if (role === 'client') {
        return true;
    }

    if (role === 'captioner') {
        return false;
    }

    const storedToken = getStoredJson<StoredAuthToken>('vrs_auth_token');

    return Boolean(storedToken?.token);
}

class InterpreterQueueService {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private baseReconnectDelay = 1000;
    private maxReconnectDelay = 30000;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private listeners: Map<string, Function[]> = new Map();
    private userId: string | null = null;
    private userRole: string;
    private config: { queueServiceUrl: string; queue: { maxWaitTime: number; estimatedWaitPerPerson: number } };
    private shouldReconnect = true;
    private reconnectPending = false;
    private lastConnectionErrorLogAt = 0;
    private connectionErrorCount = 0;
    private lastSendWarningLogAt = 0;

    constructor() {
        this.config = getVRSConfig();
        this.userRole = getUserRole();
        if (hasQueueAuthForRole(this.userRole)) {
            this.connect();
        }
    }

    private connect() {
        this.userRole = getUserRole();
        this.config = getVRSConfig();

        if (!hasQueueAuthForRole(this.userRole)) {
            return;
        }

        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            const wsUrl = this.config.queueServiceUrl;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.sendAuth();
                this.emit('connection', { connected: true });
            };

            this.ws.onmessage = event => {
                try {
                    const message: QueueMessage = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing queue message:', error);
                }
            };

            this.ws.onclose = () => {
                this.stopHeartbeat();
                this.emit('connection', { connected: false });
                if (this.reconnectPending) {
                    this.reconnectPending = false;
                    this.connect();
                    return;
                }

                if (this.shouldReconnect) {
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = error => {
                this.reportConnectionIssue(error);
            };
        } catch (error) {
            this.reportConnectionIssue(error);
            this.attemptReconnect();
        }
    }

    private reportConnectionIssue(error: unknown) {
        this.connectionErrorCount++;

        const now = Date.now();
        const shouldLog = this.lastConnectionErrorLogAt === 0
            || now - this.lastConnectionErrorLogAt >= CONNECTION_ERROR_LOG_INTERVAL;
        const payload = {
            code: 'QUEUE_WS_CONNECTION_FAILED',
            errorCount: this.connectionErrorCount,
            message: getErrorMessage(error, 'Queue WebSocket connection failed'),
            retrying: this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts,
            url: this.config.queueServiceUrl
        };

        if (!shouldLog) {
            return;
        }

        this.lastConnectionErrorLogAt = now;
        mobileLog('warn', 'queue_ws_connection_failed', payload, { console: false });
        this.emit('error', payload);
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'heartbeat' });
        }, 15000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private attemptReconnect() {
        if (!this.shouldReconnect) {
            return;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('connection', {
                connected: false,
                maxAttemptsReached: true,
                message: 'Unable to connect to queue server. Please refresh the page.'
            });
            return;
        }

        this.reconnectAttempts++;

        const exponentialDelay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        const delay = Math.round(exponentialDelay + jitter);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, delay);
    }

    private sendAuth() {
        const storedToken = getStoredJson<StoredAuthToken>('vrs_auth_token');
        const storedUser = getStoredJson<StoredUserInfo>('vrs_user_info');
        const fallbackUserId = storedUser?.id || storedToken?.userId || `${this.userRole}-${Date.now()}`;
        const fallbackName = storedUser?.name || storedToken?.name || (this.userRole === 'interpreter' ? 'Interpreter' : 'Guest');

        this.send({
            type: 'auth',
            role: this.userRole,
            userId: fallbackUserId,
            name: fallbackName,
            token: storedToken?.token
        });
    }

    private normalizeQueueStatus(data: any): QueueStatus {
        const activeInterpreters = Array.isArray(data?.activeInterpreters) ? data.activeInterpreters : [];
        const pendingRequests = Array.isArray(data?.pendingRequests) ? data.pendingRequests : [];

        return {
            activeInterpreters,
            pendingRequests,
            totalMatches: data?.totalMatches || 0,
            paused: data?.paused || false
        };
    }

    private handleMessage(message: QueueMessage) {
        switch (message.type) {
            case 'connected':
                this.userId = message.clientId || null;
                break;

            case 'auth_success':
                this.emit('authenticated', {
                    role: message.role,
                    clientId: message.clientId
                });
                break;

            case 'queue_status':
                this.emit('queueStatus', this.normalizeQueueStatus(message.data));
                break;

            case 'match_found':
                this.emit('matchFound', message.data);
                break;

            case 'request_assigned':
                this.emit('requestAssigned', message.data);
                break;

            case 'request_queued':
                this.emit('requestQueued', message.data);
                break;

            case 'request_cancelled':
                this.emit('requestCancelled', message.data);
                break;

            case 'interpreter_request':
                this.emit('interpreterRequest', message.data);
                break;

            case 'request_accepted':
                this.emit('requestAccepted', message.data);
                break;

            case 'request_declined':
                this.emit('requestDeclined', message.data);
                break;

            case 'meeting_initiated':
                this.emit('meetingInitiated', message.data);
                break;

            case 'ping':
                this.send({ type: 'heartbeat' });
                break;

            case 'pong':
            case 'heartbeat_ack':
            case 'status_updated':
                break;

            case 'error':
            case 'auth_error':
                this.emit('error', message.data || { message: 'Queue server error' });
                break;

            // Handoff message types — emitted as events for device-handoff middleware
            case 'handoff_in_progress':
                this.emit('handoff_in_progress', message.data);
                break;

            case 'handoff_complete':
                this.emit('handoff_complete', message.data);
                break;

            case 'handoff_executed':
                this.emit('handoff_executed', message.data);
                break;

            case 'handoff_consumed':
                this.emit('handoff_consumed', message.data);
                break;

            case 'handoff_prepared':
                this.emit('handoff_prepared', message.data);
                break;

            case 'handoff_error':
                this.emit('handoff_error', message.data);
                break;

            case 'session_registered':
                this.emit('session_registered', message.data);
                break;

            case 'session_unregistered':
                this.emit('session_unregistered', message.data);
                break;

            // Call Management & UX
            case 'p2p_incoming_call_waiting':
                this.emit('callWaitingIncoming', message.data);
                break;

            case 'call_waiting_responded':
                this.emit('callWaitingResponded', message.data);
                break;

            case 'call_on_hold':
                this.emit('callOnHold', message.data);
                break;

            case 'call_off_hold':
                this.emit('callOffHold', message.data);
                break;

            case 'call_hold_updated':
                this.emit('callHoldUpdated', message.data);
                break;

            case 'call_transfer_initiated':
                this.emit('callTransferInitiated', message.data);
                break;

            case 'call_transfer_pending':
                this.emit('callTransferPending', message.data);
                break;

            case 'call_transfer_accepted':
                this.emit('callTransferAccepted', message.data);
                break;

            case 'call_transfer_cancelled':
                this.emit('callTransferCancelled', message.data);
                break;

            case 'conference_invite':
                this.emit('conferenceInvite', message.data);
                break;

            case 'conference_add_ringing':
                this.emit('conferenceAddRinging', message.data);
                break;

            case 'conference_add_offline':
                this.emit('conferenceAddOffline', message.data);
                break;

            case 'conference_removed':
                this.emit('conferenceRemoved', message.data);
                break;

            case 'conference_participant_removed':
                this.emit('conferenceParticipantRemoved', message.data);
                break;

            case 'chat_message':
                this.emit('chatMessage', message.data);
                break;

            case 'chat_message_sent':
                this.emit('chatMessageSent', message.data);
                break;

            case 'chat_history':
                this.emit('chatHistory', message.data);
                break;

            case 'preferences_updated':
                this.emit('preferencesUpdated', message.data);
                break;

            case 'p2p_target_dnd':
                this.emit('p2pTargetDnd', message.data);
                break;

            case 'p2p_ringing':
                this.emit('p2pRinging', message.data);
                break;

            case 'p2p_call_failed':
                this.emit('p2pCallFailed', message.data);
                break;

            case 'p2p_target_offline':
                this.emit('p2pTargetOffline', message.data);
                break;

            case 'vri_invite_prepared':
                this.emit('vriInvitePrepared', message.data);
                break;

            case 'contacts_changed':
                this.emit('contactsChanged', message.data);
                break;

            default:
                console.warn('Unknown queue message type:', message.type, message);
        }
    }

    public on(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    public off(event: string, callback: Function) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: any) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    public updateInterpreterStatus(status: 'active' | 'inactive', name?: string, languages: string[] = [ 'ASL', 'en' ]) {
        this.send({
            type: 'interpreter_status_update',
            data: {
                status,
                name,
                languages
            }
        });
    }

    public requestInterpreter(
            language = 'ASL',
            clientName?: string,
            roomNameOrOptions?: string | {
                callType?: 'vrs' | 'vri';
                inviteTokens?: string[];
                roomName?: string;
            }) {
        const options = typeof roomNameOrOptions === 'string'
            ? { roomName: roomNameOrOptions }
            : roomNameOrOptions || {};

        this.send({
            type: 'request_interpreter',
            data: {
                callType: options.callType,
                inviteTokens: options.inviteTokens,
                language,
                clientName,
                roomName: options.roomName || getCurrentRoomName()
            }
        });
    }

    public cancelRequest(requestId?: string) {
        this.send({
            type: 'cancel_request',
            data: { requestId }
        });
    }

    public acceptRequest(requestId: string, roomName?: string) {
        this.send({
            type: 'accept_request',
            data: { requestId, roomName }
        });
    }

    public declineRequest(requestId: string) {
        this.send({
            type: 'decline_request',
            data: { requestId }
        });
    }

    public sendP2PCall(phoneNumber: string) {
        this.send({
            type: 'p2p_call',
            data: { phoneNumber }
        });
    }

    public prepareVriInvite(data: { guestName?: string; guestEmail?: string; guestPhone?: string; roomName?: string }) {
        this.send({
            type: 'prepare_vri_invite',
            data
        });
    }

    public endActiveCall() {
        const activeCall = getStoredJson<StoredActiveCall>('vrs_active_call');
        if (!activeCall?.callId) {
            return;
        }

        this.send({
            type: 'call_end',
            data: {
                callId: activeCall.callId,
                roomName: activeCall.roomName
            }
        });

        removePersistentItem('vrs_active_call');
    }

    public send(message: QueueMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            const now = Date.now();

            if (this.lastSendWarningLogAt === 0 || now - this.lastSendWarningLogAt >= SEND_WARNING_LOG_INTERVAL) {
                this.lastSendWarningLogAt = now;
                mobileLog('warn', 'queue_ws_send_skipped', {
                    messageType: message.type,
                    reason: 'not_connected',
                    url: this.config.queueServiceUrl
                }, { console: false });
            }
        }
    }

    public isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    public getUserId(): string | null {
        return this.userId;
    }

    public disconnect() {
        this.shouldReconnect = false;
        this.reconnectPending = false;
        this.stopHeartbeat();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            // Remove event handlers before closing to prevent callbacks
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
            this.ws = null;
        }
        this.listeners.clear();
    }

    public reconnect() {
        this.shouldReconnect = true;
        this.stopHeartbeat();

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.ws) {
            const socket = this.ws;
            this.ws = null;
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                this.reconnectPending = true;
                socket.close();
                return;
            }
        }

        this.connect();
    }

    public ping() {
        this.send({ type: 'heartbeat' });
    }
}

const hasWebSocketRuntime = typeof WebSocket !== 'undefined';
let _queueService: InterpreterQueueService | null = null;

function getQueueServiceInstance(): InterpreterQueueService | null {
    if (!hasWebSocketRuntime) {
        return null;
    }

    if (!_queueService) {
        _queueService = new InterpreterQueueService();
    }

    return _queueService;
}

export const queueService = {
    get instance(): InterpreterQueueService {
        return getQueueServiceInstance() as InterpreterQueueService;
    },
    on: (...args: Parameters<InterpreterQueueService['on']>) => queueService.instance.on(...args),
    off: (...args: Parameters<InterpreterQueueService['off']>) => queueService.instance.off(...args),
    isConnected: () => Boolean(getQueueServiceInstance()?.isConnected()),
    getUserId: () => getQueueServiceInstance()?.getUserId() || null,
    disconnect: () => getQueueServiceInstance()?.disconnect(),
    reconnect: () => getQueueServiceInstance()?.reconnect(),
    ping: () => getQueueServiceInstance()?.ping(),
    send: (...args: Parameters<InterpreterQueueService['send']>) =>
        getQueueServiceInstance()?.send(...args),
    updateInterpreterStatus: (...args: Parameters<InterpreterQueueService['updateInterpreterStatus']>) =>
        getQueueServiceInstance()?.updateInterpreterStatus(...args),
    requestInterpreter: (...args: Parameters<InterpreterQueueService['requestInterpreter']>) =>
        getQueueServiceInstance()?.requestInterpreter(...args),
    endActiveCall: () => getQueueServiceInstance()?.endActiveCall(),
    sendP2PCall: (...args: Parameters<InterpreterQueueService['sendP2PCall']>) =>
        getQueueServiceInstance()?.sendP2PCall(...args),
    prepareVriInvite: (...args: Parameters<InterpreterQueueService['prepareVriInvite']>) =>
        getQueueServiceInstance()?.prepareVriInvite(...args),
    cancelRequest: (...args: Parameters<InterpreterQueueService['cancelRequest']>) =>
        getQueueServiceInstance()?.cancelRequest(...args),
    acceptRequest: (...args: Parameters<InterpreterQueueService['acceptRequest']>) =>
        getQueueServiceInstance()?.acceptRequest(...args),
    declineRequest: (...args: Parameters<InterpreterQueueService['declineRequest']>) =>
        getQueueServiceInstance()?.declineRequest(...args)
};

export default InterpreterQueueService;
