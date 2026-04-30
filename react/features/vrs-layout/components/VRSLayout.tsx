import React from 'react';
import { connect } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import { IReduxState, IStore } from '../../app/types';
import { getRoomName } from '../../base/conference/functions';
import {
    setAudioInputDeviceAndUpdateSettings,
    setVideoInputDeviceAndUpdateSettings
} from '../../base/devices/actions.web';
import VideoTrack from '../../base/media/components/web/VideoTrack';
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
type DeviceOption = Pick<MediaDeviceInfo, 'deviceId' | 'label'>;

interface IStoredDevicePreference {
    deviceId: string;
    label: string;
}

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

const useStyles = makeStyles()(theme => {
    return {
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
            width: '100%',

            '& option': {
                background: '#FFFFFF',
                color: '#101827'
            }
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
            gridColumn: '1 / -1',
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
    };
});

/**
 * Returns a stable label for a device option.
 *
 * @param {Object} device - The media device option.
 * @param {string} fallback - The fallback label prefix.
 * @param {number} index - The option index.
 * @returns {string}
 */
function getDeviceLabel(device: DeviceOption, fallback: string, index: number) {
    return device.label || `${fallback} ${index + 1}`;
}

/**
 * Persists the selected input device for profile and room handoff.
 *
 * @param {string} kind - The input device kind.
 * @param {string} deviceId - The browser device id.
 * @param {string} label - The browser device label.
 * @returns {void}
 */
function persistDevicePreference(kind: 'camera' | 'microphone', deviceId: string, label = '') {
    if (typeof localStorage === 'undefined') {
        return;
    }

    localStorage.setItem(kind === 'camera' ? 'vrs_camera_device_id' : 'vrs_microphone_device_id', deviceId);

    try {
        const stored = JSON.parse(localStorage.getItem('vrs_room_media_devices') || '{}') || {};

        if (kind === 'camera') {
            stored.cameraDeviceId = deviceId;
            stored.cameraLabel = label;
        } else {
            stored.microphoneDeviceId = deviceId;
            stored.microphoneLabel = label;
        }

        stored.updatedAt = new Date().toISOString();
        localStorage.setItem('vrs_room_media_devices', JSON.stringify(stored));
    } catch {
        // The source-of-truth preference above is still stored even if the
        // room handoff metadata cannot be updated.
    }
}

/**
 * Reads the device selected before the participant entered the room.
 *
 * @param {string} kind - The input device kind.
 * @returns {Object|undefined}
 */
function getStoredDevicePreference(kind: 'camera' | 'microphone'): IStoredDevicePreference | undefined {
    if (typeof localStorage === 'undefined') {
        return undefined;
    }

    try {
        const stored = JSON.parse(localStorage.getItem('vrs_room_media_devices') || '{}') || {};
        const deviceId = kind === 'camera' ? stored.cameraDeviceId : stored.microphoneDeviceId;
        const label = kind === 'camera' ? stored.cameraLabel : stored.microphoneLabel;

        if (deviceId) {
            return {
                deviceId,
                label: label || (kind === 'camera' ? 'Selected camera' : 'Selected mic')
            };
        }
    } catch {
        // Fall back to the simple preference key below.
    }

    const deviceId = localStorage.getItem(kind === 'camera' ? 'vrs_camera_device_id' : 'vrs_microphone_device_id');

    return deviceId ? {
        deviceId,
        label: kind === 'camera' ? 'Selected camera' : 'Selected mic'
    } : undefined;
}

/**
 * Keeps the inherited device visible even if the current Jitsi list omits it.
 *
 * @param {Array<MediaDeviceInfo>} devices - The devices reported by Jitsi.
 * @param {Object|undefined} preference - The inherited profile preference.
 * @returns {Array<Object>}
 */
function appendStoredDeviceOption(devices: MediaDeviceInfo[], preference?: IStoredDevicePreference) {
    if (!preference?.deviceId || devices.some(device => device.deviceId === preference.deviceId)) {
        return devices;
    }

    return [
        ...devices,
        {
            deviceId: preference.deviceId,
            label: preference.label
        } as DeviceOption
    ];
}

/**
 * Returns the VRS role stored by profile navigation or room URL.
 *
 * @returns {string|undefined}
 */
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
        const queryRole = new URLSearchParams(window.location.search).get('role');

        if (queryRole === 'client' || queryRole === 'interpreter') {
            return queryRole;
        }
    }

    return undefined;
}

