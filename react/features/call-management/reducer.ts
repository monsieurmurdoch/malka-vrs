/**
 * Reducer for Call Management & UX feature.
 */

import ReducerRegistry from '../base/redux/ReducerRegistry';

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

export interface CallManagementState {
    // Call waiting
    incomingCall: {
        callId: string;
        roomName: string;
        callerName: string;
        callerId: string;
        currentCallId: string;
    } | null;
    callWaitingAction: string | null;

    // Call hold
    onHold: boolean;
    holdCallId: string | null;
    heldBy: string | null;

    // Transfer
    activeTransfer: {
        transferId: string;
        callId: string;
        transferType: string;
        toPhoneNumber: string | null;
        interpreterName: string | null;
    } | null;
    transferStatus: 'idle' | 'pending' | 'accepted' | 'completed' | 'cancelled' | 'failed';

    // Conference
    conferenceInvite: {
        callId: string;
        roomName: string;
        invitedByName: string;
        invitedById: string;
    } | null;
    conferenceRinging: string | null; // targetClientId

    // Chat
    chatMessages: Array<{
        id: string;
        callId: string;
        senderId: string;
        senderName: string;
        message: string;
        timestamp: number;
    }>;
    chatPanelOpen: boolean;
    currentChatCallId: string | null;

    // Preferences
    preferences: {
        dnd_enabled: boolean;
        dnd_message: string | null;
        dark_mode: 'light' | 'dark' | 'system';
        camera_default_off: boolean;
        mic_default_off: boolean;
        skip_waiting_room: boolean;
        remember_media_permissions: boolean;
    };

    // P2P DND
    targetDnd: {
        calleeName: string;
        calleePhone: string;
        calleeId: string;
        voicemailAvailable: boolean;
    } | null;
}

const DEFAULT_PREFERENCES = {
    dnd_enabled: false,
    dnd_message: null,
    dark_mode: 'system' as const,
    camera_default_off: true,
    mic_default_off: true,
    skip_waiting_room: false,
    remember_media_permissions: true
};

const INITIAL_STATE: CallManagementState = {
    incomingCall: null,
    callWaitingAction: null,
    onHold: false,
    holdCallId: null,
    heldBy: null,
    activeTransfer: null,
    transferStatus: 'idle',
    conferenceInvite: null,
    conferenceRinging: null,
    chatMessages: [],
    chatPanelOpen: false,
    currentChatCallId: null,
    preferences: { ...DEFAULT_PREFERENCES },
    targetDnd: null
};

ReducerRegistry.register<CallManagementState>('features/call-management', (state: CallManagementState = INITIAL_STATE, action: any) => {
    switch (action.type) {
    // Call Waiting
    case CALL_WAITING_INCOMING:
        return {
            ...state,
            incomingCall: action.data,
            callWaitingAction: null
        };

    case CALL_WAITING_RESPONDED:
        return {
            ...state,
            callWaitingAction: action.data.action,
            incomingCall: action.data.action === 'reject' ? null : state.incomingCall
        };

    case CALL_WAITING_DISMISS:
        return {
            ...state,
            incomingCall: null,
            callWaitingAction: null
        };

    // Call Hold
    case CALL_HOLD_UPDATED:
        return {
            ...state,
            onHold: action.data.onHold,
            holdCallId: action.data.callId
        };

    case CALL_ON_HOLD:
        return {
            ...state,
            onHold: true,
            holdCallId: action.data.callId,
            heldBy: action.data.heldBy
        };

    case CALL_OFF_HOLD:
        return {
            ...state,
            onHold: false,
            holdCallId: null,
            heldBy: null
        };

    // Transfer
    case CALL_TRANSFER_INITIATED:
        return {
            ...state,
            activeTransfer: action.data,
            transferStatus: 'pending'
        };

    case CALL_TRANSFER_PENDING:
        return {
            ...state,
            transferStatus: 'pending'
        };

    case CALL_TRANSFER_ACCEPTED:
        return {
            ...state,
            transferStatus: 'accepted'
        };

    case CALL_TRANSFER_CANCELLED:
        return {
            ...state,
            activeTransfer: null,
            transferStatus: 'cancelled'
        };

    // Conference
    case CONFERENCE_INVITE:
        return {
            ...state,
            conferenceInvite: action.data
        };

    case CONFERENCE_ADD_RINGING:
        return {
            ...state,
            conferenceRinging: action.data.targetClientId
        };

    case CONFERENCE_ADD_OFFLINE:
        return {
            ...state,
            conferenceRinging: null
        };

    case CONFERENCE_PARTICIPANT_REMOVED:
        return {
            ...state,
            conferenceRinging: null
        };

    // Chat
    case CHAT_MESSAGE_RECEIVED:
        return {
            ...state,
            chatMessages: [ ...state.chatMessages, action.data ]
        };

    case CHAT_MESSAGE_SENT:
        return {
            ...state,
            chatMessages: [
                ...state.chatMessages,
                {
                    ...action.data,
                    senderId: 'self',
                    senderName: 'You',
                    timestamp: Date.now()
                }
            ]
        };

    case CHAT_HISTORY_LOADED:
        return {
            ...state,
            chatMessages: action.data.messages,
            currentChatCallId: action.data.callId
        };

    case CHAT_PANEL_TOGGLE:
        return {
            ...state,
            chatPanelOpen: !state.chatPanelOpen
        };

    // Preferences
    case PREFERENCES_UPDATED:
        return {
            ...state,
            preferences: {
                ...state.preferences,
                ...action.data
            }
        };

    case DND_TOGGLED:
        return {
            ...state,
            preferences: {
                ...state.preferences,
                dnd_enabled: action.data.enabled,
                dnd_message: action.data.message ?? state.preferences.dnd_message
            }
        };

    case DARK_MODE_CHANGED:
        return {
            ...state,
            preferences: {
                ...state.preferences,
                dark_mode: action.data.mode
            }
        };

    // P2P Target DND
    case P2P_TARGET_DND:
        return {
            ...state,
            targetDnd: action.data
        };

    default:
        return state;
    }
});
