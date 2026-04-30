/**
 * Middleware for the interpreter queue feature.
 *
 * Connects the InterpreterQueueService WebSocket events to the Redux store,
 * enabling real-time updates for interpreter matching and queue status.
 */

import { CONFERENCE_LEFT } from '../base/conference/actionTypes';
import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { getUserRole } from '../base/user-role/functions';
import { getPersistentItem } from '../vrs-auth/storage';

import { queueService } from './InterpreterQueueService';
import {
    interpreterRequestReceived,
    matchFound,
    meetingInitiated,
    queueConnectionChanged,
    queueStatusUpdate
} from './actions';

function hasInterpreterSessionToken() {
    return Boolean(getPersistentItem('vrs_auth_token'));
}

MiddlewareRegistry.register((store: { dispatch: Function; getState: Function; _interpreterQueueInitialized?: boolean }) =>
    (next: Function) => (action: { type: string; [key: string]: unknown }) => {
    const result = next(action);

    if (action.type === CONFERENCE_LEFT) {
        queueService.endActiveCall();
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
function initializeInterpreterQueue(store: { dispatch: Function; getState: Function }) {
    const userRole = getUserRole();
    console.log('[InterpreterQueue] Initializing for role:', userRole);

    if (userRole === 'interpreter' && !hasInterpreterSessionToken()) {
        console.log('[InterpreterQueue] Waiting for interpreter authentication before connecting');

        return false;
    }

    // Connection status events - all users
    queueService.on('connection', (data: { connected: boolean }) => {
        store.dispatch(queueConnectionChanged(data.connected));
    });

    // Client-specific events
    if (userRole === 'client') {
        // Client receives notification when their request is queued
        queueService.on('requestQueued', (data: { requestId?: string; position?: number }) => {
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
        });

        // Client receives notification when meeting is initiated
        queueService.on('meetingInitiated', (data: Record<string, unknown>) => {
            console.log('[InterpreterQueue] Meeting initiated:', data);
            store.dispatch(meetingInitiated(data as any));
        });

        // Client receives notification when request is cancelled
        queueService.on('requestCancelled', () => {
            console.log('[InterpreterQueue] Request cancelled');
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
        queueService.on('queueStatus', (data: { activeInterpreters?: unknown[]; pendingRequests?: unknown[] }) => {
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
    queueService.on('error', (data: { message?: string }) => {
        console.error('[InterpreterQueue] Service error:', data);
    });

    console.log('[InterpreterQueue] Middleware initialized');

    return true;
}
