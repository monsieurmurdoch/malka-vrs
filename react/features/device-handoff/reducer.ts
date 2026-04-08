/**
 * Reducer for the device handoff feature.
 */

import ReducerRegistry from '../base/redux/ReducerRegistry';

import {
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
import type { CompanionDevice, HandoffProgress } from './DeviceHandoffService';

export interface DeviceHandoffState {
    // Companion device discovery
    companionDevices: CompanionDevice[];
    isScanning: boolean;

    // Handoff in progress
    handoffInProgress: boolean;
    progress: HandoffProgress | null;
    companionDevice: CompanionDevice | null;

    // Receiving side
    receivedToken: string | null;
    receivedRoomName: string | null;

    // Interpreter notification
    interpreterNotify: {
        active: boolean;
        userId?: string;
        roomName?: string;
        estimatedDuration?: string;
    } | null;

    // Error state
    error: string | null;
}

interface HandoffAction {
    type: string;
    device?: CompanionDevice;
    deviceId?: string;
    companionDevice?: CompanionDevice;
    progress?: HandoffProgress;
    roomName?: string;
    error?: string;
    token?: string;
    data?: {
        userId: string;
        roomName: string;
        interpreterId?: string | null;
        estimatedDuration?: string;
    };
}

const INITIAL_STATE: DeviceHandoffState = {
    companionDevices: [],
    isScanning: false,
    handoffInProgress: false,
    progress: null,
    companionDevice: null,
    receivedToken: null,
    receivedRoomName: null,
    interpreterNotify: null,
    error: null
};

ReducerRegistry.register<DeviceHandoffState>('features/device-handoff',
    (state: DeviceHandoffState = INITIAL_STATE, action: HandoffAction): DeviceHandoffState => {
        switch (action.type) {
            case HANDOFF_DEVICE_FOUND:
                return {
                    ...state,
                    isScanning: true,
                    companionDevices: [
                        ...state.companionDevices.filter(d => d.id !== action.device!.id),
                        action.device!
                    ]
                };

            case HANDOFF_DEVICE_LOST:
                return {
                    ...state,
                    companionDevices: state.companionDevices.filter(d => d.id !== action.deviceId)
                };

            case HANDOFF_STARTED:
                return {
                    ...state,
                    handoffInProgress: true,
                    companionDevice: action.companionDevice || null,
                    error: null
                };

            case HANDOFF_PROGRESS_UPDATE: {
                const progress = action.progress;
                const isDone = progress?.stage === 'completed' || progress?.stage === 'failed';

                return {
                    ...state,
                    progress: progress || null,
                    handoffInProgress: !isDone,
                    error: progress?.error || null
                };
            }

            case HANDOFF_COMPLETED:
                return {
                    ...state,
                    handoffInProgress: false,
                    progress: {
                        stage: 'completed',
                        message: 'Call transferred successfully'
                    },
                    companionDevice: null
                };

            case HANDOFF_FAILED:
                return {
                    ...state,
                    handoffInProgress: false,
                    progress: {
                        stage: 'failed',
                        message: action.error || 'Handoff failed'
                    },
                    error: action.error || null
                };

            case HANDOFF_RECEIVED:
                return {
                    ...state,
                    receivedToken: action.token || null
                };

            case HANDOFF_ACCEPTED:
                return {
                    ...state,
                    receivedToken: null,
                    receivedRoomName: action.data?.roomName || null
                };

            case HANDOFF_DECLINED:
                return {
                    ...state,
                    receivedToken: null
                };

            case HANDOFF_INTERPRETER_NOTIFY:
                return {
                    ...state,
                    interpreterNotify: {
                        active: true,
                        userId: action.data?.userId,
                        roomName: action.data?.roomName,
                        estimatedDuration: action.data?.estimatedDuration
                    }
                };

            case HANDOFF_INTERPRETER_COMPLETE:
                return {
                    ...state,
                    interpreterNotify: null
                };

            default:
                return state;
        }
    });
