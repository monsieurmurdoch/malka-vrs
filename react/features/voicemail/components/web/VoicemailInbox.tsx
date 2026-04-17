/**
 * VoicemailInbox — main inbox page with thumbnail grid.
 */

import React, { useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { loadInbox } from '../../actions';
import VoicemailCard from './VoicemailCard';
import VoicemailEmpty from './VoicemailEmpty';

interface VoicemailInboxState {
    'features/voicemail': {
        messages: any[];
        totalCount: number;
        isLoading: boolean;
        error: string | null;
    };
}

const CONTAINER_STYLE: React.CSSProperties = {
    padding: '20px',
    maxWidth: 800,
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const HEADER_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: '#e0e0e0'
};

const GRID_STYLE: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 16
};

const LOADING_STYLE: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 0',
    color: '#888',
    fontSize: 14
};

const ERROR_STYLE: React.CSSProperties = {
    textAlign: 'center',
    padding: '20px',
    color: '#e53935',
    fontSize: 14,
    background: 'rgba(229, 57, 53, 0.1)',
    borderRadius: 8,
    marginBottom: 16
};

const REFRESH_BUTTON_STYLE: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid #444',
    color: '#aaa',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer'
};

const VoicemailInbox: React.FC = () => {
    const dispatch = useDispatch();
    const { messages, totalCount, isLoading, error } = useSelector(
        (state: VoicemailInboxState) => state['features/voicemail'] || {}
    );

    useEffect(() => {
        dispatch(loadInbox() as any);
    }, [ dispatch ]);

    const handleRefresh = useCallback(() => {
        dispatch(loadInbox() as any);
    }, [ dispatch ]);

    return (
        <div style = { CONTAINER_STYLE }>
            <div style = { HEADER_STYLE }>
                <div style = { TITLE_STYLE }>
                    Voicemail
                    {totalCount > 0 && (
                        <span style = {{ fontSize: 14, fontWeight: 400, color: '#888', marginLeft: 8 }}>
                            ({totalCount})
                        </span>
                    )}
                </div>
                <button
                    onClick = { handleRefresh }
                    style = { REFRESH_BUTTON_STYLE }
                    type = 'button'>
                    Refresh
                </button>
            </div>

            {error && <div style = { ERROR_STYLE }>{error}</div>}

            {isLoading && messages.length === 0 && (
                <div style = { LOADING_STYLE }>Loading messages...</div>
            )}

            {!isLoading && messages.length === 0 && !error && (
                <VoicemailEmpty />
            )}

            {messages.length > 0 && (
                <div style = { GRID_STYLE }>
                    {messages.map(message => (
                        <VoicemailCard
                            key = { message.id }
                            message = { message } />
                    ))}
                </div>
            )}
        </div>
    );
};

export default VoicemailInbox;
