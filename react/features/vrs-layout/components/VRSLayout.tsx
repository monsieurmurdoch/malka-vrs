import React from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import { IReduxState, IStore } from '../../app/types';
import VideoTrack from '../../base/media/components/web/VideoTrack';
import { getRoomName } from '../../base/conference/functions';
import {
    setAudioInputDeviceAndUpdateSettings,
    setVideoInputDeviceAndUpdateSettings
} from '../../base/devices/actions.web';
import { getLocalParticipant } from '../../base/participants/functions';
import type { IParticipant } from '../../base/participants/types';
import {
    getCurrentCameraDeviceId,
    getCurrentMicDeviceId
} from '../../base/settings/functions.web';
import { getVideoTrackByParticipant } from '../../base/tracks/functions.web';
import CallWaitingOverlay from '../../call-management/components/CallWaitingOverlay';
import InCallChatPanel from '../../call-management/components/InCallChatPanel';

type VRSConferenceRole = 'client' | 'interpreter' | 'hearing';

interface IVRSPane {
    description: string;
    participant?: IParticipant;
    role: VRSConferenceRole;
    statusText: string;
    title: string;
    videoTrack?: any;
}

interface IProps {
    _audioInputDevices: MediaDeviceInfo[];
    _currentCameraDeviceId: string;
    _currentMicDeviceId: string;
    _extras: IParticipant[];
    _panes: IVRSPane[];
    _roomName?: string;
    _videoInputDevices: MediaDeviceInfo[];
    dispatch: IStore['dispatch'];
}

const VIDEO_STYLE = {
    height: '100%',
    objectFit: 'cover' as const,
    width: '100%'
};

const useStyles = makeStyles()(theme => ({
    root: {
        background: 'linear-gradient(180deg, rgba(6, 19, 32, 0.96) 0%, rgba(3, 10, 20, 0.98) 100%)',
        boxSizing: 'border-box',
        display: 'grid',
        gap: theme.spacing(1.5),
        height: '100%',
        minHeight: 0,
        padding: theme.spacing(1.5),
        width: '100%'
    },

    singlePaneRoot: {
        gridTemplateColumns: 'minmax(0, 1fr)'
    },

    twoPaneRoot: {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',

        [theme.breakpoints.down('sm')]: {
            gridTemplateColumns: '1fr'
        }
    },

    threePaneRoot: {
        gridTemplateColumns: '1.05fr 1.25fr 1.05fr',

        [theme.breakpoints.down('lg')]: {
            gridTemplateColumns: '1fr 1fr'
        },

        [theme.breakpoints.down('sm')]: {
            gridTemplateColumns: '1fr',
            padding: theme.spacing(1)
        }
    },

    pane: {
        backdropFilter: 'blur(18px)',
        background: 'linear-gradient(180deg, rgba(15, 28, 45, 0.92) 0%, rgba(9, 18, 31, 0.96) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 20,
        boxShadow: '0 18px 50px rgba(0, 0, 0, 0.28)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative'
    },

    interpreterPane: {
        border: '1px solid rgba(86, 176, 255, 0.32)'
    },

    paneHeader: {
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'space-between',
        padding: theme.spacing(1.5, 1.75, 1)
    },

    paneTitleBlock: {
        minWidth: 0
    },

    paneTitle: {
        color: '#F5F8FB',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.12em',
        marginBottom: theme.spacing(0.5),
        textTransform: 'uppercase'
    },

    paneDescription: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 13,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },

    statusBadge: {
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 999,
        color: '#EAF2FA',
        fontSize: 11,
        fontWeight: 600,
        padding: theme.spacing(0.5, 1)
    },

    mediaFrame: {
        background: 'radial-gradient(circle at top, rgba(42, 68, 99, 0.45), rgba(4, 10, 18, 0.96))',
        borderRadius: 18,
        flex: 1,
        margin: theme.spacing(0, 1.25, 1.25),
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',

        '&:hover $devicePanel, &:focus-within $devicePanel': {
            opacity: 1,
            pointerEvents: 'auto',
            transform: 'translateY(0)'
        }
    },

    video: {
        height: '100%',
        objectFit: 'cover',
        width: '100%'
    },

    devicePanel: {
        background: 'rgba(8, 13, 22, 0.86)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        borderRadius: 12,
        bottom: theme.spacing(1.5),
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.32)',
        display: 'grid',
        gap: theme.spacing(0.8),
        opacity: 0,
        padding: theme.spacing(1),
        pointerEvents: 'none',
        position: 'absolute',
        right: theme.spacing(1.5),
        transform: 'translateY(6px)',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        width: 'min(292px, calc(100% - 24px))',
        zIndex: 4
    },

    deviceRow: {
        display: 'grid',
        gap: theme.spacing(0.35)
    },

    deviceLabel: {
        color: 'rgba(236, 244, 252, 0.76)',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
    },

    deviceSelect: {
        background: 'rgba(255, 255, 255, 0.94)',
        border: 0,
        borderRadius: 8,
        color: '#101827',
        font: 'inherit',
        fontSize: 13,
        minWidth: 0,
        padding: theme.spacing(0.8, 0.9),
        width: '100%'
    },

    emptyState: {
        alignItems: 'center',
        color: '#F3F6F9',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(1.25),
        height: '100%',
        justifyContent: 'center',
        padding: theme.spacing(3),
        textAlign: 'center'
    },

    emptyBadge: {
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '50%',
        display: 'flex',
        fontSize: 24,
        fontWeight: 700,
        height: 68,
        justifyContent: 'center',
        width: 68
    },

    emptyTitle: {
        fontSize: 18,
        fontWeight: 700
    },

    emptyCopy: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 14,
        lineHeight: 1.5,
        maxWidth: 280
    },

    participantLabel: {
        background: 'linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.72) 100%)',
        bottom: 0,
        color: '#F8FBFF',
        left: 0,
        padding: theme.spacing(3, 1.25, 1.1),
        position: 'absolute',
        right: 0
    },

    participantName: {
        fontSize: 16,
        fontWeight: 700
    },

    participantMeta: {
        color: 'rgba(233, 241, 247, 0.82)',
        fontSize: 12,
        marginTop: theme.spacing(0.35)
    },

    extraParticipants: {
        alignItems: 'center',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        gap: theme.spacing(1),
        justifyContent: 'space-between',
        marginTop: theme.spacing(1),
        padding: theme.spacing(0.25, 1.5, 0, 1.5),

        [theme.breakpoints.down('sm')]: {
            alignItems: 'flex-start',
            flexDirection: 'column'
        }
    },

    extraParticipantsTitle: {
        color: 'rgba(226, 236, 247, 0.78)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase'
    },

    extraParticipantsList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(0.75),
        justifyContent: 'flex-end'
    },

    extraParticipantChip: {
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 999,
        color: '#F5F8FB',
        fontSize: 12,
        fontWeight: 600,
        padding: theme.spacing(0.65, 1.2)
    }
}));

