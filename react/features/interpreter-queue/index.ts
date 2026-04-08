/**
 * VRS Interpreter Queue Feature
 *
 * This feature manages the interpreter queue system for matching
 * clients (deaf/hard-of-hearing users) with available interpreters.
 *
 * Components:
 * - InterpreterQueueService: WebSocket service for real-time queue communication
 * - Redux actions/reducer: State management for queue status
 * - Middleware: Connects queue service events to Redux
 * - UI Components: InterpreterRequestPopup, MinimizedRequestList
 * - QueueStatusIndicator: In-meeting status indicator for clients
 * - InMeetingRequestNotification: In-meeting notifications for interpreters
 * - InterpreterStatusToggle: Status toggle for interpreters (Available/Busy)
 * - QueueStatsDashboard: Queue statistics for interpreters
 */

export * from './actionTypes';
export * from './actions';
export * from './reducer';
export * from './middleware';
export { default as InterpreterQueueService, queueService } from './InterpreterQueueService';
export { default as InterpreterRequestPopup } from './components/web/InterpreterRequestPopup';
export { default as MinimizedRequestList } from './components/web/MinimizedRequestList';
export { default as QueueStatusIndicator } from './components/web/QueueStatusIndicator';
export { default as InMeetingRequestNotification } from './components/web/InMeetingRequestNotification';
export { default as InterpreterStatusToggle } from './components/web/InterpreterStatusToggle';
export { default as QueueStatsDashboard } from './components/web/QueueStatsDashboard';
