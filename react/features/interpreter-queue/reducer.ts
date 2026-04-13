import ReducerRegistry from '../base/redux/ReducerRegistry';

import {
    REQUEST_INTERPRETER,
    CANCEL_REQUEST,
    REQUEST_ACCEPTED,
    REQUEST_DECLINED,
    MATCH_FOUND,
    MEETING_INITIATED,
    QUEUE_STATUS_UPDATE,
    QUEUE_CONNECTION_CHANGED,
    INTERPRETER_REQUEST_RECEIVED
} from './actionTypes';

export interface InterpreterRequest {
    id: string;
    clientName: string;
    language: string;
    timestamp: number;
    roomName?: string;
}

export interface QueueState {
    // Client-side state
    isRequestPending: boolean;
    currentRequestId?: string;
    requestLanguage?: string;

    // Interpreter-side state
    pendingRequests: InterpreterRequest[];

    // Shared state
    isConnected: boolean;
    matchFound: boolean;
    matchData?: MatchData;
    queuePosition?: number;
    activeInterpreters: number;
}

export interface MatchData {
    callId: string;
    requestId: string;
    roomName: string;
    clientId: string;
    clientName: string;
    interpreterId: string;
    interpreterName: string;
    language: string;
}

interface QueueAction {
    type: string;
    requestId?: string;
    language?: string;
    clientName?: string;
    request?: InterpreterRequest;
    matchData?: MatchData;
    meetingData?: MatchData;
    status?: {
        requestId?: string;
        queuePosition?: number;
        activeInterpreters?: number;
        pendingRequests?: InterpreterRequest[];
    };
    connected?: boolean;
}

const INITIAL_STATE: QueueState = {
    isRequestPending: false,
    pendingRequests: [],
    isConnected: false,
    matchFound: false,
    activeInterpreters: 0
};

/**
 * Reducer function for the interpreter queue feature.
 *
 * @param {QueueState} state - The current Redux state.
 * @param {Object} action - The dispatched action.
 * @returns {QueueState}
 */
ReducerRegistry.register<QueueState>('features/interpreter-queue',
    (state: QueueState = INITIAL_STATE, action: QueueAction): QueueState => {
        switch (action.type) {
            case REQUEST_INTERPRETER:
                return {
                    ...state,
                    isRequestPending: true,
                    currentRequestId: action.requestId,
                    requestLanguage: action.language,
                    matchFound: false,
                    matchData: undefined,
                    queuePosition: undefined
                };

            case CANCEL_REQUEST:
                return {
                    ...state,
                    isRequestPending: false,
                    currentRequestId: undefined,
                    matchFound: false,
                    matchData: undefined,
                    queuePosition: undefined
                };

            case INTERPRETER_REQUEST_RECEIVED:
                if (!action.request) {
                    return state;
                }

                return {
                    ...state,
                    pendingRequests: [
                        ...state.pendingRequests,
                        {
                            id: action.request.id,
                            clientName: action.request.clientName,
                            language: action.request.language,
                            timestamp: action.request.timestamp || Date.now(),
                            roomName: action.request.roomName
                        }
                    ]
                };

            case REQUEST_ACCEPTED:
                return {
                    ...state,
                    pendingRequests: state.pendingRequests.filter(r => r.id !== action.requestId)
                };

            case REQUEST_DECLINED:
                return {
                    ...state,
                    pendingRequests: state.pendingRequests.filter(r => r.id !== action.requestId)
                };

            case MATCH_FOUND:
                return {
                    ...state,
                    isRequestPending: false,
                    matchFound: true,
                    matchData: action.matchData
                };

            case MEETING_INITIATED:
                return {
                    ...state,
                    isRequestPending: false,
                    matchData: action.meetingData
                };

            case QUEUE_STATUS_UPDATE:
                if (!action.status) {
                    return state;
                }

                return {
                    ...state,
                    currentRequestId: action.status.requestId || state.currentRequestId,
                    activeInterpreters: action.status.activeInterpreters || state.activeInterpreters,
                    pendingRequests: action.status.pendingRequests || state.pendingRequests,
                    queuePosition: typeof action.status.queuePosition === 'number'
                        ? action.status.queuePosition
                        : state.queuePosition
                };

            case QUEUE_CONNECTION_CHANGED:
                return {
                    ...state,
                    isConnected: Boolean(action.connected)
                };

            default:
                return state;
        }
    });