function getDeviceLabel(device: MediaDeviceInfo, fallback: string, index: number) {
    return device.label || `${fallback} ${index + 1}`;
}

function persistDevicePreference(kind: 'camera' | 'microphone', deviceId: string) {
    if (typeof localStorage === 'undefined') {
        return;
    }

    localStorage.setItem(kind === 'camera' ? 'vrs_camera_device_id' : 'vrs_microphone_device_id', deviceId);
}

function getStoredVrsRole() {
    const role = (typeof localStorage !== 'undefined' && localStorage.getItem('vrs_user_role'))
        || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_user_role'));

    if (role === 'client' || role === 'interpreter') {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_user_role') !== role) {
            sessionStorage.setItem('vrs_user_role', role);
        }

        return role;
    }

    if (typeof window !== 'undefined') {
        const role = new URLSearchParams(window.location.search).get('role');

        if (role === 'client' || role === 'interpreter') {
            return role;
        }
    }

    return undefined;
}

function getStoredTargetClient() {
    const value = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_target_client'))
        || (typeof localStorage !== 'undefined' && localStorage.getItem('vrs_target_client'));

    return value || undefined;
}

function getParticipantName(participant?: IParticipant, fallback = 'Waiting to Join') {
    return participant?.name || participant?.displayName || fallback;
}

function findParticipantByHint(participants: IParticipant[], hint?: string) {
    if (!hint) {
        return undefined;
    }

    const normalizedHint = hint.trim().toLowerCase();

    return participants.find(participant => {
        const candidateNames = [
            participant.id,
            participant.name,
            participant.displayName
        ]
            .filter(Boolean)
            .map(value => value!.toLowerCase());

        return candidateNames.some(value => value === normalizedHint || value.includes(normalizedHint));
    });
}

function withoutParticipant(participants: IParticipant[], participant?: IParticipant) {
    if (!participant) {
        return participants;
    }

    return participants.filter(({ id }) => id !== participant.id);
}

export function isVrsSession(roomName?: string) {
    if (getStoredVrsRole()) {
        return true;
    }

    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_target_client')) {
        return true;
    }

    return Boolean(roomName?.startsWith('vrs-'));
}

