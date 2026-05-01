/**
 * Middleware for the interpreter queue feature.
 *
 * Connects the InterpreterQueueService WebSocket events to the Redux store,
 * enabling real-time updates for interpreter matching and queue status.
 */

import { appNavigate } from '../app/actions';
import { CONFERENCE_LEFT } from '../base/conference/actionTypes';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { getUserRole } from '../base/user-role/functions';
import { isVriApp } from '../base/whitelabel/functions';
import { navigateRoot } from '../mobile/navigation/rootNavigationContainerRef';
import { screen } from '../mobile/navigation/routes';
import { getPersistentItem, getPersistentJson, setPersistentItem } from '../vrs-auth/storage';
import { getSecureItem } from '../vrs-auth/secureStorage';
import { mobileLog } from '../mobile/navigation/logging';

import { queueService } from './InterpreterQueueService';
import {
    interpreterRequestReceived,
    matchFound,
    meetingInitiated,
    queueConnectionChanged,
    queueStatusUpdate
} from './actions';

let lastAutoEnteredQueueRoom: string | undefined;
let callStartTimestamp: number | undefined;

/**
 * Persists match metadata to storage so it's available when the call ends.
 */
function persistMatchData(data: Record<string, unknown>) {
    setPersistentItem('vrs_active_call', JSON.stringify({
        callId: data.callId,
        roomName: data.roomName,
        requestId: data.requestId,
        interpreterName: data.interpreterName,
        interpreterId: data.interpreterId,
        clientName: data.clientName,
        language: data.language,
        startedAt: Date.now()
    }));
    callStartTimestamp = Date.now();
}

/**
 * Writes a local call history entry from the persisted active call data.
 */
function writeLocalCallHistory() {
    const activeCall = getPersistentJson<{
        callId?: string;
        roomName?: string;
        interpreterName?: string;
        interpreterId?: string;
        clientName?: string;
        language?: string;
        startedAt?: number;
    }>('vrs_active_call');

    if (!activeCall?.callId) {
        return;
    }

    const duration = callStartTimestamp
        ? Math.round((Date.now() - callStartTimestamp) / 1000)
        : 0;

    const entry = {
        id: activeCall.callId,
        contactName: activeCall.clientName || 'Unknown',
        phoneNumber: '',
        direction: 'outgoing' as const,
        duration,
        timestamp: new Date(activeCall.startedAt || Date.now()).toISOString(),
        interpreterName: activeCall.interpreterName
    };

    // Append to local call history
    const historyKey = 'vrs_call_history';
    const existing = getPersistentJson<typeof entry[]>(historyKey) || [];
    setPersistentItem(historyKey, JSON.stringify([ entry, ...existing ].slice(0, 100)));

    mobileLog('info', 'call_end_cdr_written', {
        callId: activeCall.callId,
        contactName: entry.contactName,
        duration,
        interpreterName: entry.interpreterName,
        roomName: activeCall.roomName
    });

    callStartTimestamp = undefined;
}

/**
 * Returns the matched queue room name when present.
 *
 * @param {Object} data - The queue match payload.
 * @returns {string|undefined}
 */
function getQueueRoomName(data: Record<string, unknown>) {
    return typeof data.roomName === 'string' && data.roomName.trim()
        ? data.roomName
        : undefined;
}

/**
 * Returns a stable navigation key for a queue match event.
 *
 * @param {Object} data - The queue match payload.
 * @param {string} roomName - The matched room name.
 * @returns {string}
 */
function getQueueNavigationKey(data: Record<string, unknown>, roomName: string) {
    const callId = typeof data.callId === 'string' ? data.callId : undefined;
    const requestId = typeof data.requestId === 'string' ? data.requestId : undefined;

    return callId || requestId || roomName;
}

function autoEnterQueueRoom(store: { dispatch: Function; }, data: Record<string, unknown>) {
    const roomName = getQueueRoomName(data);

    if (!roomName) {
        return;
    }

    const navigationKey = getQueueNavigationKey(data, roomName);

    if (lastAutoEnteredQueueRoom === navigationKey) {
        return;
    }

    lastAutoEnteredQueueRoom = navigationKey;

    // Persist match metadata for CDR/call history on call end
    persistMatchData(data);

    // Clients join matched rooms with mic muted (interpreter speaks for them)
    // and camera on (interpreter needs to see them).
    store.dispatch(appNavigate(roomName, {
        hidePrejoin: true,
        startWithAudioMuted: true,
        startWithVideoMuted: false
    }));
}

function hasInterpreterSessionToken() {
    return Boolean(getSecureItem('vrs_auth_token'));
}

