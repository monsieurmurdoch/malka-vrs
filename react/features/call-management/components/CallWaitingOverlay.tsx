/**
 * Call Waiting Overlay — shows when a second call comes in while on a call.
 *
 * Displays caller info with Accept, Reject, and Hold & Accept buttons.
 * Includes a vibration pattern for mobile devices.
 */

import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { callWaitingRespond, callWaitingDismiss } from '../actions';

interface CallWaitingState {
    'features/call-management': {
        incomingCall: {
            callId: string;
            roomName: string;
            callerName: string;
            callerId: string;
            currentCallId: string;
        } | null;
    };
}

const CallWaitingOverlay = () => {
    const dispatch = useDispatch();
    const incomingCall = useSelector(
        (state: CallWaitingState) => state['features/call-management']?.incomingCall
    );

    // Vibration pattern for incoming call alert
    useEffect(() => {
        if (incomingCall && typeof navigator.vibrate === 'function') {
            navigator.vibrate([ 200, 100, 200, 100, 200 ]);
        }
    }, [ incomingCall ]);

    if (!incomingCall) {
        return null;
    }

    const handleAccept = () => {
        dispatch(callWaitingRespond(incomingCall.callId, incomingCall.currentCallId, 'accept'));
        dispatch(callWaitingDismiss());
    };

    const handleReject = () => {
        dispatch(callWaitingRespond(incomingCall.callId, incomingCall.currentCallId, 'reject'));
        dispatch(callWaitingDismiss());
    };

    const handleHoldAndAccept = () => {
        dispatch(callWaitingRespond(incomingCall.callId, incomingCall.currentCallId, 'hold_and_accept'));
        dispatch(callWaitingDismiss());
    };

    return (
        <div className = 'call-waiting-overlay'>
            <div className = 'call-waiting-card'>
                <div className = 'call-waiting-icon'>
                    <i className = 'icon-phone-incoming' />
                </div>
                <h3>Incoming Call</h3>
                <p className = 'call-waiting-caller'>{incomingCall.callerName}</p>
                <p className = 'call-waiting-status'>Waiting on your current call</p>
                <div className = 'call-waiting-actions'>
                    <button
                        className = 'call-waiting-btn reject'
                        onClick = { handleReject }>
                        <i className = 'icon-phone-hangup' />
                        <span>Reject</span>
                    </button>
                    <button
                        className = 'call-waiting-btn hold-accept'
                        onClick = { handleHoldAndAccept }>
                        <i className = 'icon-phone-pause' />
                        <span>Hold & Accept</span>
                    </button>
                    <button
                        className = 'call-waiting-btn accept'
                        onClick = { handleAccept }>
                        <i className = 'icon-phone' />
                        <span>Accept</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CallWaitingOverlay;
