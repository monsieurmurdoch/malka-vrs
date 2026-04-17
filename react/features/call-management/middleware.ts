/**
 * Middleware for the Call Management & UX feature.
 *
 * Listens for WebSocket events from InterpreterQueueService and
 * dispatches corresponding Redux actions.
 */

import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { queueService } from '../interpreter-queue/InterpreterQueueService';

import {
    callWaitingIncoming,
    callOnHold,
    callOffHold,
    chatMessageReceived,
    chatHistoryLoaded,
    preferencesUpdated,
    p2pTargetDnd
} from './actions';

import {
    CALL_TRANSFER_INITIATED,
    CONFERENCE_INVITE,
    CONFERENCE_ADD_RINGING,
    CONFERENCE_ADD_OFFLINE,
    CONFERENCE_REMOVED,
    CONFERENCE_PARTICIPANT_REMOVED
} from './actionTypes';

let _initialized = false;

MiddlewareRegistry.register(store => next => action => {
    const result = next(action);

    if (!_initialized && queueService) {
        initializeCallManagementListeners(store);
        _initialized = true;
    }

    return result;
});

function initializeCallManagementListeners(store: { dispatch: Function; getState: Function }) {
    if (!queueService?.on) {
        return;
    }

    // Call Waiting
    queueService.on('callWaitingIncoming', (data: any) => {
        store.dispatch(callWaitingIncoming(data));
    });

    queueService.on('callWaitingResponded', (_data: any) => {
        // Handled by reducer via the action dispatched from the component
    });

    // Call Hold
    queueService.on('callOnHold', (data: any) => {
        store.dispatch(callOnHold(data));
    });

    queueService.on('callOffHold', (data: any) => {
        store.dispatch(callOffHold(data));
    });

    // Call Transfer
    queueService.on('callTransferInitiated', (data: any) => {
        store.dispatch({ type: CALL_TRANSFER_INITIATED, data });
    });

    // Conference
    queueService.on('conferenceInvite', (data: any) => {
        store.dispatch({ type: CONFERENCE_INVITE, data });
    });

    queueService.on('conferenceAddRinging', (data: any) => {
        store.dispatch({ type: CONFERENCE_ADD_RINGING, data });
    });

    queueService.on('conferenceAddOffline', (data: any) => {
        store.dispatch({ type: CONFERENCE_ADD_OFFLINE, data });
    });

    queueService.on('conferenceRemoved', (data: any) => {
        store.dispatch({ type: CONFERENCE_REMOVED, data });
    });

    queueService.on('conferenceParticipantRemoved', (data: any) => {
        store.dispatch({ type: CONFERENCE_PARTICIPANT_REMOVED, data });
    });

    // Chat
    queueService.on('chatMessage', (data: any) => {
        store.dispatch(chatMessageReceived(data));
    });

    queueService.on('chatHistory', (data: any) => {
        store.dispatch(chatHistoryLoaded(data));
    });

    // Preferences
    queueService.on('preferencesUpdated', (data: any) => {
        store.dispatch(preferencesUpdated(data));

        // Apply dark mode on <body>
        if (data.dark_mode) {
            applyDarkMode(data.dark_mode);
        }
    });

    // P2P Target DND
    queueService.on('p2pTargetDnd', (data: any) => {
        store.dispatch(p2pTargetDnd(data));
    });
}

/**
 * Apply dark mode class to the document body.
 */
function applyDarkMode(mode: 'light' | 'dark' | 'system') {
    const body = document.body;

    body.classList.remove('vrs-dark', 'vrs-light');

    if (mode === 'dark') {
        body.classList.add('vrs-dark');
    } else if (mode === 'light') {
        body.classList.add('vrs-light');
    } else {
        // system — detect OS preference
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;

        body.classList.add(prefersDark ? 'vrs-dark' : 'vrs-light');
    }
}

// Export for use by the dark mode component
export { applyDarkMode };
