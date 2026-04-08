/**
 * Action types for the device handoff feature.
 */

// Companion device discovery
export const HANDOFF_DEVICE_FOUND = 'HANDOFF_DEVICE_FOUND';
export const HANDOFF_DEVICE_LOST = 'HANDOFF_DEVICE_LOST';

// Handoff lifecycle
export const HANDOFF_STARTED = 'HANDOFF_STARTED';
export const HANDOFF_PROGRESS_UPDATE = 'HANDOFF_PROGRESS_UPDATE';
export const HANDOFF_COMPLETED = 'HANDOFF_COMPLETED';
export const HANDOFF_FAILED = 'HANDOFF_FAILED';

// Receiving device events
export const HANDOFF_RECEIVED = 'HANDOFF_RECEIVED';
export const HANDOFF_ACCEPTED = 'HANDOFF_ACCEPTED';
export const HANDOFF_DECLINED = 'HANDOFF_DECLINED';

// Interpreter notification
export const HANDOFF_INTERPRETER_NOTIFY = 'HANDOFF_INTERPRETER_NOTIFY';
export const HANDOFF_INTERPRETER_COMPLETE = 'HANDOFF_INTERPRETER_COMPLETE';