/**
 * Returns the client hint used to identify the target participant.
 *
 * @returns {string|undefined}
 */
function getStoredTargetClient() {
    const value = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_target_client'))
        || (typeof localStorage !== 'undefined' && localStorage.getItem('vrs_target_client'));

    return value || undefined;
}

/**
 * Returns the best display name for a room participant.
 *
 * @param {Object|undefined} participant - The participant to name.
 * @param {string} fallback - The fallback display name.
 * @returns {string}
 */
function getParticipantName(participant?: IParticipant, fallback = 'Waiting to Join') {
    return participant?.name || participant?.displayName || fallback;
}

/**
 * Filters out non-human system participants from the VRS layout.
 *
 * @param {Object} participant - The participant to inspect.
 * @returns {boolean}
 */
function isVisibleRoomParticipant(participant: IParticipant) {
    return !participant.fakeParticipant
        && !participant.isJigasi
        && !participant.botType;
}

/**
 * Determines whether a video tile should render the live track.
 *
 * @param {Object|undefined} videoTrack - The participant video track.
 * @returns {boolean}
 */
function isRenderableVideoTrack(videoTrack?: any) {
    if (!videoTrack) {
        return false;
    }

    const jitsiTrackMuted = typeof videoTrack.jitsiTrack?.isMuted === 'function'
        ? videoTrack.jitsiTrack.isMuted()
        : false;

    return !videoTrack.muted
        && !jitsiTrackMuted
        && videoTrack.isReceivingData !== false;
}

/**
 * Returns the status text shown in a participant pane.
 *
 * @param {Object|undefined} participant - The participant in the pane.
 * @param {Object} videoTrack - The participant video track.
 * @param {string} awaitingText - The text to show before join.
 * @returns {string}
 */
function getPaneStatusText(participant: IParticipant | undefined, videoTrack: any, awaitingText: string) {
    if (!participant) {
        return awaitingText;
    }

    return isRenderableVideoTrack(videoTrack) ? 'Live' : 'Camera off';
}

/**
 * Finds a participant by id or display-name hint.
 *
 * @param {Array<Object>} participants - The participants to search.
 * @param {string|undefined} hint - The id or name hint.
 * @returns {Object|undefined}
 */
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
            .map(value => String(value).toLowerCase());

        return candidateNames.some(value => value === normalizedHint || value.includes(normalizedHint));
    });
}

/**
 * Removes one participant from a participant list.
 *
 * @param {Array<Object>} participants - The source participant list.
 * @param {Object|undefined} participant - The participant to remove.
 * @returns {Array<Object>}
 */
function withoutParticipant(participants: IParticipant[], participant?: IParticipant) {
    if (!participant) {
        return participants;
    }

    return participants.filter(({ id }) => id !== participant.id);
}

/**
 * Determines whether the current room should use the VRS/VRI layout.
 *
 * @param {string|undefined} roomName - The current conference room name.
 * @returns {boolean}
 */
export function isVrsSession(roomName?: string) {
    if (getStoredVrsRole()) {
        return true;
    }

    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vrs_target_client')) {
        return true;
    }

    return Boolean(roomName?.startsWith('vrs-'));
}

/**
 * Returns the fallback text shown when no video track is renderable.
 *
 * @param {string} role - The pane role.
 * @param {boolean} hasParticipant - Whether a participant has joined.
 * @returns {string}
 */
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