function resolvePanes(state: IReduxState): IVRSPane[] {
    const localParticipant = getLocalParticipant(state);
    const remoteParticipants = Array.from(state['features/base/participants'].remote.values())
        .filter((participant: IParticipant) => !participant.fakeParticipant);
    const localRole = getStoredVrsRole();
    const targetClient = getStoredTargetClient();

    let clientParticipant: IParticipant | undefined;
    let interpreterParticipant: IParticipant | undefined;
    let hearingParticipant: IParticipant | undefined;
    let remainingParticipants = remoteParticipants.slice();

    if (localRole === 'interpreter') {
        interpreterParticipant = localParticipant;
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, clientParticipant);
        hearingParticipant = remainingParticipants[0];
    } else if (localRole === 'client') {
        clientParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        hearingParticipant = remainingParticipants[0];
    } else {
        hearingParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
    }

    return [
        {
            description: 'Deaf or hard-of-hearing participant',
            participant: clientParticipant,
            role: 'client',
            statusText: clientParticipant ? 'Live' : 'Awaiting client',
            title: 'Client',
            videoTrack: getVideoTrackByParticipant(state, clientParticipant)
        },
        {
            description: 'Interpreter remains visible throughout the call',
            participant: interpreterParticipant,
            role: 'interpreter',
            statusText: interpreterParticipant ? 'Live' : 'Awaiting interpreter',
            title: 'Interpreter',
            videoTrack: getVideoTrackByParticipant(state, interpreterParticipant)
        },
        {
            description: 'Hearing party on video or phone',
            participant: hearingParticipant,
            role: 'hearing',
            statusText: hearingParticipant ? 'Live' : 'Awaiting hearing party',
            title: 'Hearing Party',
            videoTrack: getVideoTrackByParticipant(state, hearingParticipant)
        }
    ];
}

function getPaneEmptyMessage(role: VRSConferenceRole, hasParticipant: boolean) {
    if (hasParticipant) {
        return 'Joined without an active camera feed.';
    }

    if (role === 'interpreter') {
        return 'An interpreter will appear here as soon as one joins the session.';
    }

    if (role === 'client') {
        return 'The signing participant will appear here when they enter the room.';
    }

    return 'The hearing party will appear here when they join by video or phone.';
}

