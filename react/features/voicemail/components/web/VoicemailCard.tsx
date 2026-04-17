/**
 * VoicemailCard — single message card for the inbox grid.
 */

import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import type { VoicemailMessage } from '../types';
import { openMessage, markSeen } from '../actions';

interface Props {
    message: VoicemailMessage;
}

const CARD_STYLE: React.CSSProperties = {
    background: '#1e1e2e',
    borderRadius: 12,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    border: '1px solid #2a2a3e'
};

const CARD_HOVER_STYLE: React.CSSProperties = {
    ...CARD_STYLE,
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
};

const THUMBNAIL_STYLE: React.CSSProperties = {
    width: '100%',
    height: 140,
    background: 'linear-gradient(135deg, #2a2a3e 0%, #1a1a2e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
};

const PLAY_ICON_STYLE: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    color: '#fff',
    border: '2px solid rgba(255,255,255,0.3)'
};

const DURATION_BADGE_STYLE: React.CSSProperties = {
    position: 'absolute',
    bottom: 8,
    right: 8,
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4
};

const UNREAD_DOT_STYLE: React.CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#4fc3f7'
};

const META_STYLE: React.CSSProperties = {
    padding: '10px 12px'
};

const SENDER_STYLE: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
};

const TIMESTAMP_STYLE: React.CSSProperties = {
    fontSize: 12,
    color: '#888'
};

function formatDuration(seconds: number | null): string {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;

    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeTime(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return new Date(dateStr).toLocaleDateString();
}

const VoicemailCard: React.FC<Props> = ({ message }) => {
    const dispatch = useDispatch();

    const handleClick = useCallback(() => {
        if (!message.seen) {
            dispatch(markSeen(message.id) as any);
        }
        dispatch(openMessage(message.id) as any);
    }, [ dispatch, message.id, message.seen ]);

    return (
        <div
            onClick = { handleClick }
            style = { CARD_STYLE }>
            <div style = { THUMBNAIL_STYLE }>
                {message.thumbnailUrl ? (
                    <img
                        alt = { `Video from ${message.caller_name || 'Unknown'}` }
                        src = { message.thumbnailUrl }
                        style = {{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <div style = { PLAY_ICON_STYLE }>&#9654;</div>
                )}
                {!message.seen && <div style = { UNREAD_DOT_STYLE } />}
                <div style = { DURATION_BADGE_STYLE }>
                    {formatDuration(message.duration_seconds)}
                </div>
            </div>
            <div style = { META_STYLE }>
                <div style = { SENDER_STYLE }>
                    {message.caller_name || message.caller_phone || 'Unknown'}
                </div>
                <div style = { TIMESTAMP_STYLE }>
                    {formatRelativeTime(message.created_at)}
                </div>
            </div>
        </div>
    );
};

export default VoicemailCard;
