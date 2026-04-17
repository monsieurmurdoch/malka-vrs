/**
 * VoicemailEmpty — empty state for the inbox.
 */

import React from 'react';

const CONTAINER_STYLE: React.CSSProperties = {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#666'
};

const ICON_STYLE: React.CSSProperties = {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.4
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    color: '#999',
    marginBottom: 8
};

const SUBTITLE_STYLE: React.CSSProperties = {
    fontSize: 14,
    color: '#666'
};

const VoicemailEmpty: React.FC = () => (
    <div style = { CONTAINER_STYLE }>
        <div style = { ICON_STYLE }>&#9993;</div>
        <div style = { TITLE_STYLE }>No voicemail messages</div>
        <div style = { SUBTITLE_STYLE }>
            When someone leaves you a video message, it will appear here.
        </div>
    </div>
);

export default VoicemailEmpty;
