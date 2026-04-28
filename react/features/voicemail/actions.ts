/**
 * Action creators for the voicemail feature.
 */

import {
    VOICEMAIL_INBOX_LOADED,
    VOICEMAIL_INBOX_LOADING,
    VOICEMAIL_MESSAGE_SELECTED,
    VOICEMAIL_MESSAGE_DELETED,
    VOICEMAIL_MESSAGE_SEEN,
    VOICEMAIL_UNREAD_COUNT_UPDATED,
    VOICEMAIL_RECORDING_STARTED,
    VOICEMAIL_RECORDING_COMPLETE,
    VOICEMAIL_RECORDING_CANCELLED,
    VOICEMAIL_PROMPT_SHOWN,
    VOICEMAIL_PROMPT_DISMISSED,
    VOICEMAIL_PLAYER_OPENED,
    VOICEMAIL_PLAYER_CLOSED,
    VOICEMAIL_ERROR,
    VOICEMAIL_CLEAR_ERROR
} from './actionTypes';
import type { VoicemailMessage, VoicemailPromptData, VoicemailRecordingSession } from './types';
import {
    fetchUnreadCount,
    fetchVoicemailInbox,
    fetchVoicemailMessage,
    deleteVoicemailMessage as apiDeleteMessage
} from './functions';

/**
 * Load the voicemail inbox from the server.
 */
export function loadInbox(limit = 20, offset = 0) {
    return async (dispatch: Function, getState: Function) => {
        dispatch({ type: VOICEMAIL_INBOX_LOADING });
        try {
            const result = await fetchVoicemailInbox(getState, limit, offset);
            dispatch({
                type: VOICEMAIL_INBOX_LOADED,
                messages: result.messages,
                totalCount: result.total,
                unreadCount: result.unreadCount
            });
        } catch (error: any) {
            dispatch({ type: VOICEMAIL_ERROR, error: error.message });
        }
    };
}

/**
 * Load just the unread count for the floating badge.
 */
export function loadUnreadCount() {
    return async (dispatch: Function, getState: Function) => {
        try {
            const count = await fetchUnreadCount(getState);

            dispatch({
                type: VOICEMAIL_UNREAD_COUNT_UPDATED,
                count
            });
        } catch (error: any) {
            dispatch({ type: VOICEMAIL_ERROR, error: error.message });
        }
    };
}

/**
 * Select and open a message for playback.
 */
export function openMessage(messageId: string) {
    return async (dispatch: Function, getState: Function) => {
        try {
            const message = await fetchVoicemailMessage(getState, messageId);
            dispatch({
                type: VOICEMAIL_MESSAGE_SELECTED,
                message
            });
            dispatch({ type: VOICEMAIL_PLAYER_OPENED });
        } catch (error: any) {
            dispatch({ type: VOICEMAIL_ERROR, error: error.message });
        }
    };
}

/**
 * Close the video player.
 */
export function closePlayer() {
    return { type: VOICEMAIL_PLAYER_CLOSED };
}

/**
 * Delete a voicemail message.
 */
export function removeMessage(messageId: string) {
    return async (dispatch: Function, getState: Function) => {
        try {
            await apiDeleteMessage(getState, messageId);
            dispatch({ type: VOICEMAIL_MESSAGE_DELETED, messageId });
        } catch (error: any) {
            dispatch({ type: VOICEMAIL_ERROR, error: error.message });
        }
    };
}

/**
 * Mark a message as seen.
 */
export function markSeen(messageId: string) {
    return { type: VOICEMAIL_MESSAGE_SEEN, messageId };
}

/**
 * Update the unread count (from WebSocket push).
 */
export function updateUnreadCount(count: number) {
    return { type: VOICEMAIL_UNREAD_COUNT_UPDATED, count };
}

/**
 * Recording started (from WebSocket or REST response).
 */
export function recordingStarted(session: VoicemailRecordingSession) {
    return { type: VOICEMAIL_RECORDING_STARTED, session };
}

/**
 * Recording completed (from WebSocket).
 */
export function recordingComplete(messageId: string, durationSeconds: number) {
    return { type: VOICEMAIL_RECORDING_COMPLETE, messageId, durationSeconds };
}

/**
 * Recording cancelled.
 */
export function recordingCancelled() {
    return { type: VOICEMAIL_RECORDING_CANCELLED };
}

/**
 * Show the "leave video message?" prompt after a missed call.
 */
export function showPrompt(data: VoicemailPromptData) {
    return { type: VOICEMAIL_PROMPT_SHOWN, data };
}

/**
 * Dismiss the voicemail prompt.
 */
export function dismissPrompt() {
    return { type: VOICEMAIL_PROMPT_DISMISSED };
}

/**
 * Clear the current error.
 */
export function clearError() {
    return { type: VOICEMAIL_CLEAR_ERROR };
}
