/* eslint-disable react/jsx-no-bind */
import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { connect, useDispatch } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import Button from '../../../base/ui/components/web/Button';
import { BUTTON_TYPES } from '../../../base/ui/constants.any';
import { isInterpreter, isClient } from '../../../base/user-role/functions';
import Switch from '../../../base/ui/components/web/Switch';
import { queueService, QueueStatus } from '../../../interpreter-queue/InterpreterQueueService';
import InterpreterRequestPopup, { InterpreterRequest } from '../../../interpreter-queue/components/web/InterpreterRequestPopup';
import MinimizedRequestList from '../../../interpreter-queue/components/web/MinimizedRequestList';
import { getPersistentJson } from '../../../vrs-auth/storage';

import { IReduxState } from '../../../app/types';
import Avatar from '../../../base/avatar/components/Avatar';
import { isNameReadOnly } from '../../../base/config/functions.web';
import { IconArrowDown, IconArrowUp, IconPhoneRinging, IconVolumeOff } from '../../../base/icons/svg';
import { isVideoMutedByUser } from '../../../base/media/functions';
import { getLocalParticipant } from '../../../base/participants/functions';
import Popover from '../../../base/popover/components/Popover.web';
import ActionButton from '../../../base/premeeting/components/web/ActionButton';
import PreMeetingScreen from '../../../base/premeeting/components/web/PreMeetingScreen';
import { updateSettings } from '../../../base/settings/actions';
import { getDisplayName } from '../../../base/settings/functions.web';
import { withPixelLineHeight } from '../../../base/styles/functions.web';
import { getLocalJitsiVideoTrack } from '../../../base/tracks/functions.web';
import Input from '../../../base/ui/components/web/Input';
import isInsecureRoomName from '../../../base/util/isInsecureRoomName';
import { openDisplayNamePrompt } from '../../../display-name/actions';
import { isUnsafeRoomWarningEnabled } from '../../../prejoin/functions';
import {
    joinConference as joinConferenceAction,
    joinConferenceWithoutAudio as joinConferenceWithoutAudioAction,
    setJoinByPhoneDialogVisiblity as setJoinByPhoneDialogVisiblityAction
} from '../../actions.web';
import {
    isDeviceStatusVisible,
    isDisplayNameRequired,
    isJoinByPhoneButtonVisible,
    isJoinByPhoneDialogVisible,
    isPrejoinDisplayNameVisible
} from '../../functions';
import { hasDisplayName } from '../../utils';

import JoinByPhoneDialog from './dialogs/JoinByPhoneDialog';

declare var config: any;

interface IProps {

    /**
     * Flag signaling if the device status is visible or not.
     */
    deviceStatusVisible: boolean;

    /**
     * If join by phone button should be visible.
     */
    hasJoinByPhoneButton: boolean;

    /**
     * Flag signaling if the display name is visible or not.
     */
    isDisplayNameVisible: boolean;

    /**
     * Joins the current meeting.
     */
    joinConference: Function;

    /**
     * Joins the current meeting without audio.
     */
    joinConferenceWithoutAudio: Function;

    /**
     * Whether conference join is in progress.
     */
    joiningInProgress?: boolean;

    /**
     * The name of the user that is about to join.
     */
    name: string;

    /**
     * Local participant id.
     */
    participantId?: string;

    /**
     * The prejoin config.
     */
    prejoinConfig?: any;

    /**
     * Whether the name input should be read only or not.
     */
    readOnlyName: boolean;

    /**
     * Sets visibility of the 'JoinByPhoneDialog'.
     */
    setJoinByPhoneDialogVisiblity: Function;

    /**
     * Flag signaling the visibility of camera preview.
     */
    showCameraPreview: boolean;

    /**
     * If 'JoinByPhoneDialog' is visible or not.
     */
    showDialog: boolean;

    /**
     * If should show an error when joining without a name.
     */
    showErrorOnJoin: boolean;

    /**
     * If the recording warning is visible or not.
     */
    showRecordingWarning: boolean;

    /**
     * If should show unsafe room warning when joining.
     */
    showUnsafeRoomWarning: boolean;

