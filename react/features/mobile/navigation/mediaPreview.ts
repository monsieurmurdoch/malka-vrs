import { Platform } from 'react-native';
import { MediaStream, mediaDevices } from 'react-native-webrtc';

import { mobileLog } from './logging';

type CameraDevice = {
    deviceId?: string;
    facing?: string;
    groupId?: string;
    kind?: string;
    label?: string;
};

type CameraPreviewResult = {
    devices: CameraDevice[];
    stream: MediaStream;
};

const FRONT_CAMERA_HINTS = /front|user|face|selfie|macbook|facetime|webcam/i;
const SELF_VIEW_VIDEO_CONSTRAINTS = {
    frameRate: 24,
    height: 480,
    width: 640
};

function cameraLabel(device: CameraDevice) {
    return device.label || device.facing || device.deviceId || 'unknown camera';
}

function cameraSearchText(device: CameraDevice) {
    return [
        device.label,
        device.facing,
        device.deviceId
    ].filter(Boolean).join(' ');
}

function getVideoDevices(devices: unknown) {
    if (!Array.isArray(devices)) {
        return [];
    }

    return (devices as CameraDevice[]).filter(device => device.kind === 'videoinput');
}

async function openCameraWithConstraints(video: boolean | Record<string, unknown>) {
    return await mediaDevices.getUserMedia({
        audio: false,
        video
    }) as MediaStream;
}

export async function startMobileCameraPreview(source: string): Promise<CameraPreviewResult> {
    const devices = getVideoDevices(await mediaDevices.enumerateDevices());
    const preferredCamera = devices.find(device => FRONT_CAMERA_HINTS.test(cameraSearchText(device))) || devices[0];

    mobileLog('info', 'mobile_camera_preview_devices', {
        count: devices.length,
        devices: devices.map(device => ({
            deviceId: device.deviceId,
            facing: device.facing,
            kind: device.kind,
            label: device.label
        })),
        source
    });

    const attempts: Array<{ label: string; video: boolean | Record<string, unknown> }> = [];

    if (preferredCamera?.deviceId) {
        attempts.push({
            label: `device:${cameraLabel(preferredCamera)}`,
            video: {
                deviceId: { exact: preferredCamera.deviceId },
                facingMode: 'user',
                ...SELF_VIEW_VIDEO_CONSTRAINTS
            }
        });
    }

    attempts.push(
        {
            label: 'facing:user',
            video: {
                facingMode: 'user',
                ...SELF_VIEW_VIDEO_CONSTRAINTS
            }
        },
        {
            label: 'any-video',
            video: true
        }
    );

    let lastError: unknown;

    for (const attempt of attempts) {
        try {
            const stream = await openCameraWithConstraints(attempt.video);
            const tracks = stream.getVideoTracks();

            mobileLog('info', 'mobile_camera_preview_started', {
                attempt: attempt.label,
                source,
                tracks: tracks.map(track => ({
                    enabled: track.enabled,
                    id: track.id,
                    label: track.label,
                    readyState: track.readyState
                }))
            });

            return {
                devices,
                stream
            };
        } catch (err: any) {
            lastError = err;
            mobileLog('warn', 'mobile_camera_preview_attempt_failed', {
                attempt: attempt.label,
                error: err?.message || String(err),
                source
            });
        }
    }

    throw lastError || new Error('Camera preview unavailable');
}

export function shouldAutoStartMobileCameraPreview() {
    const constants = Platform.constants as Record<string, unknown> | undefined;
    const deviceText = [
        constants?.Brand,
        constants?.Device,
        constants?.Fingerprint,
        constants?.Manufacturer,
        constants?.Model,
        constants?.Product
    ].filter(Boolean).join(' ').toLowerCase();
    const isAndroidEmulator = Platform.OS === 'android'
        && /emulator|generic|goldfish|ranchu|sdk_gphone|sdk_phone/.test(deviceText);

    return !isAndroidEmulator;
}
