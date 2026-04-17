/**
 * VoicemailRecording — recording-in-progress view with countdown timer.
 *
 * Shown while the user is recording a video message via Jitsi/Jibri.
 * Displays a countdown timer and stop button.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { recordingCancelled } from '../actions';
import { cancelVoicemailRecording } from '../functions';
import { dismissPrompt } from '../actions';

interface RecordingState {
    'features/voicemail': {
        isRecording: boolean;
        recordingSession: {
            messageId: string;
            roomName: string;
            maxDurationSeconds: number;
        } | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.9)',
    zIndex: 1800,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const RECORDING_DOT_STYLE: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#e53935',
    display: 'inline-block',
    marginRight: 10,
    animation: 'pulse 1.5s infinite'
};

const TIMER_STYLE: React.CSSProperties = {
    fontSize: 56,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    marginBottom: 16
};

const LABEL_STYLE: React.CSSProperties = {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 32,
    display: 'flex',
    alignItems: 'center'
};

const STOP_BUTTON_STYLE: React.CSSProperties = {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#e53935',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.15s'
};

const STOP_ICON_STYLE: React.CSSProperties = {
    width: 28,
    height: 28,
    background: '#fff',
    borderRadius: 4
};

const CANCEL_LINK_STYLE: React.CSSProperties = {
    marginTop: 24,
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'underline'
};

function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const VoicemailRecording: React.FC = () => {
    const dispatch = useDispatch();
    const { isRecording, recordingSession } = useSelector(
        (state: RecordingState) => state['features/voicemail'] || {}
    );
    const [ elapsed, setElapsed ] = useState(0);

    useEffect(() => {
        if (!isRecording) return;

        const interval = setInterval(() => {
            setElapsed(prev => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [ isRecording ]);

    // Reset elapsed when recording starts
    useEffect(() => {
        if (isRecording) {
            setElapsed(0);
        }
    }, [ isRecording, recordingSession?.messageId ]);

    const remaining = Math.max(0, (recordingSession?.maxDurationSeconds || 180) - elapsed);

    const handleStop = useCallback(() => {
        // Jibri handles the actual stop via its own timeout or the finalize script
        // Here we just update the UI state
        dispatch(recordingCancelled() as any);
    }, [ dispatch ]);

    const handleCancel = useCallback(async () => {
        if (recordingSession?.messageId) {
            try {
                await cancelVoicemailRecording(() => ({} as any), recordingSession.messageId);
            } catch {
                // Ignore — the recording might not exist
            }
        }
        dispatch(recordingCancelled() as any);
        dispatch(dismissPrompt() as any);
    }, [ dispatch, recordingSession ]);

    if (!isRecording || !recordingSession) {
        return null;
    }

    return (
        <div style = { OVERLAY_STYLE }>
            <div style = { LABEL_STYLE }>
                <span style = { RECORDING_DOT_STYLE } />
                Recording video message...
            </div>
            <div style = { TIMER_STYLE }>
                {formatTimer(elapsed)}
            </div>
            <div style = {{ fontSize: 14, color: '#666', marginBottom: 32 }}>
                {formatTimer(remaining)} remaining
            </div>
            <button
                onClick = { handleStop }
                style = { STOP_BUTTON_STYLE }
                title = 'Stop recording'
                type = 'button'>
                <div style = { STOP_ICON_STYLE } />
            </button>
            <button
                onClick = { handleCancel }
                style = { CANCEL_LINK_STYLE }
                type = 'button'>
                Cancel
            </button>
        </div>
    );
};

export default VoicemailRecording;
