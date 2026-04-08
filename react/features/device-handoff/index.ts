/**
 * Device Handoff feature — barrel export.
 */

// Service
export { handoffService, default as DeviceHandoffService }
    from './DeviceHandoffService';
export type { CompanionDevice, HandoffProgress, HandoffEventType, HandoffEventListener }
    from './DeviceHandoffService';

// Actions
export {
    startHandoffScanning,
    stopHandoffScanning,
    initiateHandoff,
    acceptHandoff,
    declineHandoff,
    confirmHandoffTrackEstablished,
    handoffDeviceFound,
    handoffDeviceLost,
    handoffStarted,
    handoffProgressUpdate,
    handoffCompleted,
    handoffFailed,
    handoffReceived,
    handoffAccepted,
    handoffDeclined,
    handoffInterpreterNotify,
    handoffInterpreterComplete
} from './actions';

// Action types
export {
    HANDOFF_DEVICE_FOUND,
    HANDOFF_DEVICE_LOST,
    HANDOFF_STARTED,
    HANDOFF_PROGRESS_UPDATE,
    HANDOFF_COMPLETED,
    HANDOFF_FAILED,
    HANDOFF_RECEIVED,
    HANDOFF_ACCEPTED,
    HANDOFF_DECLINED,
    HANDOFF_INTERPRETER_NOTIFY,
    HANDOFF_INTERPRETER_COMPLETE
} from './actionTypes';

// Reducer types
export type { DeviceHandoffState } from './reducer';

// Components
export { default as HandoffBanner } from './components/HandoffBanner';
export { default as HandoffProgress } from './components/HandoffProgress';
export { default as HandoffReceiver } from './components/HandoffReceiver';
export { default as InterpreterHandoffNotification }
    from './components/InterpreterHandoffNotification';

// Middleware
export { handleHandoffWsMessage } from './middleware';
