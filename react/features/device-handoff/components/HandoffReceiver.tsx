/**
 * HandoffReceiver
 *
 * Screen shown on the receiving device when a handoff offer arrives.
 * Displays call details and accept/decline buttons.
 */

import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { acceptHandoff, declineHandoff } from '../actions';

interface ReceiverState {
    'features/device-handoff': {
        receivedToken: string | null;
        receivedRoomName: string | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const CARD_STYLE: React.CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 16,
    padding: '40px 48px',
    maxWidth: 420,
    width: '90%',
    textAlign: 'center',
    color: '#fff',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 8,
    color: '#e0e0e0'
};

const SUBTITLE_STYLE: React.CSSProperties = {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32
};

const DETAIL_ROW_STYLE: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 14
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    marginTop: 32
};

const ACCEPT_BUTTON_STYLE: React.CSSProperties = {
    flex: 1,
    background: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s'
};

const DECLINE_BUTTON_STYLE: React.CSSProperties = {
    flex: 1,
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    padding: '14px 20px',
    fontSize: 15,
    cursor: 'pointer',
    transition: 'background 0.2s'
};

interface HandoffReceiverProps {
    fromDeviceName?: string;
    roomName?: string;
}

const HandoffReceiver: React.FC<HandoffReceiverProps> = ({ fromDeviceName, roomName }) => {
    const dispatch = useDispatch();
    const receivedToken = useSelector(
        (state: ReceiverState) => state['features/device-handoff']?.receivedToken
    );
    const receivedRoomName = useSelector(
        (state: ReceiverState) => state['features/device-handoff']?.receivedRoomName
    );

    const handleAccept = useCallback(() => {
        if (receivedToken) {
            dispatch(acceptHandoff(receivedToken) as any);
        }
    }, [ dispatch, receivedToken ]);

    const handleDecline = useCallback(() => {
        if (receivedToken) {
            dispatch(declineHandoff(receivedToken) as any);
        }
    }, [ dispatch, receivedToken ]);

    if (!receivedToken) {
        return null;
    }

    return (
        <div style = { OVERLAY_STYLE }>
            <div style = { CARD_STYLE }>
                <div style = { TITLE_STYLE }>Incoming Call Transfer</div>
                <div style = { SUBTITLE_STYLE }>A call is being transferred to this device</div>

                <div style = {{ textAlign: 'left', marginBottom: 8 }}>
                    {fromDeviceName && (
                        <div style = { DETAIL_ROW_STYLE }>
                            <span style = {{ color: 'rgba(255,255,255,0.5)' }}>From</span>
                            <span>{fromDeviceName}</span>
                        </div>
                    )}
                    <div style = { DETAIL_ROW_STYLE }>
                        <span style = {{ color: 'rgba(255,255,255,0.5)' }}>Room</span>
                        <span>{receivedRoomName || roomName || '—'}</span>
                    </div>
                </div>

                <div style = { BUTTON_ROW_STYLE }>
                    <button
                        onClick = { handleAccept }
                        style = { ACCEPT_BUTTON_STYLE }
                        type = 'button'>
                        Accept Transfer
                    </button>
                    <button
                        onClick = { handleDecline }
                        style = { DECLINE_BUTTON_STYLE }
                        type = 'button'>
                        Decline
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HandoffReceiver;
