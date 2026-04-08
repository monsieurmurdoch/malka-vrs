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
import { queueService } from './InterpreterQueueService';
import { getLocalParticipant } from '../base/participants/functions';
import type { QueueState, InterpreterRequest } from './reducer';

interface RequestQueuedData {
    requestId: string;
    position?: number;
}

interface MatchData {
    callId: string;
    requestId: string;
    roomName: string;
    clientId: string;
    clientName: string;
    interpreterId: string;
    interpreterName: string;
    language: string;
}

interface QueueStatusPayload {
    requestId?: string;
    queuePosition?: number;
    activeInterpreters?: number;
    pendingRequests?: InterpreterRequest[];
}

/**
 * Creates an action to request an interpreter.
 *
 * @param {string} language - The requested language (e.g., 'ASL').
 * @returns {Function}
 */
export function requestInterpreter(language: string = 'ASL') {
    return (dispatch: Function, getState: Function) => {
        const localParticipant = getLocalParticipant(getState());
        const clientName = localParticipant?.name || localParticipant?.displayName || 'Guest';

        // Generate a unique request ID
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Dispatch action to update local state
        dispatch({
            type: REQUEST_INTERPRETER,
            requestId,
            language,
            clientName
        });

        // Send request to queue service
        if (queueService.isConnected()) {
            queueService.requestInterpreter(language, clientName);
        } else {
            console.warn('Queue service not connected - request queued locally only');
        }
    };
}

/**
 * Creates an action to cancel a pending interpreter request.
 *
 * @returns {Function}
 */
export function cancelInterpreterRequest() {
    return (dispatch: Function, getState: () => { 'features/interpreter-queue'?: QueueState }) => {
        const requestId = getState()['features/interpreter-queue']?.currentRequestId;

        dispatch({
            type: CANCEL_REQUEST
        });

        queueService.cancelRequest(requestId);
    };
}

/**
 * Creates an action to accept an interpreter request.
 *
 * @param {string} requestId - The ID of the request to accept.
 * @returns {Function}
 */
export function acceptInterpreterRequest(requestId: string) {
    return (dispatch: Function, getState: () => { 'features/interpreter-queue'?: QueueState }) => {
        const state = getState();
        const request = state['features/interpreter-queue']?.pendingRequests?.find((r: InterpreterRequest) => r.id === requestId);

        dispatch({
            type: REQUEST_ACCEPTED,
            requestId
        });

        if (request?.roomName) {
            queueService.acceptRequest(requestId, request.roomName);
        } else {
            queueService.acceptRequest(requestId);
        }
    };
}

/**
 * Creates an action to decline an interpreter request.
 *
 * @param {string} requestId - The ID of the request to decline.
 * @returns {Function}
 */
export function declineInterpreterRequest(requestId: string) {
    return (dispatch: Function) => {
        dispatch({
            type: REQUEST_DECLINED,
            requestId
        });

        queueService.declineRequest(requestId);
    };
}

/**
 * Action dispatched when a new interpreter request is received (for interpreters).
 */
export function interpreterRequestReceived(request: InterpreterRequest) {
    return {
        type: INTERPRETER_REQUEST_RECEIVED,
        request
    };
}

/**
 * Action dispatched when a match is found.
 */
export function matchFound(matchData: MatchData) {
    return {
        type: MATCH_FOUND,
        matchData
    };
}

/**
 * Action dispatched when a meeting is initiated.
 */
export function meetingInitiated(meetingData: MatchData) {
    return {
        type: MEETING_INITIATED,
        meetingData
    };
}

/**
 * Action dispatched when queue status is updated.
 */
export function queueStatusUpdate(status: QueueStatusPayload) {
    return {
        type: QUEUE_STATUS_UPDATE,
        status
    };
}

/**
 * Action dispatched when queue connection status changes.
 */
export function queueConnectionChanged(connected: boolean) {
    return {
        type: QUEUE_CONNECTION_CHANGED,
        connected
    };
}