/**
 * Renders the custom VRS/VRI in-room participant layout.
 *
 * @param {Object} props - The connected component props.
 * @returns {React.ReactElement|null}
 */
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
    const storedCameraPreference = getStoredDevicePreference('camera');
    const storedMicPreference = getStoredDevicePreference('microphone');
    const videoInputOptions = appendStoredDeviceOption(_videoInputDevices, storedCameraPreference);
    const audioInputOptions = appendStoredDeviceOption(_audioInputDevices, storedMicPreference);
    const cameraSelectValue = videoInputOptions.some(device => device.deviceId === _currentCameraDeviceId)
        ? _currentCameraDeviceId
        : storedCameraPreference?.deviceId || '';
    const micSelectValue = audioInputOptions.some(device => device.deviceId === _currentMicDeviceId)
        ? _currentMicDeviceId
        : storedMicPreference?.deviceId || '';
    const onCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = event.target.value;
        const selectedDevice = videoInputOptions.find(device => device.deviceId === deviceId);

        persistDevicePreference('camera', deviceId, selectedDevice?.label || '');
        dispatch(setVideoInputDeviceAndUpdateSettings(deviceId));
    };
    const onMicChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const deviceId = event.target.value;
        const selectedDevice = audioInputOptions.find(device => device.deviceId === deviceId);

        persistDevicePreference('microphone', deviceId, selectedDevice?.label || '');
        dispatch(setAudioInputDeviceAndUpdateSettings(deviceId));
    };

    const cameraOptions = videoInputOptions.map((device, index) => (
        <option
            key = { device.deviceId }
            value = { device.deviceId }>
            {getDeviceLabel(device, 'Camera', index)}
        </option>
    ));
    const micOptions = audioInputOptions.map((device, index) => (
        <option
            key = { device.deviceId }
            value = { device.deviceId }>
            {getDeviceLabel(device, 'Mic', index)}
        </option>
    ));
    const extraParticipantChips = _extras.map(participant => (
        <div
            className = { classes.extraParticipantChip }
            key = { participant.id }>
            {getParticipantName(participant, participant.id)}
        </div>
    ));

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
                const shouldRenderVideo = isRenderableVideoTrack(pane.videoTrack);
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
                            {shouldRenderVideo
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
                                    </>
                                )
                                : (
                                    <div className = { classes.emptyState }>
                                        <div className = { classes.emptyBadge }>{pane.title.charAt(0)}</div>
                                        <div className = { classes.emptyTitle }>{participantName}</div>
                                        <div className = { classes.emptyCopy }>{emptyMessage}</div>
                                    </div>
                                )}
                            {shouldShowDevicePanel && (
                                <div
                                    aria-label = 'Camera and microphone choices'
                                    className = { classes.devicePanel }>
                                    <label className = { classes.deviceRow }>
                                        <span className = { classes.deviceLabel }>Camera</span>
                                        <select
                                            className = { classes.deviceSelect }
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onChange = { onCameraChange }
                                            value = { cameraSelectValue }>
                                            <option value = ''>Default camera</option>
                                            {cameraOptions}
                                        </select>
                                    </label>
                                    <label className = { classes.deviceRow }>
                                        <span className = { classes.deviceLabel }>Mic</span>
                                        <select
                                            className = { classes.deviceSelect }
                                            // eslint-disable-next-line react/jsx-no-bind
                                            onChange = { onMicChange }
                                            value = { micSelectValue }>
                                            <option value = ''>Default mic</option>
                                            {micOptions}
                                        </select>
                                    </label>
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
                        {extraParticipantChips}
                    </div>
                </div>
            )}
            {/* In-call text chat panel */}
            {_roomName && <InCallChatPanel callId = { _roomName } />}
        </div>
    );
};

/**
 * Maps conference state into the VRS layout panes.
 *
 * @param {Object} state - The redux state.
 * @returns {Object}
 */
function _mapStateToProps(state: IReduxState): Omit<IProps, 'dispatch'> {
    const localParticipant = getLocalParticipant(state);
    const remoteParticipants = Array.from(state['features/base/participants'].remote.values())
        .filter(isVisibleRoomParticipant);
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

    const clientVideoTrack = getVideoTrackByParticipant(state, clientParticipant);
    const interpreterVideoTrack = getVideoTrackByParticipant(state, interpreterParticipant);
    const hearingVideoTrack = getVideoTrackByParticipant(state, hearingParticipant);

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
                statusText: getPaneStatusText(clientParticipant, clientVideoTrack, 'Awaiting client'),
                title: 'Client',
                videoTrack: clientVideoTrack
            },
            {
                description: 'Interpreter remains visible throughout the call',
                participant: interpreterParticipant,
                role: 'interpreter' as const,
                statusText: getPaneStatusText(interpreterParticipant, interpreterVideoTrack, 'Awaiting interpreter'),
                title: 'Interpreter',
                videoTrack: interpreterVideoTrack
            },
            {
                description: 'Hearing party on video or phone',
                participant: hearingParticipant,
                role: 'hearing' as const,
                statusText: getPaneStatusText(hearingParticipant, hearingVideoTrack, 'Awaiting hearing party'),
                title: 'Hearing Party',
                videoTrack: hearingVideoTrack
            }
        ]
    };
}

export default connect(_mapStateToProps)(VRSLayout);
