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

declare const config: {
    vrs?: Partial<VRSQueueConfig>;
} | undefined;

export interface QueueMessage {
    type: string;
    data?: unknown;
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

export interface QueueMatchPayload {
    callId?: string;
    requestId?: string;
    roomName?: string;
    clientId?: string;
    clientName?: string;
    interpreterId?: string;
    interpreterName?: string;
    language?: string;
}

export interface InterpreterRequestPayload {
    id: string;
    clientName: string;
    language: string;
    timestamp?: number;
    roomName?: string;
}

export interface QueueErrorPayload {
    code?: string;
    message?: string;
    retrying?: boolean;
    [key: string]: unknown;
}

export interface VriInvitePreparedPayload {
    inviteUrl?: string;
    token?: string;
}

export interface VoicemailEventPayload {
    calleeId?: string;
    calleeName?: string;
    calleePhone?: string;
    count?: number;
    durationSeconds?: number;
    maxDurationSeconds?: number;
    message?: string;
    messageId?: string;
    roomName?: string;
    voicemailAvailable?: boolean;
    [key: string]: unknown;
}

export interface QueueStatus {
    activeInterpreters: InterpreterInfo[];
    pendingRequests: RequestInfo[];
    totalMatches: number;
    paused?: boolean;
}

interface VRSQueueConfig {
    queueServiceUrl: string;
    queue: {
        maxWaitTime: number;
        estimatedWaitPerPerson: number;
    };
}

export interface QueueEventMap {
    authenticated: { role?: string; clientId?: string };
    callHoldUpdated: unknown;
    callOffHold: unknown;
    callOnHold: unknown;
    callTransferAccepted: unknown;
    callTransferCancelled: unknown;
    callTransferInitiated: unknown;
    callTransferPending: unknown;
    callWaitingIncoming: unknown;
    callWaitingResponded: unknown;
    chatHistory: unknown;
    chatMessage: unknown;
    chatMessageSent: unknown;
    conferenceAddOffline: unknown;
    conferenceAddRinging: unknown;
    conferenceInvite: unknown;
    conferenceParticipantRemoved: unknown;
    conferenceRemoved: unknown;
    connection: { connected: boolean; maxAttemptsReached?: boolean; message?: string };
    contactsChanged: unknown;
    error: QueueErrorPayload;
    handoff_complete: unknown;
    handoff_consumed: unknown;
    handoff_error: unknown;
    handoff_executed: unknown;
    handoff_in_progress: unknown;
    handoff_prepared: unknown;
    interpreterRequest: InterpreterRequestPayload;
    matchFound: QueueMatchPayload;
    meetingInitiated: QueueMatchPayload;
    p2pCallFailed: { message?: string; [key: string]: unknown };
    p2pRinging: QueueMatchPayload & { calleeName?: string };
    p2pTargetDnd: { calleeName?: string; [key: string]: unknown };
    p2pTargetOffline: { calleeName?: string; [key: string]: unknown };
    p2p_target_offline: { calleeName?: string; [key: string]: unknown };
    preferencesUpdated: unknown;
    queueStatus: QueueStatus;
    requestAccepted: QueueMatchPayload;
    requestAssigned: QueueMatchPayload;
    requestCancelled: { requestId?: string };
    requestDeclined: QueueMatchPayload;
    requestQueued: { position?: number; requestId?: string };
    session_registered: unknown;
    session_unregistered: unknown;
    voicemail_error: VoicemailEventPayload;
    voicemail_message_deleted: VoicemailEventPayload;
    voicemail_new_message: VoicemailEventPayload;
    voicemail_recording_cancelled: VoicemailEventPayload;
    voicemail_recording_complete: VoicemailEventPayload;
    voicemail_recording_started: VoicemailEventPayload;
    voicemail_unread_count: VoicemailEventPayload;
    vriInvitePrepared: VriInvitePreparedPayload;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function normalizeInterpreterStatus(value: unknown): InterpreterInfo['status'] {
    return value === 'busy' || value === 'inactive' ? value : 'active';
}

function recordPayload(data: unknown): Record<string, unknown> {
    return isRecord(data) ? data : {};
}

function getVRSConfig(): VRSQueueConfig {
    const defaults = {
        queueServiceUrl: getDefaultQueueServiceUrl(),
        queue: {
            maxWaitTime: 10,
            estimatedWaitPerPerson: 2
        }
    };

    if (typeof config !== 'undefined' && config?.vrs) {
        return {
            ...defaults,
            ...config.vrs,
            queue: {
                ...defaults.queue,
                ...config.vrs.queue
            }
        };
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
    private listeners: Map<keyof QueueEventMap, Array<(data: QueueEventMap[keyof QueueEventMap]) => void>> = new Map();
    private userId: string | null = null;
    private userRole: string;
    private config: VRSQueueConfig;
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
                    const message = JSON.parse(event.data) as QueueMessage;
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

    private normalizeQueueStatus(data: unknown): QueueStatus {
        const source = isRecord(data) ? data : {};
        const activeInterpreters = Array.isArray(source.activeInterpreters)
            ? source.activeInterpreters.filter(isRecord).map(interpreter => ({
                id: stringValue(interpreter.id) || '',
                languages: Array.isArray(interpreter.languages)
                    ? interpreter.languages.filter((language): language is string => typeof language === 'string')
                    : [],
                name: stringValue(interpreter.name) || 'Interpreter',
                status: normalizeInterpreterStatus(interpreter.status)
            }))
            : [];
        const pendingRequests = Array.isArray(source.pendingRequests)
            ? source.pendingRequests.filter(isRecord).map(request => ({
                clientName: stringValue(request.clientName) || 'Client',
                id: stringValue(request.id) || stringValue(request.requestId) || '',
                language: stringValue(request.language) || 'ASL',
                position: numberValue(request.position),
                roomName: stringValue(request.roomName),
                timestamp: numberValue(request.timestamp)
            }))
            : [];

        return {
            activeInterpreters,
            pendingRequests,
            totalMatches: typeof source.totalMatches === 'number' ? source.totalMatches : 0,
            paused: Boolean(source.paused)
        };
    }

    private normalizeMatchPayload(data: unknown): QueueMatchPayload {
        const source = isRecord(data) ? data : {};

        return {
            callId: stringValue(source.callId),
            clientId: stringValue(source.clientId),
            clientName: stringValue(source.clientName),
            interpreterId: stringValue(source.interpreterId),
            interpreterName: stringValue(source.interpreterName),
            language: stringValue(source.language),
            requestId: stringValue(source.requestId),
            roomName: stringValue(source.roomName)
        };
    }

    private normalizeInterpreterRequest(data: unknown): InterpreterRequestPayload {
        const source = isRecord(data) ? data : {};

        return {
            clientName: stringValue(source.clientName) || 'Client',
            id: stringValue(source.id) || stringValue(source.requestId) || '',
            language: stringValue(source.language) || 'ASL',
            roomName: stringValue(source.roomName),
            timestamp: numberValue(source.timestamp)
        };
    }

    private normalizeRequestQueued(data: unknown): QueueEventMap['requestQueued'] {
        const source = isRecord(data) ? data : {};

        return {
            position: numberValue(source.position),
            requestId: stringValue(source.requestId)
        };
    }

    private normalizeVriInvitePrepared(data: unknown): VriInvitePreparedPayload {
        const source = isRecord(data) ? data : {};

        return {
            inviteUrl: stringValue(source.inviteUrl),
            token: stringValue(source.token)
        };
    }

    private normalizeVoicemailPayload(data: unknown): VoicemailEventPayload {
        const source = isRecord(data) ? data : {};

        return {
            ...source,
            calleeId: stringValue(source.calleeId),
            calleeName: stringValue(source.calleeName),
            calleePhone: stringValue(source.calleePhone),
            count: numberValue(source.count),
            durationSeconds: numberValue(source.durationSeconds),
            maxDurationSeconds: numberValue(source.maxDurationSeconds),
            message: stringValue(source.message),
            messageId: stringValue(source.messageId),
            roomName: stringValue(source.roomName),
            voicemailAvailable: typeof source.voicemailAvailable === 'boolean' ? source.voicemailAvailable : undefined
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
                this.emit('matchFound', this.normalizeMatchPayload(message.data));
                break;

            case 'request_assigned':
                this.emit('requestAssigned', this.normalizeMatchPayload(message.data));
                break;

            case 'request_queued':
                this.emit('requestQueued', this.normalizeRequestQueued(message.data));
                break;

            case 'request_cancelled':
                this.emit('requestCancelled', this.normalizeRequestQueued(message.data));
                break;

            case 'interpreter_request':
                this.emit('interpreterRequest', this.normalizeInterpreterRequest(message.data));
                break;

            case 'request_accepted':
                this.emit('requestAccepted', this.normalizeMatchPayload(message.data));
                break;

            case 'request_declined':
                this.emit('requestDeclined', this.normalizeMatchPayload(message.data));
                break;

            case 'meeting_initiated':
                this.emit('meetingInitiated', this.normalizeMatchPayload(message.data));
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
                this.emit('error', isRecord(message.data) ? message.data as QueueErrorPayload : { message: 'Queue server error' });
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
                this.emit('p2pTargetDnd', recordPayload(message.data));
                break;

            case 'p2p_ringing':
                this.emit('p2pRinging', {
                    ...this.normalizeMatchPayload(message.data),
                    calleeName: isRecord(message.data) ? stringValue(message.data.calleeName) : undefined
                });
                break;

            case 'p2p_call_failed':
                this.emit('p2pCallFailed', recordPayload(message.data));
                break;

            case 'p2p_target_offline':
                this.emit('p2pTargetOffline', recordPayload(message.data));
                this.emit('p2p_target_offline', recordPayload(message.data));
                break;

            case 'voicemail_new_message':
                this.emit('voicemail_new_message', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_unread_count':
                this.emit('voicemail_unread_count', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_recording_started':
                this.emit('voicemail_recording_started', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_recording_complete':
                this.emit('voicemail_recording_complete', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_recording_cancelled':
                this.emit('voicemail_recording_cancelled', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_message_deleted':
                this.emit('voicemail_message_deleted', this.normalizeVoicemailPayload(message.data));
                break;

            case 'voicemail_error':
                this.emit('voicemail_error', this.normalizeVoicemailPayload(message.data));
                break;

            case 'vri_invite_prepared':
                this.emit('vriInvitePrepared', this.normalizeVriInvitePrepared(message.data));
                break;

            case 'contacts_changed':
                this.emit('contactsChanged', message.data);
                break;

            default:
                console.warn('Unknown queue message type:', message.type, message);
        }
    }

    public on<K extends keyof QueueEventMap>(event: K, callback: (data: QueueEventMap[K]) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback as (data: QueueEventMap[keyof QueueEventMap]) => void);
    }

    public off<K extends keyof QueueEventMap>(event: K, callback: (data: QueueEventMap[K]) => void) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback as (data: QueueEventMap[keyof QueueEventMap]) => void);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    private emit<K extends keyof QueueEventMap>(event: K, data: QueueEventMap[K]) {
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
    on: <K extends keyof QueueEventMap>(event: K, callback: (data: QueueEventMap[K]) => void) =>
        queueService.instance.on(event, callback),
    off: <K extends keyof QueueEventMap>(event: K, callback: (data: QueueEventMap[K]) => void) =>
        queueService.instance.off(event, callback),
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