    /**
     * Whether the user has approved to join a room with unsafe name.
     */
    unsafeRoomConsent?: boolean;

    /**
     * Updates settings.
     */
    updateSettings: Function;

    /**
     * The JitsiLocalTrack to display.
     */
    videoTrack?: Object;
}

interface SpeedDialEntry {
    id: string | number;
    name: string;
    phone_number: string;
}

function getApiBase() {
    if (typeof config !== 'undefined' && config.vrs?.queueServiceUrl) {
        const wsUrl = config.vrs.queueServiceUrl as string;

        return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    }

    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}

function getCurrentRoomName() {
    if (typeof window === 'undefined') {
        return '';
    }

    const path = window.location.pathname.split('/').filter(Boolean);
    const roomName = path[path.length - 1];

    if (!roomName || roomName.endsWith('.html')) {
        return '';
    }

    return roomName;
}

function getPreferredClientName() {
    const storedUser = getPersistentJson<{ name?: string }>('vrs_user_info');

    return storedUser?.name?.trim() || '';
}

function getFirstName(name?: string) {
    return (name || '').trim().split(/\s+/)[0] || '';
}

const useStyles = makeStyles()(theme => {
    return {
        inputContainer: {
            width: '100%'
        },

        input: {
            width: '100%',
            marginBottom: theme.spacing(3),

            '& input': {
                textAlign: 'center'
            }
        },

        avatarContainer: {
            display: 'flex',
            alignItems: 'center',
            flexDirection: 'column'
        },

        avatar: {
            margin: `${theme.spacing(2)} auto ${theme.spacing(3)}`
        },

        avatarName: {
            ...withPixelLineHeight(theme.typography.bodyShortBoldLarge),
            color: theme.palette.text01,
            marginBottom: theme.spacing(3),
            textAlign: 'center'
        },

        interpreterButton: {
            marginTop: theme.spacing(2),
            marginBottom: theme.spacing(1),
            minHeight: '48px',
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.success02,
            color: theme.palette.text01,
            fontSize: '14px',
            fontWeight: 600,
            transition: 'all 0.2s ease-in-out',
            border: 'none',
            cursor: 'pointer',

            '&:hover': {
                backgroundColor: theme.palette.success01,
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
            },

            '&:active': {
                transform: 'translateY(0)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }
        },

        interpreterToggleContainer: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: theme.spacing(2),
            marginBottom: theme.spacing(1),
            padding: theme.spacing(2),
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.ui02,
            border: `1px solid ${theme.palette.ui03}`
        },

        interpreterToggleLabel: {
            ...withPixelLineHeight(theme.typography.bodyShortRegular),
            color: theme.palette.text01,
            marginRight: theme.spacing(2),
            fontWeight: 500
        },

        interpreterToggleWrapper: {
            display: 'flex',
            alignItems: 'center'
        },

        interpreterToggleStatus: {
            ...withPixelLineHeight(theme.typography.labelBold),
            marginLeft: theme.spacing(2),
            minWidth: '60px',
            textAlign: 'center'
        },

        activeStatus: {
            color: theme.palette.success01
        },

        inactiveStatus: {
            color: theme.palette.text03
        },

        error: {
            backgroundColor: theme.palette.actionDanger,
            color: theme.palette.text01,
            borderRadius: theme.shape.borderRadius,
            width: '100%',
            ...withPixelLineHeight(theme.typography.labelRegular),
            boxSizing: 'border-box',
            padding: theme.spacing(1),
            textAlign: 'center',
            marginTop: `-${theme.spacing(2)}`,
            marginBottom: theme.spacing(3)
        },

        dropdownContainer: {
            position: 'relative',
            width: '100%'
        },

        dropdownButtons: {
            width: '300px',
            padding: '8px 0',
            backgroundColor: theme.palette.action02,
            color: theme.palette.text04,
            borderRadius: theme.shape.borderRadius,
            position: 'relative',
            top: `-${theme.spacing(3)}`,

            '@media (max-width: 511px)': {
                margin: '0 auto',
                top: 0
            },

            '@media (max-width: 420px)': {
                top: 0,
                width: 'calc(100% - 32px)'
            }
        },

        contactsPanel: {
            marginTop: theme.spacing(2),
            padding: theme.spacing(2),
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.ui02,
            border: `1px solid ${theme.palette.ui03}`,
            textAlign: 'left'
        },

        contactsPanelHeader: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing(2),
            marginBottom: theme.spacing(1)
        },

        contactsPanelTitle: {
            ...withPixelLineHeight(theme.typography.bodyShortBold),
            color: theme.palette.text01
        },

        contactsPanelBody: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing(1)
        },

        contactsPanelHint: {
            ...withPixelLineHeight(theme.typography.labelRegular),
            color: theme.palette.text03
        },

        contactsList: {
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing(1)
        },

        contactRow: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing(1),
            padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.action02
        },

        contactMeta: {
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column'
        },

        contactName: {
            ...withPixelLineHeight(theme.typography.bodyShortBold),
            color: theme.palette.text01
        },

        contactPhone: {
            ...withPixelLineHeight(theme.typography.labelRegular),
            color: theme.palette.text03
        },

        contactAction: {
            flexShrink: 0
        },

        inviteButtonRow: {
            display: 'flex',
            gap: theme.spacing(1)
        }
    };
});

