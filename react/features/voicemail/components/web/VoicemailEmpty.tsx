/**
 * VoicemailEmpty — empty state for the inbox.
 */

import React from 'react';

const CONTAINER_STYLE: React.CSSProperties = {
    textAlign: 'center',
    padding: '60px 20px'
};

const ICON_STYLE: React.CSSProperties = {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.4,
    color: 'rgba(226, 236, 247, 0.3)'
};

const TITLE_STYLE: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    color: 'rgba(226, 236, 247, 0.7)',
    marginBottom: 8
};

const SUBTITLE_STYLE: React.CSSProperties = {
    fontSize: 14,
    color: 'rgba(226, 236, 247, 0.4)',
    lineHeight: 1.6,
    maxWidth: 320,
    margin: '0 auto'
};

const VoicemailEmpty: React.FC = () => (
    <div style = { CONTAINER_STYLE }>
        <div style = { ICON_STYLE }>&#9993;</div>
        <div style = { TITLE_STYLE }>No voicemail messages</div>
        <div style = { SUBTITLE_STYLE }>
            When someone leaves you a video message after a missed call,
            it will appear here as a thumbnail you can play back.
        </div>
    </div>
);

export default VoicemailEmpty;
