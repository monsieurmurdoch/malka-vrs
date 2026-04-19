/**
 * VoicemailInbox — main inbox page with thumbnail grid.
 * Renders as a fixed overlay when inboxOpen is true.
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
        unreadCount: number;
        isLoading: boolean;
        inboxOpen: boolean;
        error: string | null;
    };
}

const OVERLAY_STYLE: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    zIndex: 9100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

const PANEL_STYLE: React.CSSProperties = {
    background: 'linear-gradient(180deg, #0f1c2d 0%, #09121f 100%)',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
    width: '90%',
    maxWidth: 720,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
};

const HEADER_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 16px'
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 700,
    color: '#F5F8FB'
};

const CONTAINER_STYLE: React.CSSProperties = {
    padding: '0 24px 24px',
    overflowY: 'auto',
    flex: 1
};

const GRID_STYLE: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 16
};

const LOADING_STYLE: React.CSSProperties = {
    textAlign: 'center',
    padding: '40px 0',
    color: 'rgba(226, 236, 247, 0.5)',
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

const BUTTON_STYLE: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#aaa',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    cursor: 'pointer'
};

const FILTER_TAB_STYLE = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(86, 176, 255, 0.2)' : 'transparent',
    border: active ? '1px solid rgba(86, 176, 255, 0.4)' : '1px solid transparent',
    color: active ? '#56B0FF' : 'rgba(226, 236, 247, 0.6)',
    borderRadius: 999,
    padding: '4px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease'
});

const LOAD_MORE_STYLE: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '12px',
    marginTop: 16,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    color: 'rgba(226, 236, 247, 0.7)',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'center'
};

const FILTER_BAR_STYLE: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    padding: '0 24px 12px'
};

const COUNT_STYLE: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 400,
    color: 'rgba(226, 236, 247, 0.5)',
    marginLeft: 8
};

const HEADER_RIGHT_STYLE: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    alignItems: 'center'
};

const VoicemailInbox: React.FC = () => {
    const dispatch = useDispatch();
    const { messages, totalCount, unreadCount, isLoading, inboxOpen, error } = useSelector(
        (state: VoicemailInboxState) => state['features/voicemail'] || {}
    );

    const [ filter, setFilter ] = React.useState<'all' | 'unread'>('all');

    useEffect(() => {
        if (inboxOpen) {
            dispatch(loadInbox() as any);
        }
    }, [ dispatch, inboxOpen ]);

    const handleRefresh = useCallback(() => {
        dispatch(loadInbox() as any);
    }, [ dispatch ]);

    const handleClose = useCallback(() => {
        dispatch({ type: 'VOICEMAIL_CLOSE_INBOX' });
    }, [ dispatch ]);

    const handleLoadMore = useCallback(() => {
        // Load more messages with offset
        dispatch(loadInbox(20, messages.length) as any);
    }, [ dispatch, messages.length ]);

    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }, [ handleClose ]);

    if (!inboxOpen) {
        return null;
    }

    const filteredMessages = filter === 'unread'
        ? messages.filter(m => !m.seen)
        : messages;

    const hasMore = messages.length < totalCount;

    return (
        <div onClick = { handleBackdropClick } style = { OVERLAY_STYLE }>
            <div style = { PANEL_STYLE }>
                <div style = { HEADER_STYLE }>
                    <div style = { TITLE_STYLE }>
                        Voicemail
                        {totalCount > 0 && (
                            <span style = { COUNT_STYLE }>
                                {totalCount} message{totalCount !== 1 ? 's' : ''}
                                {unreadCount > 0 && ` \u2022 ${unreadCount} unread`}
                            </span>
                        )}
                    </div>
                    <div style = { HEADER_RIGHT_STYLE }>
                        <button
                            onClick = { handleRefresh }
                            style = { BUTTON_STYLE }
                            type = 'button'>
                            Refresh
                        </button>
                        <button
                            onClick = { handleClose }
                            style = { BUTTON_STYLE }
                            type = 'button'>
                            Close
                        </button>
                    </div>
                </div>

                <div style = { FILTER_BAR_STYLE }>
                    <button
                        onClick = { () => setFilter('all') }
                        style = { FILTER_TAB_STYLE(filter === 'all') }
                        type = 'button'>
                        All
                    </button>
                    <button
                        onClick = { () => setFilter('unread') }
                        style = { FILTER_TAB_STYLE(filter === 'unread') }
                        type = 'button'>
                        Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
                    </button>
                </div>

                <div style = { CONTAINER_STYLE }>
                    {error && <div style = { ERROR_STYLE }>{error}</div>}

                    {isLoading && messages.length === 0 && (
                        <div style = { LOADING_STYLE }>Loading messages...</div>
                    )}

                    {!isLoading && filteredMessages.length === 0 && !error && (
                        <VoicemailEmpty />
                    )}

                    {filteredMessages.length > 0 && (
                        <div style = { GRID_STYLE }>
                            {filteredMessages.map(message => (
                                <VoicemailCard
                                    key = { message.id }
                                    message = { message } />
                            ))}
                        </div>
                    )}

                    {hasMore && (
                        <button
                            onClick = { handleLoadMore }
                            style = { LOAD_MORE_STYLE }
                            type = 'button'>
                            Load more ({totalCount - messages.length} remaining)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VoicemailInbox;
