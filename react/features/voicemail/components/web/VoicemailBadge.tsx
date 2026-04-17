/**
 * VoicemailBadge — unread count badge for navigation.
 */

import React from 'react';
import { useSelector } from 'react-redux';

interface VoicemailBadgeState {
    'features/voicemail': {
        unreadCount: number;
    };
}

const BADGE_STYLE: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: '#e53935',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    padding: '0 6px',
    marginLeft: 6,
    lineHeight: '20px'
};

const VoicemailBadge: React.FC = () => {
    const unreadCount = useSelector(
        (state: VoicemailBadgeState) => state['features/voicemail']?.unreadCount || 0
    );

    if (unreadCount === 0) {
        return null;
    }

    return (
        <span style = { BADGE_STYLE }>
            {unreadCount > 99 ? '99+' : unreadCount}
        </span>
    );
};

export default VoicemailBadge;
