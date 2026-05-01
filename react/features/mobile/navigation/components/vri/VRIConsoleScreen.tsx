/**
 * VRI Client Console Screen.
 *
 * Focused corporate VRI session console for Maple/Malka VRI clients.
 * Large self-view, Request Interpreter action, session controls.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MediaStream, mediaDevices, RTCView } from 'react-native-webrtc';
import { useDispatch, useSelector } from 'react-redux';

import { cancelInterpreterRequest, requestInterpreter } from '../../../../interpreter-queue/actions';
import { QueueState } from '../../../../interpreter-queue/reducer';
import { queueService } from '../../../../interpreter-queue/InterpreterQueueService';
import { apiClient } from '../../../../shared/api-client';
import { removeSecureItem } from '../../../../vrs-auth/secureStorage';
import { clearPersistentItems, getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import NetworkStatusBar from '../NetworkStatusBar';
import { useTenantTheme } from '../../hooks/useTenantTheme';
import { UserInfo } from '../../../types';

const VRI_LANGUAGES = [
    { code: 'ASL', label: 'ASL' },
    { code: 'LSQ', label: 'LSQ' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'es', label: 'Spanish' }
];

const VRIConsoleScreen = () => {
    const dispatch = useDispatch();
    const theme = useTenantTheme();
    const queueState = useSelector((state: any) => state['features/interpreter-queue'] as QueueState | undefined);
    const isConnected = Boolean(queueState?.isConnected);
    const isRequestPending = Boolean(queueState?.isRequestPending);
    const queuePosition = queueState?.queuePosition;
    const matchData = queueState?.matchData;

    const [ userInfo, setUserInfo ] = useState<UserInfo | null>(() => getPersistentJson<UserInfo>('vrs_user_info'));
    const savedLang = getPersistentJson<string>('vrs_request_language');
    const [ language, setLanguage ] = useState(savedLang || 'ASL');
    const [ elapsedTime, setElapsedTime ] = useState(0);
    const [ previewStream, setPreviewStream ] = useState<MediaStream | null>(null);
    const [ previewError, setPreviewError ] = useState('');
    const [ inviteUrl, setInviteUrl ] = useState<string | null>(null);

    // Listen for VRI invite preparation responses
    useEffect(() => {
        const onInvitePrepared = (data: { inviteUrl?: string; token?: string }) => {
            if (data.inviteUrl) {
                setInviteUrl(data.inviteUrl);
                mobileLog('info', 'vri_invite_prepared', { token: data.token });
            }
        };

        queueService.on('vriInvitePrepared', onInvitePrepared);

        return () => {
            queueService.off('vriInvitePrepared', onInvitePrepared);
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        apiClient.get<UserInfo>('/api/client/profile').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'vri_client_profile_load_failed', { error: response.error });

                return;
            }

            if (response.data) {
                const nextUser = { ...userInfo, ...response.data };

                setUserInfo(nextUser);
                setPersistentItem('vrs_user_info', JSON.stringify(nextUser));
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        let activeStream: MediaStream | null = null;

        async function startPreview() {
            try {
                const stream = await mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: 'user'
                    }
                }) as MediaStream;

                activeStream = stream;

                if (!mounted) {
                    stream.getTracks().forEach(track => track.stop());

                    return;
                }

                setPreviewError('');
                setPreviewStream(stream);
                setPersistentItem('vri_media_defaults', JSON.stringify({
                    cameraPermissionGranted: true,
                    cameraPreviewEnabled: true,
                    cameraDefaultOn: true,
                    microphoneDefaultMuted: true,
                    updatedAt: new Date().toISOString()
                }));
            } catch (err: any) {
                if (mounted) {
                    setPreviewError(err?.message || 'Camera preview unavailable');
                    setPersistentItem('vri_media_defaults', JSON.stringify({
                        cameraPermissionGranted: false,
                        cameraPreviewEnabled: false,
                        cameraDefaultOn: false,
                        microphoneDefaultMuted: true,
                        updatedAt: new Date().toISOString()
                    }));
                }
            }
        }

        void startPreview();

        return () => {
            mounted = false;
            activeStream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    // Track time since match was found
    useEffect(() => {
        if (!matchData) {
            setElapsedTime(0);

            return;
        }

        const interval = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [ matchData ]);

    const handleRequestInterpreter = useCallback(() => {
        if (isRequestPending) {
            dispatch(cancelInterpreterRequest());

            return;
        }
        dispatch(requestInterpreter(language));
    }, [ dispatch, isRequestPending, language ]);

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

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;

        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handlePrepareInvite = useCallback(() => {
        setInviteUrl(null);
        queueService.prepareVriInvite({
            roomName: matchData?.roomName || undefined
        });
    }, [ matchData ]);

    const isInSession = Boolean(matchData?.roomName);

    return (
        <SafeAreaView style = { styles.container }>
            <NetworkStatusBar isConnected = { isConnected } />
            {/* Header with Logout */}
            <View style = { styles.header }>
                <Text style = { styles.headerTitle }>
                    { userInfo?.organization || 'VRI Console' }
                </Text>
                <TouchableOpacity
                    accessibilityLabel = 'Sign out'
                    onPress = { handleLogout }
                    style = { styles.logoutButton }>
                    <Text style = { styles.logoutText }>Sign Out</Text>
                </TouchableOpacity>
            </View>

            {/* Self-View Area */}
            <View style = { styles.selfViewArea }>
                <View style = { styles.selfViewPlaceholder }>
                    { previewStream ? (
                        <RTCView
                            mirror
                            objectFit = 'cover'
                            streamURL = { previewStream.toURL() }
                            style = { styles.selfViewVideo } />
                    ) : (
                        <>
                            <Text style = { styles.selfViewText }>
                                { isInSession ? 'In Session' : 'Camera Preview' }
                            </Text>
                            <Text style = { styles.selfViewSubtext }>
                                { previewError || (isInSession
                                    ? `With ${matchData?.interpreterName || 'interpreter'}`
                                    : 'Allow camera access to see yourself here') }
                            </Text>
                        </>
                    ) }
                </View>
            </View>

            {/* Session Info */}
            <View style = { styles.sessionInfo }>
                { isInSession ? (
                    <>
                        <Text style = { styles.sessionLabel }>Active VRI Session</Text>
                        <Text style = { styles.sessionTimer }>{ formatTime(elapsedTime) }</Text>
                        <Text style = { styles.sessionDetail }>
                            Interpreter: { matchData?.interpreterName || 'Assigned' }
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style = { styles.sessionLabel }>
                            { isRequestPending
                                ? `Queue Position: ${queuePosition ?? '—'}`
                                : 'No Active Session' }
                        </Text>
                        { isRequestPending && (
                            <Text style = { styles.sessionDetail }>
                                Waiting for an available interpreter...
                            </Text>
                        ) }
                    </>
                ) }
            </View>

            {/* Invite Panel — available when in session or waiting */}
            { isInSession && (
                <View style = { styles.invitePanel }>
                    { inviteUrl ? (
                        <>
                            <Text style = { styles.inviteLabel }>Session Invite Link</Text>
                            <Text
                                numberOfLines = { 2 }
                                style = { styles.inviteUrl }>
                                { inviteUrl }
                            </Text>
                            <TouchableOpacity
                                accessibilityLabel = 'Copy invite link'
                                onPress = { () => {
                                    mobileLog('info', 'vri_invite_copied');
                                } }
                                style = { styles.inviteButton }>
                                <Text style = { styles.inviteButtonText }>Copy Link</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity
                            accessibilityLabel = 'Prepare session invite'
                            onPress = { handlePrepareInvite }
                            style = { styles.inviteButton }>
                            <Text style = { styles.inviteButtonText }>Prepare Invite</Text>
                        </TouchableOpacity>
                    ) }
                </View>
            )}

            {/* Language Selector */}
            { !isInSession && (
                <View style = { styles.languageRow }>
                    { VRI_LANGUAGES.map(lang => (
                        <TouchableOpacity
                            accessibilityLabel = { `Select ${lang.label}` }
                            key = { lang.code }
                            onPress = { () => {
                                setLanguage(lang.code);
                                setPersistentItem('vrs_request_language', lang.code);
                            } }
                            style = { [
                                styles.langButton,
                                language === lang.code && styles.langButtonActive
                            ] }>
                            <Text style = { [
                                styles.langText,
                                language === lang.code && styles.langTextActive
                            ] }>
                                { lang.label }
                            </Text>
                        </TouchableOpacity>
                    )) }
                </View>
            )}

            {/* Primary Action — only request/cancel, never manual room entry */}
            <View style = { styles.actions }>
                <TouchableOpacity
                    accessibilityLabel = { isRequestPending ? 'Cancel request' : isInSession ? 'Session active' : 'Request interpreter' }
                    onPress = { handleRequestInterpreter }
                    style = { [
                        styles.requestButton,
                        { backgroundColor: theme.accent, shadowColor: theme.accent },
                        isRequestPending && styles.cancelButton,
                        isInSession && styles.requestButtonDisabled
                    ] }
                    disabled = { isInSession }>
                    <Text style = { styles.requestButtonText }>
                        { isInSession
                            ? 'Session Active'
                            : isRequestPending
                                ? 'Cancel Request'
                                : 'Request Interpreter' }
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Connection Status */}
            <View style = { styles.footer }>
                <View style = { styles.quickLinks }>
                    <TouchableOpacity
                        accessibilityLabel = 'Open VRI settings'
                        onPress = { () => navigateRoot(screen.vri.settings) }
                        style = { styles.quickLink }>
                        <Text style = { styles.quickLinkText }>Settings</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        accessibilityLabel = 'View usage summary'
                        onPress = { () => navigateRoot(screen.vri.usage) }
                        style = { styles.quickLink }>
                        <Text style = { styles.quickLinkText }>Usage</Text>
                    </TouchableOpacity>
                </View>
                <View style = { styles.connectionRow }>
                    <View style = { [
                        styles.dot,
                        isConnected ? styles.dotGreen : styles.dotOrange
                    ] } />
                    <Text style = { styles.connectionText }>
                        { isConnected ? 'Connected' : 'Reconnecting...' }
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    actions: {
        paddingHorizontal: 24,
        paddingVertical: 16
    },
    cancelButton: {
        backgroundColor: '#d32f2f'
    },
    connectionRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center'
    },
    connectionText: {
        color: '#888',
        fontSize: 12
    },
    container: {
        backgroundColor: '#0a0a1a',
        flex: 1
    },
    dot: {
        borderRadius: 4,
        height: 8,
        marginRight: 6,
        width: 8
    },
    dotGreen: {
        backgroundColor: '#4caf50'
    },
    dotOrange: {
        backgroundColor: '#ff9800'
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 24,
        paddingTop: 8
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600'
    },
    inviteButton: {
        backgroundColor: '#1a1a2e',
        borderColor: '#2979ff',
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8
    },
    inviteButtonText: {
        color: '#2979ff',
        fontSize: 13,
        fontWeight: '600'
    },
    inviteLabel: {
        color: '#888',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 4,
        textTransform: 'uppercase'
    },
    invitePanel: {
        alignItems: 'center',
        marginHorizontal: 20,
        marginBottom: 8
    },
    inviteUrl: {
        color: '#aaa',
        fontSize: 11,
        marginBottom: 8
    },
    langButton: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        marginRight: 6,
        paddingHorizontal: 10,
        paddingVertical: 6
    },
    langButtonActive: {
        backgroundColor: '#2979ff'
    },
    languageRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginBottom: 12,
        marginHorizontal: 20
    },
    langText: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600'
    },
    langTextActive: {
        color: '#fff'
    },
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 6
    },
    logoutText: {
        color: '#888',
        fontSize: 13
    },
    quickLink: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8
    },
    quickLinkText: {
        color: '#aaa',
        fontSize: 13
    },
    quickLinks: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12
    },
    requestButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 14,
        elevation: 3,
        padding: 18,
        shadowColor: '#2979ff',
        shadowOffset: { height: 3, width: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 6
    },
    requestButtonDisabled: {
        backgroundColor: '#1a1a3e',
        elevation: 0,
        shadowColor: 'transparent',
        shadowOpacity: 0
    },
    requestButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600'
    },
    selfViewArea: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16
    },
    selfViewPlaceholder: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 16,
        flex: 1,
        justifyContent: 'center',
        overflow: 'hidden'
    },
    selfViewSubtext: {
        color: '#555',
        fontSize: 13,
        marginTop: 4
    },
    selfViewText: {
        color: '#777',
        fontSize: 16,
        fontWeight: '500'
    },
    selfViewVideo: {
        height: '100%',
        width: '100%'
    },
    sessionDetail: {
        color: '#999',
        fontSize: 13,
        marginTop: 4
    },
    sessionInfo: {
        alignItems: 'center',
        paddingVertical: 16
    },
    sessionLabel: {
        color: '#ddd',
        fontSize: 16,
        fontWeight: '600'
    },
    sessionTimer: {
        color: '#2979ff',
        fontSize: 36,
        fontVariant: [ 'tabular-nums' ],
        fontWeight: '700',
        marginTop: 4
    }
});

export default VRIConsoleScreen;
