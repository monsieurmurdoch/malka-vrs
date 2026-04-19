/**
 * Redux actions for Call Management & UX feature.
 */

import { queueService } from '../interpreter-queue/InterpreterQueueService';

import {
    CALL_WAITING_INCOMING,
    CALL_WAITING_RESPONDED,
    CALL_WAITING_DISMISS,
    CALL_HOLD_UPDATED,
    CALL_ON_HOLD,
    CALL_OFF_HOLD,
    CALL_TRANSFER_INITIATED,
    CALL_TRANSFER_PENDING,
    CALL_TRANSFER_ACCEPTED,
    CALL_TRANSFER_CANCELLED,
    CONFERENCE_INVITE,
    CONFERENCE_ADD_RINGING,
    CONFERENCE_ADD_OFFLINE,
    CONFERENCE_REMOVED,
    CONFERENCE_PARTICIPANT_REMOVED,
    CHAT_MESSAGE_RECEIVED,
    CHAT_MESSAGE_SENT,
    CHAT_HISTORY_LOADED,
    CHAT_PANEL_TOGGLE,
    PREFERENCES_UPDATED,
    DND_TOGGLED,
    DARK_MODE_CHANGED,
    P2P_TARGET_DND
} from './actionTypes';

// ---- Call Waiting ----

export const callWaitingIncoming = (data: {
    callId: string;
    roomName: string;
    callerName: string;
    callerId: string;
    calleeId: string;
    currentCallId: string;
}) => ({
    type: CALL_WAITING_INCOMING,
    data
});

export const callWaitingRespond = (
    incomingCallId: string,
    currentCallId: string,
    action: 'accept' | 'reject' | 'hold_and_accept'
) => {
    queueService?.send({
        type: 'call_waiting_respond',
        data: { incomingCallId, currentCallId, action }
    });

    return { type: CALL_WAITING_RESPONDED, data: { incomingCallId, action } };
};

export const callWaitingDismiss = () => ({
    type: CALL_WAITING_DISMISS
});

// ---- Call Hold ----

export const toggleCallHold = (callId: string, onHold: boolean) => {
    queueService?.send({
        type: 'call_hold',
        data: { callId, onHold }
    });

    return { type: CALL_HOLD_UPDATED, data: { callId, onHold } };
};

export const callOnHold = (data: { callId: string; heldBy: string }) => ({
    type: CALL_ON_HOLD,
    data
});

export const callOffHold = (data: { callId: string; heldBy: string }) => ({
    type: CALL_OFF_HOLD,
    data
});

// ---- Call Transfer ----

export const initiateCallTransfer = (
    callId: string,
    toPhoneNumber: string | undefined,
    toInterpreterId: string | undefined,
    transferType: 'blind' | 'attended' = 'blind',
    reason?: string
) => {
    queueService?.send({
        type: 'call_transfer',
        data: { callId, toPhoneNumber, toInterpreterId, transferType, reason }
    });

    return { type: CALL_TRANSFER_PENDING, data: { callId } };
};

export const acceptCallTransfer = (transferId: string) => {
    queueService?.send({
        type: 'call_transfer_accept',
        data: { transferId }
    });

    return { type: CALL_TRANSFER_ACCEPTED, data: { transferId } };
};

export const cancelCallTransfer = (transferId: string) => {
    queueService?.send({
        type: 'call_transfer_cancel',
        data: { transferId }
    });

    return { type: CALL_TRANSFER_CANCELLED, data: { transferId } };
};

// ---- Conference (3-way) ----

export const addConferenceParticipant = (callId: string, phoneNumber?: string, clientId?: string) => {
    queueService?.send({
        type: 'conference_add',
        data: { callId, phoneNumber, clientId }
    });

    return { type: CONFERENCE_ADD_RINGING, data: { callId } };
};

export const removeConferenceParticipant = (callId: string, participantId: string) => {
    queueService?.send({
        type: 'conference_remove',
        data: { callId, participantId }
    });

    return { type: CONFERENCE_PARTICIPANT_REMOVED, data: { callId, participantId } };
};

export const conferenceInvite = (data: any) => ({
    type: CONFERENCE_INVITE,
    data
});

// ---- In-call Chat ----

export const sendChatMessage = (callId: string, message: string) => {
    queueService?.send({
        type: 'chat_send',
        data: { callId, message }
    });

    return { type: CHAT_MESSAGE_SENT, data: { callId, message } };
};

export const requestChatHistory = (callId: string, limit = 100, offset = 0) => {
    queueService?.send({
        type: 'chat_history',
        data: { callId, limit, offset }
    });

    return { type: CHAT_HISTORY_LOADED, data: { callId, messages: [] } };
};

export const chatMessageReceived = (data: any) => ({
    type: CHAT_MESSAGE_RECEIVED,
    data
});

export const chatHistoryLoaded = (data: { callId: string; messages: any[] }) => ({
    type: CHAT_HISTORY_LOADED,
    data
});

export const toggleChatPanel = () => ({
    type: CHAT_PANEL_TOGGLE
});

// ---- Client Preferences ----

export const preferencesUpdated = (data: any) => ({
    type: PREFERENCES_UPDATED,
    data
});

export const toggleDND = (enabled: boolean, message?: string) => {
    queueService?.send({
        type: 'preferences_update',
        data: { dnd_enabled: enabled, dnd_message: message || '' }
    });

    return { type: DND_TOGGLED, data: { enabled, message } };
};

export const setDarkMode = (mode: 'light' | 'dark' | 'system') => {
    queueService?.send({
        type: 'preferences_update',
        data: { dark_mode: mode }
    });

    return { type: DARK_MODE_CHANGED, data: { mode } };
};

// ---- P2P Target DND ----

export const p2pTargetDnd = (data: any) => ({
    type: P2P_TARGET_DND,
    data
});