MiddlewareRegistry.register((store: { _interpreterQueueInitialized?: boolean; dispatch: Function; getState: Function; }) =>
    (next: Function) => (action: { [key: string]: unknown; type: string; }) => {
        const result = next(action);

        if (action.type === CONFERENCE_LEFT) {
            // Write local call history before clearing active call
            writeLocalCallHistory();
            queueService.endActiveCall();
            lastAutoEnteredQueueRoom = undefined;

            // Route back to the correct home screen based on role
            const userRole = getPersistentItem('vrs_user_role');
            let homeScreen;

            if (userRole === 'interpreter') {
                homeScreen = screen.interpreter.home;
            } else {
                homeScreen = isVriApp() ? screen.vri.console : screen.vrs.home;
            }
            navigateRoot(homeScreen);
        }

        // Initialize queue service listeners on first action
        if (!store._interpreterQueueInitialized) {
            const initialized = initializeInterpreterQueue(store);

            if (initialized) {
                store._interpreterQueueInitialized = true;
            }
        }

        return result;
    });

/**
 * Initializes the interpreter queue by setting up event listeners
 * on the queue service and connecting them to Redux actions.
 *
 * @param {Object} store - The Redux store.
 */
function initializeInterpreterQueue(store: { dispatch: Function; getState: Function; }) {
    const userRole = getUserRole();

    console.log('[InterpreterQueue] Initializing for role:', userRole);

    if (userRole === 'interpreter' && !hasInterpreterSessionToken()) {
        console.log('[InterpreterQueue] Waiting for interpreter authentication before connecting');

        return false;
    }

    // Connection status events - all users
    queueService.on('connection', (data: { connected: boolean; }) => {
        store.dispatch(queueConnectionChanged(data.connected));
    });

    // Client-specific events
    if (userRole === 'client') {
        // Client receives notification when their request is queued
        queueService.on('requestQueued', (data: { position?: number; requestId?: string; }) => {
            console.log('[InterpreterQueue] Request queued, position:', data.position);
            store.dispatch(queueStatusUpdate({
                requestId: data.requestId,
                queuePosition: data.position,
                activeInterpreters: 0
            }));
        });

        // Client receives notification when a match is found
        queueService.on('matchFound', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] Match found:', data);
            store.dispatch(matchFound(data as any));
            autoEnterQueueRoom(store, data);
        });

        // Client receives notification when meeting is initiated
        queueService.on('meetingInitiated', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] Meeting initiated:', data);
            store.dispatch(meetingInitiated(data as any));
            autoEnterQueueRoom(store, data);
        });

        // Client receives notification when request is cancelled
        queueService.on('requestCancelled', () => {
            console.log('[InterpreterQueue] Request cancelled');
        });

        // P2P call: ringing → auto-enter the room
        queueService.on('p2pRinging', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] P2P ringing:', data);
            persistMatchData({
                callId: data.callId,
                roomName: data.roomName,
                clientName: data.calleeName,
                language: 'ASL'
            });
            const roomName = data.roomName as string;

            if (roomName) {
                store.dispatch(appNavigate(roomName, {
                    hidePrejoin: true,
                    startWithAudioMuted: true,
                    startWithVideoMuted: false
                }));
            }
        });

        // P2P call: target offline / DND / failed — just log
        queueService.on('p2pCallFailed', (data: { message?: string }) => {
            console.warn('[InterpreterQueue] P2P call failed:', data.message);
        });
        queueService.on('p2pTargetOffline', (data: { calleeName?: string }) => {
            console.warn('[InterpreterQueue] P2P target offline:', data.calleeName);
        });
        queueService.on('p2pTargetDnd', (data: { calleeName?: string }) => {
            console.warn('[InterpreterQueue] P2P target DND:', data.calleeName);
        });
    }

    // Interpreter-specific events
    if (userRole === 'interpreter') {
        // Interpreter receives incoming interpreter requests
        queueService.on('interpreterRequest', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] New interpreter request:', data);
            store.dispatch(interpreterRequestReceived(data as any));
        });

        // Interpreter receives notification when request is assigned
        queueService.on('requestAssigned', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] Request assigned:', data);
        });

        // Queue status updates
        queueService.on('queueStatus', (data: { activeInterpreters?: unknown[]; pendingRequests?: unknown[]; }) => {
            store.dispatch(queueStatusUpdate({
                activeInterpreters: data.activeInterpreters?.length || 0,
                pendingRequests: (data.pendingRequests || []) as any[],
                queuePosition: undefined
            }));
        });
    }

    // Common events for both roles
    queueService.on('requestAccepted', (data: Record<string, unknown>) => {
        console.log('[InterpreterQueue] Request accepted:', data);
    });

    queueService.on('requestDeclined', (data: Record<string, unknown>) => {
        console.log('[InterpreterQueue] Request declined:', data);
    });

    // Error handling
    queueService.on('error', (data: { message?: string; }) => {
        console.error('[InterpreterQueue] Service error:', data);
    });

    console.log('[InterpreterQueue] Middleware initialized');

    return true;
}