const Prejoin = ({
    deviceStatusVisible,
    hasJoinByPhoneButton,
    isDisplayNameVisible,
    joinConference,
    joinConferenceWithoutAudio,
    joiningInProgress,
    name,
    participantId,
    prejoinConfig,
    readOnlyName,
    setJoinByPhoneDialogVisiblity,
    showCameraPreview,
    showDialog,
    showErrorOnJoin,
    showRecordingWarning,
    showUnsafeRoomWarning,
    unsafeRoomConsent,
    updateSettings: dispatchUpdateSettings,
    videoTrack
}: IProps) => {
    const showDisplayNameField = useMemo(
        () => isDisplayNameVisible && !readOnlyName,
        [ isDisplayNameVisible, readOnlyName ]);
    const showErrorOnField = useMemo(
        () => showDisplayNameField && showErrorOnJoin,
        [ showDisplayNameField, showErrorOnJoin ]);
    const [ showJoinByPhoneButtons, setShowJoinByPhoneButtons ] = useState(false);
    const [ isInterpreterActive, setIsInterpreterActive ] = useState(true);
    const [ queueStatus, setQueueStatus ] = useState<QueueStatus | null>(null);
    const [ requestStatus, setRequestStatus ] = useState<'idle' | 'requesting' | 'queued' | 'matched'>('idle');
    const [ matchInfo, setMatchInfo ] = useState<any>(null);
    const [ joinCountdown, setJoinCountdown ] = useState<number>(0);
    
    // New state for interpreter request management
    const [ currentRequest, setCurrentRequest ] = useState<InterpreterRequest | null>(null);
    const [ minimizedRequests, setMinimizedRequests ] = useState<InterpreterRequest[]>([]);
    const [ currentRequestId, setCurrentRequestId ] = useState<string | null>(null);
    const [ speedDialEntries, setSpeedDialEntries ] = useState<SpeedDialEntry[]>([]);
    const [ contactsOpen, setContactsOpen ] = useState(true);
    const [ contactsLoading, setContactsLoading ] = useState(false);
    const [ contactsError, setContactsError ] = useState('');
    const [ copiedInviteLabel, setCopiedInviteLabel ] = useState<string | null>(null);
    const { classes } = useStyles();
    const { t } = useTranslation();
    const dispatch = useDispatch();
    const currentRoomName = getCurrentRoomName();
    const inviteLink = currentRoomName
        ? `${window.location.origin}/${currentRoomName}?role=client`
        : '';

    useEffect(() => {
        if (!isClient() || readOnlyName || name) {
            return;
        }

        const preferredName = getFirstName(getPreferredClientName());

        if (preferredName) {
            dispatchUpdateSettings({
                displayName: preferredName
            });
        }
    }, [ dispatchUpdateSettings, name, readOnlyName ]);

    useEffect(() => {
        const auth = getPersistentJson<{ token?: string }>('vrs_auth_token');

        if (!isClient() || !auth?.token || !currentRoomName) {
            return;
        }

        setContactsLoading(true);
        setContactsError('');

        fetch(`${getApiBase()}/api/client/speed-dial`, {
            headers: {
                Authorization: `Bearer ${auth.token}`
            }
        })
            .then(async response => {
                const payload = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(payload.error || 'Unable to load contacts.');
                }

                setSpeedDialEntries(Array.isArray(payload.entries) ? payload.entries.slice(0, 5) : []);
            })
            .catch(error => {
                setContactsError(error instanceof Error ? error.message : 'Unable to load contacts.');
            })
            .finally(() => {
                setContactsLoading(false);
            });
    }, [ currentRoomName ]);

    // Set up queue service event listeners
    useEffect(() => {
        const handleQueueStatus = (status: QueueStatus) => {
            setQueueStatus(status);
        };

        const handleMatchFound = (data: any) => {
            setRequestStatus('matched');
            setMatchInfo(data);
            console.log('🎉 Match found!', data);
            
            // Countdown timer for auto-join
            let countdown = 3;
            setJoinCountdown(countdown);
            
            const countdownInterval = setInterval(() => {
                countdown--;
                setJoinCountdown(countdown);
                
                if (countdown <= 0) {
                    clearInterval(countdownInterval);
                    console.log(`Joining interpreter session: ${data.roomName}`);
                    window.location.href = `/${data.roomName}`;
                }
            }, 1000);
        };

        const handleRequestQueued = (data: any) => {
            setRequestStatus('queued');
            console.log('⏳ Request queued at position:', data.position);
        };

        const handleRequestAssigned = (data: any) => {
            console.log('📋 New request assigned:', data);
            
            // Show notification and auto-join for interpreters
            setTimeout(() => {
                const shouldJoin = confirm(
                    `New client "${data.clientName}" needs interpretation (${data.language}). Join session?`
                );
                
                if (shouldJoin) {
                    console.log(`Joining interpreter session: ${data.roomName}`);
                    window.location.href = data.joinUrl;
                }
            }, 1000); // 1 second delay
        };

        // New handlers for interpreter request popup flow
        const handleInterpreterRequest = (data: any) => {
            console.log('📞 New interpreter request received:', data);
            const request: InterpreterRequest = {
                id: data.requestId,
                clientName: data.clientName,
                language: data.language,
                timestamp: data.timestamp || Date.now(),
                roomName: data.roomName
            };
            
            // Show popup for the new request
            setCurrentRequest(request);
        };

        const handleRequestAccepted = (data: any) => {
            console.log('✅ Request accepted by interpreter:', data);
            // Handle on client side - maybe show "Interpreter joining..." message
            if (isClient()) {
                setRequestStatus('matched');
                setMatchInfo(data);
            }
        };

        const handleRequestDeclined = (data: any) => {
            console.log('❌ Request declined by interpreter:', data);
            // Request was declined, might get routed to next interpreter
        };

        const handleMeetingInitiated = (data: any) => {
            console.log('🚀 Meeting initiated:', data);
            if (!data.roomName) return;

            // If already on the correct Prejoin page, skip the page reload and
            // join the conference directly so the client doesn't bounce.
            const currentRoom = window.location.pathname.replace(/^\//, '').split('?')[0];
            if (currentRoom === data.roomName) {
                joinConference();
            } else {
                window.location.href = `/${data.roomName}`;
            }
        };

        // Set up listeners
        queueService.on('queueStatus', handleQueueStatus);
        queueService.on('matchFound', handleMatchFound);
        queueService.on('requestQueued', handleRequestQueued);
        queueService.on('requestAssigned', handleRequestAssigned);
        
        // New listeners for interpreter request popup flow
        queueService.on('interpreterRequest', handleInterpreterRequest);
        queueService.on('requestAccepted', handleRequestAccepted);
        queueService.on('requestDeclined', handleRequestDeclined);
        queueService.on('meetingInitiated', handleMeetingInitiated);

        // Cleanup on unmount
        return () => {
            queueService.off('queueStatus', handleQueueStatus);
            queueService.off('matchFound', handleMatchFound);
            queueService.off('requestQueued', handleRequestQueued);
            queueService.off('requestAssigned', handleRequestAssigned);
            
            // Cleanup new listeners
            queueService.off('interpreterRequest', handleInterpreterRequest);
            queueService.off('requestAccepted', handleRequestAccepted);
            queueService.off('requestDeclined', handleRequestDeclined);
            queueService.off('meetingInitiated', handleMeetingInitiated);
        };
    }, []);


    /**
     * Handler for the join button.
     *
     * @param {Object} e - The synthetic event.
     * @returns {void}
     */
    const onJoinButtonClick = () => {
        if (showErrorOnJoin) {
            dispatch(openDisplayNamePrompt({
                onPostSubmit: joinConference,
                validateInput: hasDisplayName
            }));

            return;
        }
        joinConference();
    };

    /**
     * Closes the dropdown.
     *
     * @returns {void}
     */
    const onDropdownClose = () => {
        setShowJoinByPhoneButtons(false);
    };

    /**
     * Displays the join by phone buttons dropdown.
     *
     * @param {Object} e - The synthetic event.
     * @returns {void}
     */
    const onOptionsClick = (e?: React.KeyboardEvent | React.MouseEvent | undefined) => {
        e?.stopPropagation();

        setShowJoinByPhoneButtons(show => !show);
    };

    /**
     * Sets the guest participant name.
     *
     * @param {string} displayName - Participant name.
     * @returns {void}
     */
    const setName = (displayName: string) => {
        dispatchUpdateSettings({
            displayName
        });
    };

    /**
     * Closes the join by phone dialog.
     *
     * @returns {undefined}
     */
    const closeDialog = () => {
        setJoinByPhoneDialogVisiblity(false);
    };

    /**
     * Displays the dialog for joining a meeting by phone.
     *
     * @returns {undefined}
     */
    const doShowDialog = () => {
        setJoinByPhoneDialogVisiblity(true);
        onDropdownClose();
    };

    /**
     * KeyPress handler for accessibility.
     *
     * @param {Object} e - The key event to handle.
     *
     * @returns {void}
     */
    const showDialogKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            doShowDialog();
        }
    };

    /**
     * Handler for the interpreter active/inactive toggle.
     *
     * @returns {void}
     */
    const handleInterpreterToggle = (newActiveState: boolean = false) => {
        setIsInterpreterActive(newActiveState);
        console.log(`Interpreter ${newActiveState ? 'activated' : 'deactivated'} in queue`);
        
        // Update status in queue service
        queueService.updateInterpreterStatus(
            newActiveState ? 'active' : 'inactive',
            name || 'Anonymous Interpreter',
            ['en', 'es'] // TODO: get from user preferences
        );
    };

    const handleRequestInterpreter = () => {
        if (requestStatus === 'idle') {
            // Request interpreter
            setRequestStatus('requesting');
            setCurrentRequestId('client-' + Date.now()); // Generate unique request ID
            queueService.requestInterpreter('any', name || 'Anonymous Client');
        } else if (requestStatus === 'requesting' || requestStatus === 'queued') {
            // Cancel request
            setRequestStatus('idle');
            setCurrentRequestId(null);
            queueService.cancelRequest();
        }
    };

    // Handlers for interpreter popup actions
    const handleAcceptRequest = (requestId: string) => {
        console.log('Accepting request:', requestId);
        // Use the room the client is already in — don't generate a new one.
        const roomName = currentRequest?.roomName;
        queueService.acceptRequest(requestId, roomName);
        setCurrentRequest(null);
    };

    const handleDeclineRequest = (requestId: string) => {
        console.log('Declining request:', requestId);
        queueService.declineRequest(requestId);
        
        // Move to minimized list
        if (currentRequest) {
            setMinimizedRequests(prev => [...prev, currentRequest]);
        }
        setCurrentRequest(null);
    };

    const handleDismissRequest = (requestId: string) => {
        console.log('Dismissing request:', requestId);
        
        // Move to minimized list without sending decline
        if (currentRequest) {
            setMinimizedRequests(prev => [...prev, currentRequest]);
        }
        setCurrentRequest(null);
    };

    const handleRemoveMinimizedRequest = (requestId: string) => {
        setMinimizedRequests(prev => prev.filter(req => req.id !== requestId));
    };

    const copyInviteLink = async (label: string) => {
        if (!inviteLink) {
            return;
        }

        const inviteText = `Join me on Malka VRS: ${inviteLink}`;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(inviteText);
            } else {
                throw new Error('Clipboard unavailable');
            }

            setCopiedInviteLabel(label);
            window.setTimeout(() => setCopiedInviteLabel(current => current === label ? null : current), 2000);
        } catch {
            window.prompt('Copy this secure invite link:', inviteLink);
        }
    };

    /**
     * KeyPress handler for accessibility.
     *
     * @param {Object} e - The key event to handle.
     *
     * @returns {void}
     */
    const onJoinConferenceWithoutAudioKeyPress = (e: React.KeyboardEvent) => {
        if (joinConferenceWithoutAudio
            && (e.key === ' '
                || e.key === 'Enter')) {
            e.preventDefault();
            joinConferenceWithoutAudio();
        }
    };

    /**
     * Gets the list of extra join buttons.
     *
     * @returns {Object} - The list of extra buttons.
     */
    const getExtraJoinButtons = () => {
        const noAudio = {
            key: 'no-audio',
            testId: 'prejoin.joinWithoutAudio',
            icon: IconVolumeOff,
            label: t('prejoin.joinWithoutAudio'),
            onClick: joinConferenceWithoutAudio,
            onKeyPress: onJoinConferenceWithoutAudioKeyPress
        };

        const byPhone = {
            key: 'by-phone',
            testId: 'prejoin.joinByPhone',
            icon: IconPhoneRinging,
            label: t('prejoin.joinAudioByPhone'),
            onClick: doShowDialog,
            onKeyPress: showDialogKeyPress
        };

        return {
            noAudio,
            byPhone
        };
    };

    /**
     * Handle keypress on input.
     *
     * @param {KeyboardEvent} e - Keyboard event.
     * @returns {void}
     */
    const onInputKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            joinConference();
        }
    };

    const extraJoinButtons = getExtraJoinButtons();
    let extraButtonsToRender = Object.values(extraJoinButtons).filter((val: any) =>
        !(prejoinConfig?.hideExtraJoinButtons || []).includes(val.key)
    );

    if (!hasJoinByPhoneButton) {
        extraButtonsToRender = extraButtonsToRender.filter((btn: any) => btn.key !== 'by-phone');
    }
    const hasExtraJoinButtons = Boolean(extraButtonsToRender.length);

    return (
        <PreMeetingScreen
            showDeviceStatus = { deviceStatusVisible }
            showRecordingWarning = { showRecordingWarning }
            showUnsafeRoomWarning = { showUnsafeRoomWarning }
            title = { t('prejoin.joinMeeting') }
            videoMuted = { !showCameraPreview }
            videoTrack = { videoTrack }>
            <div
                className = { classes.inputContainer }
                data-testid = 'prejoin.screen'>
                {showDisplayNameField ? (
                    <>
                        <Input
                            accessibilityLabel = { t('dialog.enterDisplayName') }
                            autoComplete = { 'name' }
                            autoFocus = { true }
                            className = { classes.input }
                            error = { showErrorOnField }
                            id = 'premeeting-name-input'
                            onChange = { setName }
                            onKeyPress = { showUnsafeRoomWarning && !unsafeRoomConsent ? undefined : onInputKeyPress }
                            placeholder = { t('dialog.enterDisplayName') }
                            readOnly = { readOnlyName }
                            value = { name } />
                    </>
                ) : (
                    <div className = { classes.avatarContainer }>
                        <Avatar
                            className = { classes.avatar }
                            displayName = { name }
                            participantId = { participantId }
                            size = { 72 } />
                        {isDisplayNameVisible && <div className = { classes.avatarName }>{name}</div>}
                    </div>
                )}

                {showErrorOnField && <div
                    className = { classes.error }
                    data-testid = 'prejoin.errorMessage'>{t('prejoin.errorMissingName')}</div>}

                <div className = { classes.dropdownContainer }>
                    <Popover
                        content = { hasExtraJoinButtons && <div className = { classes.dropdownButtons }>
                            {extraButtonsToRender.map(({ key, ...rest }) => (
                                <Button
                                    disabled = { joiningInProgress || showErrorOnField }
                                    fullWidth = { true }
                                    key = { key }
                                    type = { BUTTON_TYPES.SECONDARY }
                                    { ...rest } />
                            ))}
                        </div> }
                        onPopoverClose = { onDropdownClose }
                        position = 'bottom'
                        trigger = 'click'
                        visible = { showJoinByPhoneButtons }>
                        <ActionButton
                            OptionsIcon = { showJoinByPhoneButtons ? IconArrowUp : IconArrowDown }
                            ariaDropDownLabel = { t('prejoin.joinWithoutAudio') }
                            ariaLabel = { t('prejoin.joinMeeting') }
                            ariaPressed = { showJoinByPhoneButtons }
                            disabled = { joiningInProgress
                                || (showUnsafeRoomWarning && !unsafeRoomConsent)
                                || showErrorOnField }
                            hasOptions = { hasExtraJoinButtons }
                            onClick = { onJoinButtonClick }
                            onOptionsClick = { onOptionsClick }
                            role = 'button'
                            tabIndex = { 0 }
                            testId = 'prejoin.joinMeeting'
                            type = 'primary'>
                            {t('prejoin.joinMeeting')}
                        </ActionButton>
                    </Popover>
                </div>

                {/* VRS Features - Additional to Original Jitsi Prejoin */}
                {isClient() && (
                    <div style={{ marginTop: '16px' }}>
                        <Button 
                            fullWidth = { true } 
                            label = { requestStatus === 'idle' ? "🌐 Request Interpreter" :
                                     requestStatus === 'requesting' ? "❌ Cancel Request" :
                                     requestStatus === 'queued' ? "❌ Cancel Request" :
                                     joinCountdown > 0 ? `🎉 Joining in ${joinCountdown}s` : "🚀 Joining Now..." } 
                            onClick = { handleRequestInterpreter } 
                            type = { requestStatus === 'idle' ? BUTTON_TYPES.SECONDARY : BUTTON_TYPES.DESTRUCTIVE }
                            disabled = { requestStatus === 'matched' }
                        />
                    </div>
                )}
                {isClient() && currentRoomName && (
                    <div
                        aria-label = 'Invite friends'
                        className = { classes.contactsPanel }>
                        <div className = { classes.contactsPanelHeader }>
                            <div>
                                <div className = { classes.contactsPanelTitle }>Invite friends</div>
                                <div className = { classes.contactsPanelHint }>
                                    Secure room links now require a Malka login before joining.
                                </div>
                            </div>
                            <Button
                                label = { contactsOpen ? 'Hide' : 'Show' }
                                onClick = { () => setContactsOpen(open => !open) }
                                type = { BUTTON_TYPES.SECONDARY } />
                        </div>
                        {contactsOpen && (
                            <div className = { classes.contactsPanelBody }>
                                <div className = { classes.inviteButtonRow }>
                                    <Button
                                        fullWidth = { true }
                                        label = { copiedInviteLabel === 'general' ? 'Copied invite link' : 'Copy secure invite link' }
                                        onClick = { () => copyInviteLink('general') }
                                        type = { BUTTON_TYPES.SECONDARY } />
                                </div>
                                {contactsLoading && (
                                    <div className = { classes.contactsPanelHint }>Loading favorite contacts...</div>
                                )}
                                {!contactsLoading && contactsError && (
                                    <div className = { classes.contactsPanelHint }>{contactsError}</div>
                                )}
                                {!contactsLoading && !contactsError && speedDialEntries.length > 0 && (
                                    <div className = { classes.contactsList }>
                                        {speedDialEntries.map(entry => (
                                            <div
                                                className = { classes.contactRow }
                                                key = { String(entry.id) }>
                                                <div className = { classes.contactMeta }>
                                                    <span className = { classes.contactName }>{entry.name}</span>
                                                    <span className = { classes.contactPhone }>{entry.phone_number}</span>
                                                </div>
                                                <div className = { classes.contactAction }>
                                                    <Button
                                                        label = { copiedInviteLabel === String(entry.id) ? 'Copied' : 'Copy invite' }
                                                        onClick = { () => copyInviteLink(String(entry.id)) }
                                                        type = { BUTTON_TYPES.SECONDARY } />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!contactsLoading && !contactsError && !speedDialEntries.length && (
                                    <div className = { classes.contactsPanelHint }>
                                        Add speed-dial contacts in your profile and they’ll appear here as quick invite suggestions.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {isInterpreter() && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            padding: '12px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255,255,255,0.05)'
                        }}>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                Queue Status
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Switch
                                    checked = { isInterpreterActive }
                                    onChange = { handleInterpreterToggle }
                                />
                                <span style={{ 
                                    fontSize: '14px',
                                    color: isInterpreterActive ? '#00b25d' : '#f44336'
                                }}>
                                    {isInterpreterActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {showDialog && (
                <JoinByPhoneDialog
                    joinConferenceWithoutAudio = { joinConferenceWithoutAudio }
                    onClose = { closeDialog } />
            )}
            
            {/* Interpreter Request Popup - only for interpreters */}
            {isInterpreter() && currentRequest && (
                <InterpreterRequestPopup
                    request={currentRequest}
                    onAccept={handleAcceptRequest}
                    onDecline={handleDeclineRequest}
                    onDismiss={handleDismissRequest}
                />
            )}
            
            {/* Minimized Request List - only for interpreters */}
            {isInterpreter() && minimizedRequests.length > 0 && (
                <MinimizedRequestList
                    requests={minimizedRequests}
                    onAccept={handleAcceptRequest}
                    onDecline={handleDeclineRequest}
                    onRemove={handleRemoveMinimizedRequest}
                />
            )}
        </PreMeetingScreen>
    );
};


/**
 * Maps (parts of) the redux state to the React {@code Component} props.
 *
 * @param {Object} state - The redux state.
 * @returns {Object}
 */
function mapStateToProps(state: IReduxState) {
    const name = getDisplayName(state);
    const showErrorOnJoin = isDisplayNameRequired(state) && !name;
    const { id: participantId } = getLocalParticipant(state) ?? {};
    const { joiningInProgress } = state['features/prejoin'];
    const { room } = state['features/base/conference'];
    const { unsafeRoomConsent } = state['features/base/premeeting'];
    const { showPrejoinWarning: showRecordingWarning } = state['features/base/config'].recordings ?? {};

    return {
        deviceStatusVisible: isDeviceStatusVisible(state),
        hasJoinByPhoneButton: isJoinByPhoneButtonVisible(state),
        isDisplayNameVisible: isPrejoinDisplayNameVisible(state),
        joiningInProgress,
        name,
        participantId,
        prejoinConfig: state['features/base/config'].prejoinConfig,
        readOnlyName: isNameReadOnly(state),
        showCameraPreview: !isVideoMutedByUser(state),
        showDialog: isJoinByPhoneDialogVisible(state),
        showErrorOnJoin,
        showRecordingWarning: Boolean(showRecordingWarning),
        showUnsafeRoomWarning: isInsecureRoomName(room) && isUnsafeRoomWarningEnabled(state),
        unsafeRoomConsent,
        videoTrack: getLocalJitsiVideoTrack(state)
    };
}

const mapDispatchToProps = {
    joinConferenceWithoutAudio: joinConferenceWithoutAudioAction,
    joinConference: joinConferenceAction,
    setJoinByPhoneDialogVisiblity: setJoinByPhoneDialogVisiblityAction,
    updateSettings
};

export default connect(mapStateToProps, mapDispatchToProps)(Prejoin);
