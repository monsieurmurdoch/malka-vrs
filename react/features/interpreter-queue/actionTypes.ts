/**
 * The type of the Redux action which is dispatched when an interpreter request is made.
 */
export const REQUEST_INTERPRETER = 'REQUEST_INTERPRETER';

/**
 * The type of the Redux action which is dispatched when an interpreter request is cancelled.
 */
export const CANCEL_REQUEST = 'CANCEL_REQUEST';

/**
 * The type of the Redux action which is dispatched when a new interpreter request is received.
 */
export const INTERPRETER_REQUEST_RECEIVED = 'INTERPRETER_REQUEST_RECEIVED';

/**
 * The type of the Redux action which is dispatched when an interpreter request is accepted.
 */
export const REQUEST_ACCEPTED = 'REQUEST_ACCEPTED';

/**
 * The type of the Redux action which is dispatched when an interpreter request is declined.
 */
export const REQUEST_DECLINED = 'REQUEST_DECLINED';

/**
 * The type of the Redux action which is dispatched when a match is found.
 */
export const MATCH_FOUND = 'MATCH_FOUND';

/**
 * The type of the Redux action which is dispatched when a meeting is initiated.
 */
export const MEETING_INITIATED = 'MEETING_INITIATED';

/**
 * The type of the Redux action which is dispatched when the queue status is updated.
 */
export const QUEUE_STATUS_UPDATE = 'QUEUE_STATUS_UPDATE';

/**
 * The type of the Redux action which is dispatched when the queue connection status changes.
 */
export const QUEUE_CONNECTION_CHANGED = 'QUEUE_CONNECTION_CHANGED';
