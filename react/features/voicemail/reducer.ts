/**
 * Reducer for the voicemail feature.
 */

import ReducerRegistry from '../base/redux/ReducerRegistry';

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
import type { VoicemailState, VoicemailMessage, VoicemailPromptData, VoicemailRecordingSession } from './types';

const INITIAL_STATE: VoicemailState = {
    messages: [],
    totalCount: 0,
    unreadCount: 0,
    isLoading: false,
    inboxOpen: false,
    currentMessage: null,
    playbackUrl: null,
    isPlayerOpen: false,
    isRecording: false,
    recordingSession: null,
    isPromptVisible: false,
    promptData: null,
    error: null
};

interface VoicemailAction {
    type: string;
    messages?: VoicemailMessage[];
    totalCount?: number;
    unreadCount?: number;
    count?: number;
    message?: VoicemailMessage;
    messageId?: string;
    durationSeconds?: number;
    session?: VoicemailRecordingSession;
    data?: VoicemailPromptData;
    error?: string;
}

ReducerRegistry.register<VoicemailState>('features/voicemail',
    (state = INITIAL_STATE, action: VoicemailAction): VoicemailState => {
        switch (action.type) {
            case VOICEMAIL_INBOX_LOADING:
                return { ...state, isLoading: true };

            case VOICEMAIL_INBOX_LOADED:
                return {
                    ...state,
                    messages: action.messages || [],
                    totalCount: action.totalCount || 0,
                    unreadCount: action.unreadCount || 0,
                    isLoading: false
                };

            case VOICEMAIL_MESSAGE_SELECTED:
                return {
                    ...state,
                    currentMessage: action.message || null,
                    playbackUrl: action.message?.playbackUrl || null
                };

            case VOICEMAIL_MESSAGE_DELETED:
                return {
                    ...state,
                    messages: state.messages.filter(m => m.id !== action.messageId),
                    totalCount: Math.max(0, state.totalCount - 1),
                    isPlayerOpen: state.currentMessage?.id === action.messageId
                        ? false
                        : state.isPlayerOpen,
                    currentMessage: state.currentMessage?.id === action.messageId
                        ? null
                        : state.currentMessage
                };

            case VOICEMAIL_MESSAGE_SEEN: {
                const messageId = action.messageId;

                return {
                    ...state,
                    messages: state.messages.map(m =>
                        m.id === messageId ? { ...m, seen: true } : m
                    ),
                    unreadCount: Math.max(0, state.unreadCount - 1)
                };
            }

            case VOICEMAIL_UNREAD_COUNT_UPDATED:
                return { ...state, unreadCount: action.count || 0 };

            case VOICEMAIL_RECORDING_STARTED:
                return {
                    ...state,
                    isRecording: true,
                    recordingSession: action.session || null,
                    isPromptVisible: false,
                    promptData: null
                };

            case VOICEMAIL_RECORDING_COMPLETE:
                return {
                    ...state,
                    isRecording: false,
                    recordingSession: null
                };

            case VOICEMAIL_RECORDING_CANCELLED:
                return {
                    ...state,
                    isRecording: false,
                    recordingSession: null
                };

            case VOICEMAIL_PROMPT_SHOWN:
                return {
                    ...state,
                    isPromptVisible: true,
                    promptData: action.data || null
                };

            case VOICEMAIL_PROMPT_DISMISSED:
                return {
                    ...state,
                    isPromptVisible: false,
                    promptData: null
                };

            case VOICEMAIL_PLAYER_OPENED:
                return { ...state, isPlayerOpen: true };

            case VOICEMAIL_PLAYER_CLOSED:
                return {
                    ...state,
                    isPlayerOpen: false,
                    currentMessage: null,
                    playbackUrl: null
                };

            case VOICEMAIL_ERROR:
                return {
                    ...state,
                    error: action.error || 'Unknown error',
                    isLoading: false,
                    isRecording: false,
                    recordingSession: null
                };

            case VOICEMAIL_CLEAR_ERROR:
                return { ...state, error: null };

            case 'VOICEMAIL_OPEN_INBOX':
                return { ...state, inboxOpen: true };

            case 'VOICEMAIL_CLOSE_INBOX':
                return { ...state, inboxOpen: false };

            default:
                return state;
        }
    });
