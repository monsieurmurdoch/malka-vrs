/**
 * Foreground notification alert for incoming interpreter requests.
 *
 * Triggers a vibration pattern and (optionally) a system sound
 * when a new interpreter request arrives while the app is foregrounded.
 * On iOS, uses Vibration.vibrate() with a pattern. On Android, same.
 * Push notification (background/locked) requires APNs/FCM integration.
 */

import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';

import { useSelector } from 'react-redux';

import { QueueState } from '../../../interpreter-queue/reducer';

const VIBRATION_PATTERN = [ 0, 400, 200, 400 ];
const VIBRATION_DURATION = 1000;

type QueueRootState = {
    'features/interpreter-queue'?: QueueState;
};

/**
 * Hook that triggers a vibration alert when a new interpreter request arrives.
 *
 * Should be used in the InterpreterHomeScreen or root-level component
 * so it monitors the queue state regardless of which screen is active.
 */
export function useIncomingRequestAlert() {
    const queueState = useSelector((state: QueueRootState) => state['features/interpreter-queue']);
    const prevRequestCount = useRef(0);

    useEffect(() => {
        const currentCount = queueState?.pendingRequests?.length || 0;

        // Only alert when a NEW request arrives (count increases)
        if (currentCount > prevRequestCount.current && currentCount > 0) {
            if (Platform.OS === 'ios') {
                Vibration.vibrate(VIBRATION_PATTERN, false);
            } else {
                Vibration.vibrate(VIBRATION_DURATION);
            }
        }

        prevRequestCount.current = currentCount;
    }, [ queueState?.pendingRequests?.length ]);
}
