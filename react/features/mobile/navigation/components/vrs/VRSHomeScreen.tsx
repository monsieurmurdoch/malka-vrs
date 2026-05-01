/**
 * VRS Client Home Screen.
 *
 * Main landing screen for Deaf/HoH users on the mobile VRS client.
 * Provides dial pad, recent calls, contacts, and request interpreter.
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

import { appNavigate } from '../../../../app/actions';
import { getAppName } from '../../../../base/whitelabel/functions';
import { cancelInterpreterRequest, requestInterpreter } from '../../../../interpreter-queue/actions';
import { QueueState } from '../../../../interpreter-queue/reducer';
import { apiClient } from '../../../../shared/api-client';
import { clearPersistentItems, getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import NetworkStatusBar from '../NetworkStatusBar';
import { useTenantTheme } from '../../hooks/useTenantTheme';

interface UserInfo {
    id?: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
    primaryPhone?: string;
    organization?: string;
    role?: string;
    serviceModes?: string[];
    tenantId?: string;
}

const LANGUAGES = [
    { code: 'ASL', label: 'ASL' },
    { code: 'LSQ', label: 'LSQ' },
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' }
];

const VRSHomeScreen = () => {
    const dispatch = useDispatch();
    const theme = useTenantTheme();
    const queueState = useSelector((state: any) => state['features/interpreter-queue'] as QueueState | undefined);
    const isConnected = Boolean(queueState?.isConnected);
    const isRequestPending = Boolean(queueState?.isRequestPending);
    const queuePosition = queueState?.queuePosition;

    const [ userInfo, setUserInfo ] = useState<UserInfo | null>(() => getPersistentJson<UserInfo>('vrs_user_info'));
    const savedLang = getPersistentJson<string>('vrs_request_language');
    const savedCaptions = getPersistentJson<boolean>('vrs_captions_enabled');
    const [ language, setLanguage ] = useState(savedLang || 'ASL');
    const [ captionsOn, setCaptionsOn ] = useState(savedCaptions ?? true);
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

    const handleRequestInterpreter = useCallback(() => {
        if (isRequestPending) {
            dispatch(cancelInterpreterRequest());

            return;
        }
        dispatch(requestInterpreter(language));
    }, [ dispatch, isRequestPending, language ]);

    const handleDialPad = useCallback(() => {
        navigateRoot(screen.vrs.dialPad);
    }, []);

    const handleContacts = useCallback(() => {
        navigateRoot(screen.vrs.contacts);
    }, []);

    const handleCallHistory = useCallback(() => {
        navigateRoot(screen.vrs.callHistory);
    }, []);

    const handleJoinRoom = useCallback((roomName: string) => {
        dispatch(appNavigate(roomName, { hidePrejoin: true }));
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
                    { !isRequestPending && (
                        <Text style = { styles.primaryActionSubtext }>
                            {language} interpreter available now
                        </Text>
                    ) }
                </TouchableOpacity>

                {/* Language & Captions */}
                <View style = { styles.controlsRow }>
                    <View style = { styles.languageSelector }>
                        { LANGUAGES.map(lang => (
                            <TouchableOpacity
                                accessibilityLabel = { `Select ${lang.label}` }
                                accessibilityRole = 'button'
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

                {/* Quick Actions Grid */}
                <View style = { styles.actionsGrid }>
                    <TouchableOpacity
                        accessibilityLabel = 'Open dial pad'
                        accessibilityRole = 'button'
                        onPress = { handleDialPad }
                        style = { styles.actionCard }>
                        <Text style = { styles.actionIcon }>{'\u{1F4DE}'}</Text>
                        <Text style = { styles.actionLabel }>Dial</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel = 'Open contacts'
                        accessibilityRole = 'button'
                        onPress = { handleContacts }
                        style = { styles.actionCard }>
                        <Text style = { styles.actionIcon }>{'\u{1F4D2}'}</Text>
                        <Text style = { styles.actionLabel }>Contacts</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel = 'View call history'
                        accessibilityRole = 'button'
                        onPress = { handleCallHistory }
                        style = { styles.actionCard }>
                        <Text style = { styles.actionIcon }>{'\u{1F4CB}'}</Text>
                        <Text style = { styles.actionLabel }>History</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel = 'Start direct call'
                        accessibilityRole = 'button'
                        onPress = { () => handleJoinRoom(`vrs-${Date.now()}`) }
                        style = { styles.actionCard }>
                        <Text style = { styles.actionIcon }>{'\u{1F4F1}'}</Text>
                        <Text style = { styles.actionLabel }>Direct Call</Text>
                    </TouchableOpacity>
                </View>

                {/* Voicemail Link */}
                <TouchableOpacity
                    accessibilityLabel = 'Open voicemail inbox'
                    accessibilityRole = 'button'
                    onPress = { () => navigateRoot(screen.vrs.voicemail) }
                    style = { styles.voicemailRow }>
                    <Text style = { styles.voicemailIcon }>{'\u{1F4E3}'}</Text>
                    <Text style = { styles.voicemailLabel }>Voicemail</Text>
                    { voicemailUnreadCount > 0 && (
                        <View style = { styles.voicemailBadge }>
                            <Text style = { styles.voicemailBadgeText }>{ voicemailUnreadCount }</Text>
                        </View>
                    ) }
                </TouchableOpacity>

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
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    actionCard: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        elevation: 2,
        flex: 1,
        margin: 6,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 2
    },
    actionIcon: {
        fontSize: 28,
        marginBottom: 6
    },
    actionLabel: {
        color: '#e0e0e0',
        fontSize: 13,
        fontWeight: '500'
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 16,
        paddingHorizontal: 16
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
        justifyContent: 'space-between',
        marginHorizontal: 16,
        marginBottom: 16
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
    langText: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600'
    },
    langTextActive: {
        color: '#fff'
    },
    languageSelector: {
        flexDirection: 'row',
        flex: 1,
        flexWrap: 'wrap'
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
        borderRadius: 16,
        elevation: 4,
        marginBottom: 24,
        marginHorizontal: 16,
        padding: 20,
        shadowColor: '#2979ff',
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    primaryActionCancel: {
        backgroundColor: '#d32f2f',
        shadowColor: '#d32f2f'
    },
    primaryActionSubtext: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 13,
        marginTop: 4
    },
    primaryActionText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600'
    },
    scrollContent: {
        paddingBottom: 40
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
