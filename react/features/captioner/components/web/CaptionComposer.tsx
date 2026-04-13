import React, { useMemo, useState } from 'react';
import { connect } from 'react-redux';

import { IReduxState, IStore } from '../../../app/types';
import { endpointMessageReceived } from '../../../base/conference/actions';
import { IJitsiConference } from '../../../base/conference/reducer';
import { getLocalParticipant } from '../../../base/participants/functions';
import { getDisplayName } from '../../../base/settings/functions.web';
import { isCaptioner } from '../../../base/user-role/functions';

interface IProps {
    _conference?: IJitsiConference;
    _displayName: string;
    _isCaptioner: boolean;
    _localParticipantId?: string;
    _localParticipantName?: string;
    dispatch: IStore['dispatch'];
}

interface ISentCaption {
    id: string;
    text: string;
    timestamp: number;
}

const DEFAULT_LANGUAGE = 'en-US';

function CaptionComposer({
    _conference,
    _displayName,
    _isCaptioner,
    _localParticipantId,
    _localParticipantName,
    dispatch
}: IProps) {
    const [ captionText, setCaptionText ] = useState('');
    const [ language, setLanguage ] = useState(DEFAULT_LANGUAGE);
    const [ sentCaptions, setSentCaptions ] = useState<ISentCaption[]>([]);

    const participantName = useMemo(
        () => _localParticipantName || _displayName || 'Transcriber',
        [ _displayName, _localParticipantName ]
    );

    if (!_isCaptioner || !_conference) {
        return null;
    }

    const onSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        const text = captionText.trim();
        const normalizedLanguage = (language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE;

        if (!text) {
            return;
        }

        const timestamp = Date.now();
        const messageId = `captioner-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const payload = {
            is_interim: false,
            language: normalizedLanguage,
            message_id: messageId,
            participant: {
                avatar_url: '',
                id: _localParticipantId || 'captioner-local',
                name: participantName
            },
            stability: 1,
            timestamp,
            transcript: [ { text } ],
            type: 'transcription-result'
        };

        _conference.sendEndpointMessage('', payload);
        dispatch(endpointMessageReceived({
            id: _localParticipantId || 'captioner-local',
            name: participantName
        }, payload));

        setSentCaptions(previous => [ { id: messageId, text, timestamp }, ...previous ].slice(0, 4));
        setCaptionText('');
    };

    return (
        <aside style = { styles.shell }>
            <div style = { styles.card }>
                <div style = { styles.header }>
                    <div>
                        <strong style = { styles.title }>Live Captioner</strong>
                        <div style = { styles.subtitle }>
                            Publish captions into the in-room subtitle overlay.
                        </div>
                    </div>
                    <span style = { styles.badge }>Manual</span>
                </div>
                <form onSubmit = { onSubmit } style = { styles.form }>
                    <label style = { styles.label }>
                        Caption language
                        <input
                            aria-label = 'Caption language'
                            onChange = { event => setLanguage(event.target.value) }
                            placeholder = 'en-US'
                            style = { styles.languageInput }
                            type = 'text'
                            value = { language } />
                    </label>
                    <label style = { styles.label }>
                        Caption text
                        <textarea
                            aria-label = 'Caption text'
                            onChange = { event => setCaptionText(event.target.value) }
                            placeholder = 'Type the spoken line exactly as you want participants to see it...'
                            rows = { 4 }
                            style = { styles.textarea }
                            value = { captionText } />
                    </label>
                    <div style = { styles.footer }>
                        <span style = { styles.helper }>
                            Participants with captions enabled will see this immediately.
                        </span>
                        <button style = { styles.button } type = 'submit'>
                            Publish Caption
                        </button>
                    </div>
                </form>
                {sentCaptions.length > 0 && (
                    <div style = { styles.preview }>
                        <strong style = { styles.previewTitle }>Recent captions</strong>
                        {sentCaptions.map(entry => (
                            <div key = { entry.id } style = { styles.previewRow }>
                                <span style = { styles.previewTime }>
                                    {new Date(entry.timestamp).toLocaleTimeString([], {
                                        hour: 'numeric',
                                        minute: '2-digit'
                                    })}
                                </span>
                                <span style = { styles.previewText }>{entry.text}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </aside>
    );
}

function mapStateToProps(state: IReduxState) {
    const localParticipant = getLocalParticipant(state);

    return {
        _conference: state['features/base/conference'].conference,
        _displayName: getDisplayName(state),
        _isCaptioner: isCaptioner(),
        _localParticipantId: localParticipant?.id,
        _localParticipantName: localParticipant?.name
    };
}

const styles: Record<string, React.CSSProperties> = {
    badge: {
        background: 'rgba(242, 185, 75, 0.18)',
        borderRadius: 999,
        color: '#f2c56d',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        padding: '6px 10px',
        textTransform: 'uppercase'
    },
    button: {
        background: '#f2b94b',
        border: 'none',
        borderRadius: 10,
        color: '#2b1b0f',
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 700,
        padding: '10px 14px'
    },
    card: {
        backdropFilter: 'blur(16px)',
        background: 'rgba(22, 16, 12, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 16,
        boxShadow: '0 10px 35px rgba(0, 0, 0, 0.28)',
        color: '#f8f3ea',
        display: 'grid',
        gap: 12,
        maxWidth: 360,
        padding: 16
    },
    footer: {
        alignItems: 'center',
        display: 'flex',
        gap: 12,
        justifyContent: 'space-between'
    },
    form: {
        display: 'grid',
        gap: 12
    },
    header: {
        alignItems: 'flex-start',
        display: 'flex',
        gap: 12,
        justifyContent: 'space-between'
    },
    helper: {
        color: 'rgba(248, 243, 234, 0.7)',
        fontSize: 12,
        lineHeight: 1.4
    },
    label: {
        color: '#f8f3ea',
        display: 'grid',
        fontSize: 12,
        fontWeight: 600,
        gap: 6
    },
    languageInput: {
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 10,
        color: '#f8f3ea',
        fontSize: 14,
        padding: '10px 12px'
    },
    preview: {
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'grid',
        gap: 8,
        paddingTop: 12
    },
    previewRow: {
        display: 'grid',
        gap: 2
    },
    previewText: {
        color: '#f8f3ea',
        fontSize: 13,
        lineHeight: 1.4
    },
    previewTime: {
        color: 'rgba(248, 243, 234, 0.52)',
        fontSize: 11,
        textTransform: 'uppercase'
    },
    previewTitle: {
        color: '#f2c56d',
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
    },
    shell: {
        bottom: 96,
        position: 'absolute',
        right: 20,
        zIndex: 31
    },
    subtitle: {
        color: 'rgba(248, 243, 234, 0.74)',
        fontSize: 13,
        lineHeight: 1.45,
        marginTop: 4
    },
    textarea: {
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 12,
        color: '#f8f3ea',
        fontFamily: 'inherit',
        fontSize: 14,
        lineHeight: 1.5,
        padding: '12px'
    },
    title: {
        display: 'block',
        fontSize: 15
    }
};

export default connect(mapStateToProps)(CaptionComposer);
