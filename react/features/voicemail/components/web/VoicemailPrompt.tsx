/**
 * VoicemailPrompt — "Leave a video message?" modal shown after a missed call.
 */

import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { dismissPrompt, recordingStarted } from '../actions';
import { startVoicemailRecording } from '../functions';

interface PromptState {
    'features/voicemail': {
        isPromptVisible: boolean;
        promptData: {
            calleeName: string;
            calleePhone: string;
            calleeId: string;
        } | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 1500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const MODAL_STYLE: React.CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 16,
    padding: '32px',
    maxWidth: 400,
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
};

const ICON_STYLE: React.CSSProperties = {
    fontSize: 40,
    marginBottom: 16
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: '#e0e0e0',
    marginBottom: 8
};

const SUBTITLE_STYLE: React.CSSProperties = {
    fontSize: 14,
    color: '#888',
    marginBottom: 24
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    justifyContent: 'center'
};

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s'
};

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    color: '#aaa',
    border: '1px solid #444',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 14,
    cursor: 'pointer'
};

const VoicemailPrompt: React.FC = () => {
    const dispatch = useDispatch();
    const { isPromptVisible, promptData } = useSelector(
        (state: PromptState) => state['features/voicemail'] || {}
    );

    const handleLeaveMessage = useCallback(async () => {
        if (!promptData) return;

        try {
            const result = await startVoicemailRecording(
                () => ({} as any), // getState placeholder
                promptData.calleePhone
            );
            dispatch(recordingStarted({
                messageId: result.messageId,
                roomName: result.roomName,
                maxDurationSeconds: result.maxDurationSeconds
            }) as any);
        } catch (error: any) {
            dispatch({ type: 'VOICEMAIL_ERROR', error: error.message });
        }
    }, [ dispatch, promptData ]);

    const handleDismiss = useCallback(() => {
        dispatch(dismissPrompt() as any);
    }, [ dispatch ]);

    if (!isPromptVisible || !promptData) {
        return null;
    }

    return (
        <div style = { OVERLAY_STYLE }>
            <div style = { MODAL_STYLE }>
                <div style = { ICON_STYLE }>&#127909;</div>
                <div style = { TITLE_STYLE }>
                    {promptData.calleeName} is not available
                </div>
                <div style = { SUBTITLE_STYLE }>
                    Would you like to leave a video message?
                </div>
                <div style = { BUTTON_ROW_STYLE }>
                    <button
                        onClick = { handleLeaveMessage }
                        style = { PRIMARY_BUTTON_STYLE }
                        type = 'button'>
                        Leave Video Message
                    </button>
                    <button
                        onClick = { handleDismiss }
                        style = { SECONDARY_BUTTON_STYLE }
                        type = 'button'>
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoicemailPrompt;
