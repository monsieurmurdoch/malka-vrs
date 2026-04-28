/**
 * VoicemailFab — floating action button that shows unread badge
 * and opens the voicemail inbox overlay.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { loadInbox, loadUnreadCount } from '../../actions';
import { getPersistentJson } from '../../../vrs-auth/storage';

interface VoicemailFabState {
    'features/voicemail': {
        unreadCount: number;
        inboxOpen: boolean;
    };
}

const FAB_STYLE: React.CSSProperties = {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    border: 'none',
    color: '#fff',
    fontSize: 22,
    cursor: 'pointer',
    zIndex: 9000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
};

const BADGE_STYLE: React.CSSProperties = {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: '#e53935',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: '20px',
    textAlign: 'center',
    padding: '0 5px',
    border: '2px solid #fff'
};

const MAIL_ICON = (
    <svg
        fill = 'none'
        height = '24'
        stroke = 'currentColor'
        strokeWidth = { 2 }
        viewBox = '0 0 24 24'
        width = '24'>
        <path
            d = 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
            strokeLinecap = 'round'
            strokeLinejoin = 'round' />
    </svg>
);

function hasClientVoicemailAuth(): boolean {
    const auth = getPersistentJson<{ token?: string }>('vrs_auth_token');
    const user = getPersistentJson<{ role?: string }>('vrs_user_info');

    return Boolean(auth?.token && user?.role === 'client');
}

const VoicemailFab: React.FC = () => {
    const [ isAuthenticatedClient, setAuthenticatedClient ] = useState(hasClientVoicemailAuth);
    const unreadCount = useSelector(
        (state: VoicemailFabState) => state['features/voicemail']?.unreadCount || 0
    );
    const inboxOpen = useSelector(
        (state: VoicemailFabState) => state['features/voicemail']?.inboxOpen || false
    );
    const dispatch = useDispatch();

    useEffect(() => {
        const refreshAuthState = () => setAuthenticatedClient(hasClientVoicemailAuth());

        window.addEventListener('storage', refreshAuthState);
        window.addEventListener('focus', refreshAuthState);

        return () => {
            window.removeEventListener('storage', refreshAuthState);
            window.removeEventListener('focus', refreshAuthState);
        };
    }, []);

    useEffect(() => {
        if (isAuthenticatedClient) {
            dispatch(loadUnreadCount() as any);
        }
    }, [ dispatch, isAuthenticatedClient ]);

    const handleClick = useCallback(() => {
        if (!inboxOpen) {
            dispatch(loadInbox() as any);
        }

        dispatch({
            type: inboxOpen ? 'VOICEMAIL_CLOSE_INBOX' : 'VOICEMAIL_OPEN_INBOX'
        });
    }, [ dispatch, inboxOpen ]);

    if (!isAuthenticatedClient) {
        return null;
    }

    return (
        <button
            onClick = { handleClick }
            style = {{
                ...FAB_STYLE,
                transform: unreadCount > 0 ? 'scale(1)' : 'scale(0.85)',
                opacity: unreadCount > 0 ? 1 : 0.6
            }}
            title = { `Voicemail${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}` }
            type = 'button'>
            {MAIL_ICON}
            {unreadCount > 0 && (
                <span style = { BADGE_STYLE }>
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default VoicemailFab;
