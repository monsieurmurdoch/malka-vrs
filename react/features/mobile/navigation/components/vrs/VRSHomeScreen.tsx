/**
 * VRS Client Home Screen.
 *
 * Main landing screen for Deaf/HoH users on the mobile VRS client.
 * Provides dial pad, recent calls, contacts, and request interpreter.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MediaStream, RTCView } from 'react-native-webrtc';
import { useDispatch, useSelector } from 'react-redux';

import { FEATURES } from '../../../../base/whitelabel/constants';
import { isFeatureEnabled } from '../../../../base/whitelabel/functions';
import { cancelInterpreterRequest, requestInterpreter } from '../../../../interpreter-queue/actions';
import { queueService } from '../../../../interpreter-queue/InterpreterQueueService';
import { QueueState } from '../../../../interpreter-queue/reducer';
import { apiClient } from '../../../../shared/api-client';
import { removeSecureItem } from '../../../../vrs-auth/secureStorage';
import { clearPersistentItems, getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { shouldAutoStartMobileCameraPreview, startMobileCameraPreview } from '../../mediaPreview';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import NetworkStatusBar from '../NetworkStatusBar';
import { useTenantTheme } from '../../hooks/useTenantTheme';
import { UserInfo } from '../../../types';

const REQUEST_LANGUAGE = 'ASL';

const DIGITS = [
    [ '1', '' ], [ '2', 'ABC' ], [ '3', 'DEF' ],
    [ '4', 'GHI' ], [ '5', 'JKL' ], [ '6', 'MNO' ],
    [ '7', 'PQRS' ], [ '8', 'TUV' ], [ '9', 'WXYZ' ],
    [ '*', '' ], [ '0', '+' ], [ '#', '' ]
];

function formatPhone(digits: string) {
    const clean = digits.replace(/[^0-9*#]/g, '');

    if (clean.length <= 3) {
        return clean;
    }

    if (clean.length <= 6) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3)}`;
    }

    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6, 10)}`;
}

type QueueRootState = {
    'features/interpreter-queue'?: QueueState;
};

const VRSHomeScreen = () => {
    const dispatch = useDispatch();
    const theme = useTenantTheme();
    const canDialOut = isFeatureEnabled(FEATURES.PHONE_DIAL_OUT);
    const queueState = useSelector((state: QueueRootState) => state['features/interpreter-queue']);
    const isConnected = Boolean(queueState?.isConnected);
    const isRequestPending = Boolean(queueState?.isRequestPending);
    const queuePosition = queueState?.queuePosition;
    const canStartCameraPreview = shouldAutoStartMobileCameraPreview();

    const [ userInfo, setUserInfo ] = useState<UserInfo | null>(() => getPersistentJson<UserInfo>('vrs_user_info'));
    const savedCaptions = getPersistentJson<boolean>('vrs_captions_enabled');
    const [ captionsOn, setCaptionsOn ] = useState(savedCaptions ?? true);
    const [ previewStream, setPreviewStream ] = useState<MediaStream | null>(null);
    const [ previewError, setPreviewError ] = useState('');
    const previewStreamRef = useRef<MediaStream | null>(null);
    const [ showDialer, setShowDialer ] = useState(false);
    const [ digits, setDigits ] = useState('');
    const [ callStatus, setCallStatus ] = useState<string | null>(null);
    const [ voicemailUnreadCount, setVoicemailUnreadCount ] = useState(() => {
        const vms = getPersistentJson<{ isRead: boolean }[]>('vrs_voicemails');

        return vms ? vms.filter(v => !v.isRead).length : 0;
    });

    useEffect(() => {
        let mounted = true;

        apiClient.get<UserInfo>('/api/client/profile').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'client_profile_load_failed', { error: response.error });

                return;
            }

            if (response.data) {
                const nextUser = {
                    ...userInfo,
                    ...response.data,
                    phoneNumber: response.data.phoneNumber || response.data.primaryPhone || userInfo?.phoneNumber
                };

                setUserInfo(nextUser);
                setPersistentItem('vrs_user_info', JSON.stringify(nextUser));
            }
        });

        apiClient.get<{ count?: number }>('/api/voicemail/unread-count').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'voicemail_unread_count_failed', { error: response.error });

                return;
            }

            setVoicemailUnreadCount(response.data?.count || 0);
        });

        return () => {
            mounted = false;
        };
    }, []);

    const startPreview = useCallback(async () => {
        setPreviewError('');
        previewStreamRef.current?.getTracks().forEach(track => track.stop());
        previewStreamRef.current = null;
        setPreviewStream(null);

        try {
            const { stream } = await startMobileCameraPreview('vrs-home');

            previewStreamRef.current = stream;
            setPreviewStream(stream);
        } catch (err: unknown) {
            setPreviewError(err instanceof Error ? err.message : 'Camera preview unavailable');
        }
    }, []);

    useEffect(() => {
        setPersistentItem('vrs_request_language', REQUEST_LANGUAGE);

        if (canStartCameraPreview) {
            void startPreview();
        } else {
            setPreviewError('Camera preview is paused in the Android emulator. Use a physical device for live self-view.');
        }

        return () => {
            previewStreamRef.current?.getTracks().forEach(track => track.stop());
            previewStreamRef.current = null;
        };
    }, [ canStartCameraPreview, startPreview ]);

    useEffect(() => {
        const onRinging = () => setCallStatus('Ringing...');
        const onFailed = (data: { message?: string }) => {
            setCallStatus(data.message || 'Call failed');
            setTimeout(() => setCallStatus(null), 3000);
        };
        const onOffline = (data: { calleeName?: string }) => {
            setCallStatus(`${data.calleeName || 'Contact'} is offline`);
            setTimeout(() => setCallStatus(null), 3000);
        };
        const onDnd = (data: { calleeName?: string }) => {
            setCallStatus(`${data.calleeName || 'Contact'} has DND on`);
            setTimeout(() => setCallStatus(null), 3000);
        };

        queueService.on('p2pRinging', onRinging);
        queueService.on('p2pCallFailed', onFailed);
        queueService.on('p2pTargetOffline', onOffline);
        queueService.on('p2pTargetDnd', onDnd);

        return () => {
            queueService.off('p2pRinging', onRinging);
            queueService.off('p2pCallFailed', onFailed);
            queueService.off('p2pTargetOffline', onOffline);
            queueService.off('p2pTargetDnd', onDnd);
        };
    }, []);

    const handleRequestInterpreter = useCallback(() => {
        if (isRequestPending) {
            dispatch(cancelInterpreterRequest());

            return;
        }
        dispatch(requestInterpreter(REQUEST_LANGUAGE));
    }, [ dispatch, isRequestPending ]);

    const handleDialerToggle = useCallback(() => {
        setShowDialer(value => !value);
    }, []);

    const handleContacts = useCallback(() => {
        navigateRoot(screen.vrs.contacts);
    }, []);

    const handleCallHistory = useCallback(() => {
        navigateRoot(screen.vrs.callHistory);
    }, []);

    const handleDigit = useCallback((digit: string) => {
        setDigits(previous => previous + digit);
    }, []);

    const handleDeleteDigit = useCallback(() => {
        setDigits(previous => previous.slice(0, -1));
    }, []);

    const handleDialCall = useCallback(() => {
        const clean = digits.replace(/[^0-9+]/g, '');

        if (!clean || !canDialOut) {
            return;
        }

        setCallStatus('Calling...');
        queueService.sendP2PCall(clean);
        mobileLog('info', 'vrs_home_dial_p2p_call', { phoneNumber: clean });
    }, [ canDialOut, digits ]);

    const handleLogout = useCallback(() => {
        clearPersistentItems([
            'vrs_user_role',
            'vrs_auth_token',
            'vrs_user_info',
            'vrs_client_auth',
            'vrs_interpreter_auth',
            'vrs_active_call'
        ]);
        removeSecureItem('vrs_auth_token');
        navigateRoot(screen.auth.login);
    }, []);

    return (
        <SafeAreaView style = { styles.container }>
            <NetworkStatusBar isConnected = { isConnected } />
            <ScrollView contentContainerStyle = { styles.scrollContent }>
                {/* Header */}
                <View style = { styles.header }>
                    <View>
                        <Text style = { styles.greeting }>
                            Hello, { userInfo?.name || 'there' }
                        </Text>
                        <Text style = { styles.subtitle }>
                            { isRequestPending
                                ? `Waiting for interpreter${typeof queuePosition === 'number' ? ` (#${queuePosition} in queue)` : '...'}`
                                : 'How can we help you today?' }
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress = { handleLogout }
                        style = { styles.logoutButton }>
                        <Text style = { styles.logoutText }>Sign Out</Text>
                    </TouchableOpacity>
                </View>

                {/* Self View */}
                <View style = { styles.selfViewCard }>
                    { previewStream ? (
                        <RTCView
                            mirror
                            objectFit = 'cover'
                            streamURL = { previewStream.toURL() }
                            style = { styles.selfViewVideo } />
                    ) : (
                        <View style = { styles.selfViewFallback }>
                            <Text style = { styles.selfViewTitle }>Camera Preview</Text>
                            <Text style = { styles.selfViewHelp }>
                                { previewError || 'Allow camera access to see yourself here' }
                            </Text>
                            { canStartCameraPreview && (
                                <TouchableOpacity
                                    accessibilityLabel = 'Retry camera preview'
                                    accessibilityRole = 'button'
                                    onPress = { startPreview }
                                    style = { styles.retryCameraButton }>
                                    <Text style = { styles.retryCameraText }>Retry Camera</Text>
                                </TouchableOpacity>
                            ) }
                        </View>
                    ) }
                    { previewStream && (
                        <TouchableOpacity
                            accessibilityLabel = 'Retry camera preview'
                            accessibilityRole = 'button'
                            onPress = { startPreview }
                            style = { styles.cameraOverlayButton }>
                            <Text style = { styles.cameraOverlayText }>Retry</Text>
                        </TouchableOpacity>
                    ) }
                </View>

                {/* Primary Action */}
                <TouchableOpacity
                    accessibilityLabel = { isRequestPending ? 'Cancel interpreter request' : 'Request interpreter' }
                    accessibilityRole = 'button'
                    onPress = { handleRequestInterpreter }
                    style = { [
                        styles.primaryAction,
                        { backgroundColor: theme.accent, shadowColor: theme.accent },
                        isRequestPending && styles.primaryActionCancel
                    ] }>
                    <Text style = { styles.primaryActionText }>
                        { isRequestPending ? 'Cancel Request' : 'Request Interpreter' }
                    </Text>
                </TouchableOpacity>

                {/* Captions */}
                <View style = { styles.controlsRow }>
                    <TouchableOpacity
                        accessibilityLabel = { captionsOn ? 'Disable captions' : 'Enable captions' }
                        accessibilityRole = 'switch'
                        onPress = { () => {
                            setCaptionsOn(!captionsOn);
                            setPersistentItem('vrs_captions_enabled', JSON.stringify(!captionsOn));
                        } }
                        style = { [
                            styles.captionToggle,
                            captionsOn && styles.captionToggleActive
                        ] }>
                        <Text style = { [
                            styles.captionText,
                            captionsOn && styles.captionTextActive
                        ] }>
                            CC
                        </Text>
                    </TouchableOpacity>
                </View>

                { showDialer && (
                    <View style = { styles.dialerPanel }>
                        <Text style = { styles.phoneNumber }>
                            { digits ? formatPhone(digits) : 'Enter number' }
                        </Text>
                        { !canDialOut && (
                            <Text style = { styles.callStatus }>
                                Phone dial-out is not available for this account.
                            </Text>
                        ) }
                        { callStatus ? (
                            <Text style = { styles.callStatus }>{ callStatus }</Text>
                        ) : null }
                        <View style = { styles.keypad }>
                            { DIGITS.map(([ digit, letters ]) => (
                                <TouchableOpacity
                                    accessibilityLabel = { `Dial ${digit}` }
                                    accessibilityRole = 'button'
                                    key = { digit }
                                    onPress = { () => handleDigit(digit) }
                                    style = { styles.key }>
                                    <Text style = { styles.keyDigit }>{ digit }</Text>
                                    <Text style = { styles.keyLetters }>{ letters }</Text>
                                </TouchableOpacity>
                            )) }
                        </View>
                        <View style = { styles.dialerActions }>
                            <TouchableOpacity
                                accessibilityLabel = 'Place call'
                                disabled = { !digits || !canDialOut }
                                onPress = { handleDialCall }
                                style = { [
                                    styles.dialerCallButton,
                                    (!digits || !canDialOut) && styles.dialerCallButtonDisabled
                                ] }>
                                <Text style = { styles.dialerCallText }>Call</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                accessibilityLabel = 'Delete digit'
                                disabled = { !digits }
                                onPress = { handleDeleteDigit }
                                style = { styles.dialerDeleteButton }>
                                <Text style = { styles.dialerDeleteText }>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) }

                {/* Connection Status */}
                <View style = { styles.statusBar }>
                    <View style = { [
                        styles.statusDot,
                        isConnected ? styles.statusConnected : styles.statusDisconnected
                    ] } />
                    <Text style = { styles.statusText }>
                        { isConnected ? 'Connected' : 'Connecting to service...' }
                    </Text>
                </View>
            </ScrollView>
            <View style = { styles.bottomTabs }>
                <TouchableOpacity
                    accessibilityLabel = { showDialer ? 'Hide dial pad' : 'Show dial pad' }
                    accessibilityRole = 'tab'
                    onPress = { handleDialerToggle }
                    style = { [
                        styles.bottomTab,
                        showDialer && styles.bottomTabActive
                    ] }>
                    <Text style = { [
                        styles.bottomTabIcon,
                        showDialer && { color: theme.accent }
                    ] }>
                        { showDialer ? '×' : '☎' }
                    </Text>
                    <Text style = { [
                        styles.bottomTabLabel,
                        showDialer && { color: theme.accent }
                    ] }>
                        Dial
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    accessibilityLabel = 'Open contacts'
                    accessibilityRole = 'tab'
                    onPress = { handleContacts }
                    style = { styles.bottomTab }>
                    <Text style = { styles.bottomTabIcon }>☰</Text>
                    <Text style = { styles.bottomTabLabel }>Contacts</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    accessibilityLabel = 'View call history'
                    accessibilityRole = 'tab'
                    onPress = { handleCallHistory }
                    style = { styles.bottomTab }>
                    <Text style = { styles.bottomTabIcon }>◷</Text>
                    <Text style = { styles.bottomTabLabel }>History</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    accessibilityLabel = 'Open voicemail inbox'
                    accessibilityRole = 'tab'
                    onPress = { () => navigateRoot(screen.vrs.voicemail) }
                    style = { styles.bottomTab }>
                    <View>
                        <Text style = { styles.bottomTabIcon }>▣</Text>
                        { voicemailUnreadCount > 0 && (
                            <View style = { styles.bottomTabBadge }>
                                <Text style = { styles.bottomTabBadgeText }>
                                    { voicemailUnreadCount > 9 ? '9+' : voicemailUnreadCount }
                                </Text>
                            </View>
                        ) }
                    </View>
                    <Text style = { styles.bottomTabLabel }>VM</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    actionBadge: {
        alignItems: 'center',
        backgroundColor: '#d32f2f',
        borderRadius: 9,
        minWidth: 18,
        paddingHorizontal: 5,
        paddingVertical: 1,
        position: 'absolute',
        right: -2,
        top: -2
    },
    actionBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        textAlign: 'center'
    },
    bottomTab: {
        alignItems: 'center',
        borderRadius: 14,
        flex: 1,
        justifyContent: 'center',
        minHeight: 58,
        paddingVertical: 8,
        position: 'relative'
    },
    bottomTabActive: {
        backgroundColor: '#1a1a2e'
    },
    bottomTabBadge: {
        alignItems: 'center',
        backgroundColor: '#d32f2f',
        borderRadius: 9,
        minWidth: 18,
        paddingHorizontal: 5,
        paddingVertical: 1,
        position: 'absolute',
        right: -14,
        top: -4
    },
    bottomTabBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        textAlign: 'center'
    },
    bottomTabIcon: {
        color: '#d8d8e2',
        fontSize: 22,
        fontWeight: '800',
        lineHeight: 24
    },
    bottomTabLabel: {
        color: '#aaaab8',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 3
    },
    bottomTabs: {
        backgroundColor: '#111126',
        borderColor: '#252540',
        borderTopWidth: 1,
        flexDirection: 'row',
        gap: 6,
        paddingBottom: 8,
        paddingHorizontal: 10,
        paddingTop: 8
    },
    captionText: {
        color: '#888',
        fontSize: 13,
        fontWeight: '700'
    },
    captionTextActive: {
        color: '#fff'
    },
    captionToggle: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8
    },
    captionToggleActive: {
        backgroundColor: '#2979ff'
    },
    controlsRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginHorizontal: 16,
        marginBottom: 16
    },
    callStatus: {
        color: '#ffb74d',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center'
    },
    cameraOverlayButton: {
        backgroundColor: 'rgba(10, 10, 26, 0.72)',
        borderColor: 'rgba(255, 255, 255, 0.28)',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 7,
        position: 'absolute',
        right: 10,
        top: 10
    },
    cameraOverlayText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800'
    },
    dialerActions: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'center',
        marginTop: 12
    },
    dialerCallButton: {
        alignItems: 'center',
        backgroundColor: '#4caf50',
        borderRadius: 14,
        minWidth: 132,
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    dialerCallButtonDisabled: {
        backgroundColor: '#26422d'
    },
    dialerCallText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800'
    },
    dialerDeleteButton: {
        alignItems: 'center',
        borderColor: '#3a3a54',
        borderRadius: 14,
        borderWidth: 1,
        minWidth: 96,
        paddingHorizontal: 16,
        paddingVertical: 14
    },
    dialerDeleteText: {
        color: '#ddd',
        fontSize: 14,
        fontWeight: '700'
    },
    dialerPanel: {
        backgroundColor: '#14142a',
        borderColor: '#2c2c48',
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
        marginHorizontal: 16,
        padding: 16
    },
    key: {
        alignItems: 'center',
        backgroundColor: '#22223b',
        borderRadius: 24,
        height: 58,
        justifyContent: 'center',
        margin: 6,
        width: 58
    },
    keypad: {
        alignSelf: 'center',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 228,
        paddingTop: 10
    },
    keyDigit: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700'
    },
    keyLetters: {
        color: '#85859a',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1
    },
    voicemailBadge: {
        backgroundColor: '#d32f2f',
        borderRadius: 10,
        marginLeft: 'auto',
        minWidth: 20,
        paddingHorizontal: 6,
        paddingVertical: 2
    },
    voicemailBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center'
    },
    voicemailIcon: {
        fontSize: 20,
        marginRight: 10
    },
    voicemailLabel: {
        color: '#ddd',
        fontSize: 15,
        fontWeight: '500'
    },
    voicemailRow: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 14
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    greeting: {
        color: '#ffffff',
        fontSize: 26,
        fontWeight: '700'
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingHorizontal: 20,
        paddingTop: 16
    },
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 6
    },
    logoutText: {
        color: '#888',
        fontSize: 13
    },
    primaryAction: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 14,
        elevation: 4,
        marginBottom: 14,
        marginHorizontal: 16,
        paddingVertical: 14,
        shadowColor: '#2979ff',
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.24,
        shadowRadius: 5
    },
    primaryActionCancel: {
        backgroundColor: '#d32f2f',
        shadowColor: '#d32f2f'
    },
    primaryActionText: {
        color: '#ffffff',
        fontSize: 17,
        fontWeight: '700'
    },
    phoneNumber: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '400',
        letterSpacing: 0,
        textAlign: 'center'
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 96
    },
    retryCameraButton: {
        borderColor: '#3a3a54',
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 10
    },
    retryCameraText: {
        color: '#ddd',
        fontSize: 13,
        fontWeight: '700'
    },
    selfViewCard: {
        alignItems: 'center',
        aspectRatio: 4 / 3,
        backgroundColor: '#1a1a2e',
        borderColor: '#2c2c48',
        borderRadius: 16,
        borderWidth: 1,
        justifyContent: 'center',
        marginBottom: 16,
        marginHorizontal: 16,
        overflow: 'hidden'
    },
    selfViewFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
    },
    selfViewHelp: {
        color: '#85859a',
        fontSize: 13,
        marginTop: 6,
        textAlign: 'center'
    },
    selfViewTitle: {
        color: '#ddd',
        fontSize: 16,
        fontWeight: '700'
    },
    selfViewVideo: {
        height: '100%',
        width: '100%'
    },
    statusBar: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 12
    },
    statusConnected: {
        backgroundColor: '#4caf50'
    },
    statusDisconnected: {
        backgroundColor: '#ff9800'
    },
    statusDot: {
        borderRadius: 4,
        height: 8,
        marginRight: 8,
        width: 8
    },
    statusText: {
        color: '#999',
        fontSize: 12
    },
    subtitle: {
        color: '#aaaaaa',
        fontSize: 15,
        marginTop: 4
    }
});

export default VRSHomeScreen;
