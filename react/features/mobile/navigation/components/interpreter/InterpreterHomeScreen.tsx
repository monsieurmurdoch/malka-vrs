/**
 * Interpreter Home Screen.
 *
 * Main screen for sign language interpreters on mobile.
 * Shows availability toggle, queue state, incoming requests, and active session.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import {
    acceptInterpreterRequest,
    cancelInterpreterRequest,
    declineInterpreterRequest
} from '../../../../interpreter-queue/actions';
import { QueueState } from '../../../../interpreter-queue/reducer';
import { queueService } from '../../../../interpreter-queue/InterpreterQueueService';
import { apiClient } from '../../../../shared/api-client';
import { removeSecureItem } from '../../../../vrs-auth/secureStorage';
import { clearPersistentItems, getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import NetworkStatusBar from '../NetworkStatusBar';
import { useIncomingRequestAlert } from '../../hooks/useIncomingRequestAlert';

interface InterpreterInfo {
    id?: string;
    name?: string;
    role?: string;
    languages?: string[];
    serviceModes?: string[];
}

interface IncomingRequest {
    id: string;
    clientName?: string;
    language?: string;
    timestamp?: number;
    roomName?: string;
}

const InterpreterHomeScreen = () => {
    const dispatch = useDispatch();
    const queueState = useSelector((state: any) => state['features/interpreter-queue'] as QueueState | undefined);
    const isConnected = Boolean(queueState?.isConnected);
    const matchData = queueState?.matchData;
    const pendingRequests = (queueState as any)?.pendingRequests as IncomingRequest[] | undefined;

    const userInfo = getPersistentJson<InterpreterInfo>('vrs_user_info');
    const [ profile, setProfile ] = useState<InterpreterInfo | null>(userInfo || null);
    const [ isAvailable, setIsAvailable ] = useState(false);
    const [ activeTime, setActiveTime ] = useState(0);

    // Vibrate on incoming request
    useIncomingRequestAlert();

    const isInSession = Boolean(matchData?.roomName);

    useEffect(() => {
        let mounted = true;

        apiClient.get<InterpreterInfo>('/api/interpreter/profile').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'interpreter_profile_load_failed', { error: response.error });

                return;
            }

            if (response.data) {
                setProfile(response.data);
                setPersistentItem('vrs_user_info', JSON.stringify(response.data));
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    // Track session time
    useEffect(() => {
        if (!isInSession) {
            setActiveTime(0);

            return;
        }

        const interval = setInterval(() => setActiveTime(prev => prev + 1), 1000);

        return () => clearInterval(interval);
    }, [ isInSession ]);

    const handleToggleAvailability = useCallback(() => {
        const next = !isAvailable;
        setIsAvailable(next);

        if (next) {
            queueService.updateInterpreterStatus(
                'active',
                profile?.name,
                profile?.languages || [ 'ASL', 'English' ]
            );
        } else {
            queueService.updateInterpreterStatus('inactive', profile?.name, []);
        }
    }, [ isAvailable, profile ]);

    const handleAccept = useCallback((request: IncomingRequest) => {
        dispatch(acceptInterpreterRequest(request.id));
    }, [ dispatch ]);

    const handleDecline = useCallback((request: IncomingRequest) => {
        dispatch(declineInterpreterRequest(request.id));
    }, [ dispatch ]);

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

    const handleEndCall = useCallback(() => {
        queueService.endActiveCall();
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;

        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const activeRequest = pendingRequests?.[0];

    return (
        <SafeAreaView style = { styles.container }>
            <NetworkStatusBar isConnected = { isConnected } />
            <View style = { styles.header }>
                <Text style = { styles.headerTitle }>
                    { profile?.name || 'Interpreter' }
                </Text>
                <TouchableOpacity
                    accessibilityLabel = 'Sign out'
                    onPress = { handleLogout }
                    style = { styles.logoutButton }>
                    <Text style = { styles.logoutText }>Sign Out</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                {/* Availability Toggle */}
                <TouchableOpacity
                    accessibilityLabel = { isAvailable ? 'Go offline' : 'Go available' }
                    accessibilityRole = 'switch'
                    onPress = { handleToggleAvailability }
                    style = { [
                        styles.availabilityCard,
                        isAvailable ? styles.available : styles.offline,
                        isInSession && styles.inSession
                    ] }
                    disabled = { isInSession }>
                    <View style = { [
                        styles.statusDot,
                        isAvailable ? styles.dotGreen : styles.dotGray
                    ] } />
                    <Text style = { styles.availabilityText }>
                        { isInSession
                            ? 'In Session'
                            : isAvailable
                                ? 'Available'
                                : 'Offline' }
                    </Text>
                </TouchableOpacity>

                {/* Active Session */}
                { isInSession && (
                    <View style = { styles.sessionCard }>
                        <Text style = { styles.sessionLabel }>Active Session</Text>
                        <Text style = { styles.sessionTimer }>{ formatTime(activeTime) }</Text>
                        { matchData?.interpreterName && (
                            <Text style = { styles.sessionClient }>
                                with { matchData.interpreterName }
                            </Text>
                        ) }
                        <TouchableOpacity
                            accessibilityLabel = 'End call'
                            onPress = { handleEndCall }
                            style = { styles.endCallButton }>
                            <Text style = { styles.endCallText }>End Call</Text>
                        </TouchableOpacity>
                    </View>
                ) }

                {/* Incoming Request */}
                { activeRequest && !isInSession && (
                    <View style = { styles.requestCard }>
                        <Text style = { styles.requestTitle }>Incoming Request</Text>
                        <Text style = { styles.requestClient }>
                            { activeRequest.clientName || 'Unknown client' }
                        </Text>
                        <Text style = { styles.requestLanguage }>
                            Language: { activeRequest.language || 'ASL' }
                        </Text>
                        <Text style = { styles.requestContext }>
                            Service: { activeRequest.roomName?.startsWith('vri') ? 'VRI' : 'VRS' }
                        </Text>
                        <Text style = { styles.requestContext }>
                            { activeRequest.timestamp
                                ? `Received ${new Date(activeRequest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : '' }
                        </Text>
                        <View style = { styles.requestActions }>
                            <TouchableOpacity
                                accessibilityLabel = 'Accept request'
                                onPress = { () => handleAccept(activeRequest) }
                                style = { styles.acceptButton }>
                                <Text style = { styles.acceptText }>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                accessibilityLabel = 'Decline request'
                                onPress = { () => handleDecline(activeRequest) }
                                style = { styles.declineButton }>
                                <Text style = { styles.declineText }>Decline</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) }

                {/* Queue Status */}
                { isAvailable && !isInSession && !activeRequest && (
                    <View style = { styles.waitingCard }>
                        <Text style = { styles.waitingText }>
                            Waiting for incoming requests...
                        </Text>
                    </View>
                ) }

                {/* Service Modes & Languages */}
                <View style = { styles.infoRow }>
                    { (profile?.serviceModes || []).map(mode => (
                        <View key = { mode } style = { styles.modeTag }>
                            <Text style = { styles.modeTagText }>
                                { mode.toUpperCase() }
                            </Text>
                        </View>
                    )) }
                    { (profile?.languages || []).map(lang => (
                        <View key = { lang } style = { styles.languageTag }>
                            <Text style = { styles.languageTagText }>{ lang }</Text>
                        </View>
                    )) }
                </View>
            </ScrollView>

            {/* Footer links */}
            <View style = { styles.footer }>
                <TouchableOpacity
                    onPress = { () => navigateRoot(screen.interpreter.settings) }
                    style = { styles.footerLink }>
                    <Text style = { styles.footerLinkText }>Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress = { () => navigateRoot(screen.interpreter.earnings) }
                    style = { styles.footerLink }>
                    <Text style = { styles.footerLinkText }>Earnings</Text>
                </TouchableOpacity>
            </View>

            {/* Connection Status */}
            <View style = { styles.connectionBar }>
                <View style = { [
                    styles.connectionDot,
                    isConnected ? styles.dotGreen : styles.dotOrange
                ] } />
                <Text style = { styles.connectionText }>
                    { isConnected ? 'Connected to queue' : 'Reconnecting...' }
                </Text>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    acceptButton: {
        backgroundColor: '#4caf50',
        borderRadius: 10,
        flex: 1,
        marginRight: 8,
        paddingVertical: 12
    },
    acceptText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center'
    },
    availabilityCard: {
        alignItems: 'center',
        borderRadius: 14,
        elevation: 3,
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 20,
        marginHorizontal: 16,
        padding: 18
    },
    availabilityText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginLeft: 10
    },
    available: {
        backgroundColor: '#2e7d32',
        shadowColor: '#4caf50'
    },
    connectionBar: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 12
    },
    connectionDot: {
        borderRadius: 4,
        height: 8,
        marginRight: 8,
        width: 8
    },
    connectionText: {
        color: '#888',
        fontSize: 12
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    content: {
        paddingBottom: 40
    },
    declineButton: {
        backgroundColor: '#d32f2f',
        borderRadius: 10,
        flex: 1,
        paddingVertical: 12
    },
    declineText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center'
    },
    endCallButton: {
        backgroundColor: '#d32f2f',
        borderRadius: 10,
        marginTop: 16,
        paddingVertical: 12,
        width: '100%'
    },
    endCallText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center'
    },
    dotGray: {
        backgroundColor: '#666'
    },
    dotGreen: {
        backgroundColor: '#4caf50'
    },
    dotOrange: {
        backgroundColor: '#ff9800'
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600'
    },
    inSession: {
        backgroundColor: '#1565c0'
    },
    infoRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: 16,
        marginTop: 8
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 8
    },
    footerLink: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        marginHorizontal: 6,
        paddingHorizontal: 16,
        paddingVertical: 8
    },
    footerLinkText: {
        color: '#aaa',
        fontSize: 13
    },
    languageTag: {
        backgroundColor: '#1a1a2e',
        borderRadius: 6,
        marginRight: 8,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 4
    },
    languageTagText: {
        color: '#aaa',
        fontSize: 13
    },
    modeTag: {
        backgroundColor: '#2979ff',
        borderRadius: 6,
        marginRight: 8,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 4
    },
    modeTagText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700'
    },
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 6
    },
    logoutText: {
        color: '#888',
        fontSize: 13
    },
    offline: {
        backgroundColor: '#424242',
        shadowColor: '#666'
    },
    requestActions: {
        flexDirection: 'row',
        marginTop: 16
    },
    requestCard: {
        backgroundColor: '#1a1a2e',
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 20
    },
    requestClient: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginTop: 4
    },
    requestContext: {
        color: '#666',
        fontSize: 13,
        marginTop: 2
    },
    requestLanguage: {
        color: '#888',
        fontSize: 14,
        marginTop: 4
    },
    requestTitle: {
        color: '#ff9800',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase'
    },
    sectionLabel: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        textTransform: 'uppercase'
    },
    sessionCard: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 14,
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 24
    },
    sessionLabel: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase'
    },
    sessionClient: {
        color: '#aaa',
        fontSize: 14,
        marginTop: 4
    },
    sessionTimer: {
        color: '#4caf50',
        fontSize: 40,
        fontVariant: [ 'tabular-nums' ],
        fontWeight: '700',
        marginTop: 4
    },
    statusDot: {
        borderRadius: 6,
        height: 12,
        width: 12
    },
    waitingCard: {
        alignItems: 'center',
        marginHorizontal: 16,
        paddingVertical: 40
    },
    waitingText: {
        color: '#666',
        fontSize: 15
    }
});

export default InterpreterHomeScreen;
