/**
 * Middleware for the device handoff feature.
 *
 * Bridges DeviceHandoffService events to Redux actions,
 * and handles incoming WebSocket handoff messages from the server.
 */

import MiddlewareRegistry from '../base/redux/MiddlewareRegistry';
import { handoffService } from './DeviceHandoffService';
import { queueService } from '../interpreter-queue/InterpreterQueueService';
import {
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
import { getUserRole } from '../base/user-role/functions';

MiddlewareRegistry.register((store: { dispatch: Function; getState: Function; _deviceHandoffInitialized?: boolean }) =>
    (next: Function) => (action: { type: string; [key: string]: unknown }) => {
        const result = next(action);

        // Initialize handoff service listeners once
        if (!store._deviceHandoffInitialized) {
            const initialized = initializeDeviceHandoff(store);

            if (initialized) {
                store._deviceHandoffInitialized = true;
            }
        }

        return result;
    });

/**
 * Wire up DeviceHandoffService events to Redux dispatches.
 */
function initializeDeviceHandoff(store: { dispatch: Function; getState: Function }) {
    const userRole = getUserRole();
    console.log('[DeviceHandoff] Initializing for role:', userRole);

    // Companion device discovery
    handoffService.on('device_found', (device: any) => {
        store.dispatch(handoffDeviceFound(device));
    });

    handoffService.on('device_lost', (data: any) => {
        store.dispatch(handoffDeviceLost(data.id));
    });

    // Handoff progress
    handoffService.on('handoff_started', (data: any) => {
        store.dispatch(handoffStarted(data.companionDevice));
    });

    handoffService.on('handoff_progress', (progress: any) => {
        store.dispatch(handoffProgressUpdate(progress));
    });

    handoffService.on('handoff_completed', (data: any) => {
        store.dispatch(handoffCompleted(data.roomName));
    });

    handoffService.on('handoff_failed', (data: any) => {
        store.dispatch(handoffFailed(data.error || data.message || 'Handoff failed'));
    });

    // Receiving device events
    handoffService.on('handoff_received', (data: any) => {
        store.dispatch(handoffReceived(data.token));
    });

    handoffService.on('handoff_accepted', (data: any) => {
        store.dispatch(handoffAccepted(data));
    });

    handoffService.on('handoff_declined', (data: any) => {
        store.dispatch(handoffDeclined(data.token));
    });

    // WebSocket handoff messages from the server (routed through queueService)
    queueService.on('handoff_in_progress', (data: any) => {
        store.dispatch(handoffInterpreterNotify(data));
    });

    queueService.on('handoff_complete', (data: any) => {
        store.dispatch(handoffInterpreterComplete(data));
    });

    queueService.on('handoff_consumed', () => {
        store.dispatch(handoffProgressUpdate({
            stage: 'establishing',
            message: 'Target device is joining...'
        }));
    });

    queueService.on('handoff_executed', (data: any) => {
        store.dispatch(handoffAccepted(data));
    });

    queueService.on('handoff_prepared', (data: any) => {
        store.dispatch(handoffProgressUpdate({
            stage: 'transferring',
            message: 'Handoff token created'
        }));
    });

    queueService.on('handoff_error', (data: any) => {
        store.dispatch(handoffFailed(data?.message || 'Handoff error from server'));
    });

    console.log('[DeviceHandoff] Middleware initialized');

    return true;
}

/**
 * Handle handoff-related WebSocket messages from the server.
 * Called from InterpreterQueueService when it receives handoff messages.
 */
export function handleHandoffWsMessage(store: { dispatch: Function }, message: { type: string; data?: any }) {
    switch (message.type) {
        case 'handoff_in_progress':
            store.dispatch(handoffInterpreterNotify(message.data));
            break;

        case 'handoff_complete':
            store.dispatch(handoffInterpreterComplete(message.data));
            break;

        case 'handoff_consumed':
            // Original device got confirmation that target consumed the token
            store.dispatch(handoffProgressUpdate({
                stage: 'establishing',
                message: 'Target device is joining...'
            }));
            break;

        case 'handoff_executed':
            // This device successfully executed the handoff
            store.dispatch(handoffAccepted(message.data));
            break;
    }
}