const VRSLayout = ({
    _audioInputDevices,
    _currentCameraDeviceId,
    _currentMicDeviceId,
    _extras,
    _panes,
    _roomName,
    _videoInputDevices,
    dispatch
}: IProps) => {
    const { classes, cx } = useStyles();
    const visiblePanes = _panes.filter(pane => Boolean(pane.participant));
    const cameraSelectValue = _videoInputDevices.some(device => device.deviceId === _currentCameraDeviceId)
        ? _currentCameraDeviceId
        : '';
    const micSelectValue = _audioInputDevices.some(device => device.deviceId === _currentMicDeviceId)
        ? _currentMicDeviceId
        : '';
    const onCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = event.target.value;

        persistDevicePreference('camera', deviceId);
        dispatch(setVideoInputDeviceAndUpdateSettings(deviceId));
    };
    const onMicChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = event.target.value;

        persistDevicePreference('microphone', deviceId);
        dispatch(setAudioInputDeviceAndUpdateSettings(deviceId));
    };

    if (!visiblePanes.length) {
        return null;
    }

    return (
        <div
            className = { cx(
                classes.root,
                visiblePanes.length === 1 && classes.singlePaneRoot,
                visiblePanes.length === 2 && classes.twoPaneRoot,
                visiblePanes.length >= 3 && classes.threePaneRoot
            ) }
            id = 'vrs-layout-root'>
            {/* Call waiting overlay — renders only when an incoming call arrives */}
            <CallWaitingOverlay />

            {visiblePanes.map(pane => {
                const participantName = getParticipantName(pane.participant, pane.title);
                const emptyMessage = getPaneEmptyMessage(pane.role, Boolean(pane.participant));
                const shouldShowDevicePanel = pane.participant?.local
                    && (pane.role === 'client' || pane.role === 'interpreter');

                return (
                    <section
                        className = { cx(
                            classes.pane,
                            pane.role === 'interpreter' && classes.interpreterPane
                        ) }
                        key = { pane.role }>
                        <div className = { classes.paneHeader }>
                            <div className = { classes.paneTitleBlock }>
                                <div className = { classes.paneTitle }>{pane.title}</div>
                                <div className = { classes.paneDescription }>{pane.description}</div>
                            </div>
                            <div className = { classes.statusBadge }>{pane.statusText}</div>
                        </div>
                        <div className = { classes.mediaFrame }>
                            {pane.videoTrack
                                ? (
                                    <>
                                        <VideoTrack
                                            className = { classes.video }
                                            id = { `vrs-${pane.role}-video` }
                                            muted = { pane.participant?.local ? undefined : true }
                                            style = { VIDEO_STYLE }
                                            videoTrack = { pane.videoTrack } />
                                        <div className = { classes.participantLabel }>
                                            <div className = { classes.participantName }>{participantName}</div>
                                            <div className = { classes.participantMeta }>{pane.description}</div>
                                        </div>
                                        {shouldShowDevicePanel && (
                                            <div
                                                aria-label = 'Camera and microphone choices'
                                                className = { classes.devicePanel }>
                                                <label className = { classes.deviceRow }>
                                                    <span className = { classes.deviceLabel }>Camera</span>
                                                    <select
                                                        className = { classes.deviceSelect }
                                                        onChange = { onCameraChange }
                                                        value = { cameraSelectValue }>
                                                        <option value = ''>Default camera</option>
                                                        {_videoInputDevices.map((device, index) => (
                                                            <option
                                                                key = { device.deviceId }
                                                                value = { device.deviceId }>
                                                                {getDeviceLabel(device, 'Camera', index)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className = { classes.deviceRow }>
                                                    <span className = { classes.deviceLabel }>Mic</span>
                                                    <select
                                                        className = { classes.deviceSelect }
                                                        onChange = { onMicChange }
                                                        value = { micSelectValue }>
                                                        <option value = ''>Default mic</option>
                                                        {_audioInputDevices.map((device, index) => (
                                                            <option
                                                                key = { device.deviceId }
                                                                value = { device.deviceId }>
                                                                {getDeviceLabel(device, 'Mic', index)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                        )}
                                    </>
                                )
                                : (
                                    <div className = { classes.emptyState }>
                                        <div className = { classes.emptyBadge }>{pane.title.charAt(0)}</div>
                                        <div className = { classes.emptyTitle }>{participantName}</div>
                                        <div className = { classes.emptyCopy }>{emptyMessage}</div>
                                    </div>
                                )}
                        </div>
                    </section>
                );
            })}
            {_extras.length > 0 && (
                <div className = { classes.extraParticipants }>
                    <div className = { classes.extraParticipantsTitle }>
                        {`Additional participants (${_extras.length})`}
                    </div>
                    <div className = { classes.extraParticipantsList }>
                        {_extras.map(participant => (
                            <div className = { classes.extraParticipantChip } key = { participant.id }>
                                {getParticipantName(participant, participant.id)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* In-call text chat panel */}
            {_roomName && <InCallChatPanel callId = { _roomName } />}
        </div>
    );
};

function _mapStateToProps(state: IReduxState): Omit<IProps, 'dispatch'> {
    const localParticipant = getLocalParticipant(state);
    const remoteParticipants = Array.from(state['features/base/participants'].remote.values())
        .filter((participant: IParticipant) => !participant.fakeParticipant);
    const localRole = getStoredVrsRole();
    const targetClient = getStoredTargetClient();

    let clientParticipant: IParticipant | undefined;
    let interpreterParticipant: IParticipant | undefined;
    let hearingParticipant: IParticipant | undefined;
    let remainingParticipants = remoteParticipants.slice();

    if (localRole === 'interpreter') {
        interpreterParticipant = localParticipant;
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, clientParticipant);
        hearingParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, hearingParticipant);
    } else if (localRole === 'client') {
        clientParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        hearingParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, hearingParticipant);
    } else {
        hearingParticipant = localParticipant;
        interpreterParticipant = remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, interpreterParticipant);
        clientParticipant = findParticipantByHint(remainingParticipants, targetClient) || remainingParticipants[0];
        remainingParticipants = withoutParticipant(remainingParticipants, clientParticipant);
    }

    return {
        _audioInputDevices: state['features/base/devices'].availableDevices.audioInput || [],
        _currentCameraDeviceId: getCurrentCameraDeviceId(state),
        _currentMicDeviceId: getCurrentMicDeviceId(state),
        _extras: remainingParticipants,
        _roomName: getRoomName(state),
        _videoInputDevices: state['features/base/devices'].availableDevices.videoInput || [],
        _panes: [
            {
                description: 'Deaf or hard-of-hearing participant',
                participant: clientParticipant,
                role: 'client' as const,
                statusText: clientParticipant ? 'Live' : 'Awaiting client',
                title: 'Client',
                videoTrack: getVideoTrackByParticipant(state, clientParticipant)
            },
            {
                description: 'Interpreter remains visible throughout the call',
                participant: interpreterParticipant,
                role: 'interpreter' as const,
                statusText: interpreterParticipant ? 'Live' : 'Awaiting interpreter',
                title: 'Interpreter',
                videoTrack: getVideoTrackByParticipant(state, interpreterParticipant)
            },
            {
                description: 'Hearing party on video or phone',
                participant: hearingParticipant,
                role: 'hearing' as const,
                statusText: hearingParticipant ? 'Live' : 'Awaiting hearing party',
                title: 'Hearing Party',
                videoTrack: getVideoTrackByParticipant(state, hearingParticipant)
            }
        ]
    };
}

export default connect(_mapStateToProps)(VRSLayout);
