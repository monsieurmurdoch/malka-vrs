/**
 * Middleware for the voicemail feature.
 *
 * Listens for WebSocket messages from the VRS server related to voicemail
 * and translates them into Redux actions.
 *
 * Also listens for p2p_target_offline messages to show the voicemail prompt.
 */

import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { queueService } from '../interpreter-queue/InterpreterQueueService';

import {
    VOICEMAIL_UNREAD_COUNT_UPDATED,
    VOICEMAIL_RECORDING_STARTED,
    VOICEMAIL_RECORDING_COMPLETE,
    VOICEMAIL_RECORDING_CANCELLED,
    VOICEMAIL_MESSAGE_DELETED,
    VOICEMAIL_PROMPT_SHOWN,
    VOICEMAIL_ERROR
} from './actionTypes';
import {
    updateUnreadCount,
    recordingStarted,
    recordingComplete,
    recordingCancelled,
    removeMessage,
    showPrompt
} from './actions';

let _initialized = false;

MiddlewareRegistry.register(store => next => action => {
    const result = next(action);

    // Initialize voicemail WS listeners once
    if (!_initialized && queueService) {
        initializeVoicemailListeners(store);
        _initialized = true;
    }

    return result;
});

/**
 * Wire up WebSocket events from the InterpreterQueueService
 * to Redux dispatches for voicemail.
 */
function initializeVoicemailListeners(store: { dispatch: Function; getState: Function }) {
    if (!queueService?.on) {
        return;
    }

    // New voicemail message notification
    queueService.on('voicemail_new_message', (data: any) => {
        // Refresh the unread count
        store.dispatch(updateUnreadCount(data.count));
    });

    // Unread count push
    queueService.on('voicemail_unread_count', (data: any) => {
        store.dispatch(updateUnreadCount(data.count));
    });

    // Recording started confirmation
    queueService.on('voicemail_recording_started', (data: any) => {
        store.dispatch(recordingStarted({
            messageId: data.messageId,
            roomName: data.roomName,
            maxDurationSeconds: data.maxDurationSeconds
        }));
    });

    // Recording complete
    queueService.on('voicemail_recording_complete', (data: any) => {
        store.dispatch(recordingComplete(data.messageId, data.durationSeconds));
    });

    // Recording cancelled
    queueService.on('voicemail_recording_cancelled', (data: any) => {
        store.dispatch(recordingCancelled());
    });

    // Message deleted
    queueService.on('voicemail_message_deleted', (data: any) => {
        store.dispatch(removeMessage(data.messageId));
    });

    // Error
    queueService.on('voicemail_error', (data: any) => {
        store.dispatch({ type: VOICEMAIL_ERROR, error: data.message });
    });

    // P2P target offline → show voicemail prompt
    queueService.on('p2p_target_offline', (data: any) => {
        if (data.voicemailAvailable) {
            store.dispatch(showPrompt({
                calleeName: data.calleeName,
                calleePhone: data.calleePhone,
                calleeId: data.calleeId
            }));
        }
    });

    console.log('[Voicemail] Middleware initialized');
}
