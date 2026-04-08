/**
 * Actions for the device handoff feature.
 */

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
import { handoffService } from './DeviceHandoffService';
import type { CompanionDevice, HandoffProgress } from './DeviceHandoffService';

/**
 * Start BLE scanning for companion devices.
 */
export function startHandoffScanning() {
    return () => {
        handoffService.startScanning();
    };
}

/**
 * Stop BLE scanning.
 */
export function stopHandoffScanning() {
    return () => {
        handoffService.stopScanning();
    };
}

/**
 * Initiate a handoff to a companion device.
 */
export function initiateHandoff(companionDevice: CompanionDevice) {
    return async () => {
        await handoffService.initiateHandoff(companionDevice);
    };
}

/**
 * Accept a received handoff (receiving device).
 */
export function acceptHandoff(token: string) {
    return async () => {
        await handoffService.acceptHandoff(token);
    };
}

/**
 * Decline a received handoff (receiving device).
 */
export function declineHandoff(token: string) {
    return () => {
        handoffService.declineHandoff(token);
    };
}

/**
 * Confirm that the new device's video track is established.
 */
export function confirmHandoffTrackEstablished(roomName: string) {
    return () => {
        handoffService.confirmTrackEstablished(roomName);
    };
}

// ---- Pure action creators (called by middleware / service events) ----

export function handoffDeviceFound(device: CompanionDevice) {
    return {
        type: HANDOFF_DEVICE_FOUND,
        device
    };
}

export function handoffDeviceLost(deviceId: string) {
    return {
        type: HANDOFF_DEVICE_LOST,
        deviceId
    };
}

export function handoffStarted(companionDevice: CompanionDevice) {
    return {
        type: HANDOFF_STARTED,
        companionDevice
    };
}

export function handoffProgressUpdate(progress: HandoffProgress) {
    return {
        type: HANDOFF_PROGRESS_UPDATE,
        progress
    };
}

export function handoffCompleted(roomName: string) {
    return {
        type: HANDOFF_COMPLETED,
        roomName
    };
}

export function handoffFailed(error: string) {
    return {
        type: HANDOFF_FAILED,
        error
    };
}

export function handoffReceived(token: string) {
    return {
        type: HANDOFF_RECEIVED,
        token
    };
}

export function handoffAccepted(data: { roomName: string; interpreterId: string | null; userId: string }) {
    return {
        type: HANDOFF_ACCEPTED,
        data
    };
}

export function handoffDeclined(token: string) {
    return {
        type: HANDOFF_DECLINED,
        token
    };
}

export function handoffInterpreterNotify(data: { userId: string; roomName: string; estimatedDuration: string }) {
    return {
        type: HANDOFF_INTERPRETER_NOTIFY,
        data
    };
}

export function handoffInterpreterComplete(data: { userId: string }) {
    return {
        type: HANDOFF_INTERPRETER_COMPLETE,
        data
    };
}
