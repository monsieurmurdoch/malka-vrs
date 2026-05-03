/**
 * VRI Settings Screen.
 *
 * Media defaults and session preferences for VRI clients.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { apiClient } from '../../../../shared/api-client';
import { setPersistentItem, getPersistentJson } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import { useTenantTheme } from '../../hooks/useTenantTheme';

interface MediaDefaults {
    cameraOn: boolean;
    micMuted: boolean;
    autoJoinOnMatch: boolean;
    notificationsEnabled: boolean;
}

const VRISettingsScreen = () => {
    const theme = useTenantTheme();
    const defaults = getPersistentJson<MediaDefaults>('vri_media_defaults') || {
        cameraOn: true,
        micMuted: true,
        autoJoinOnMatch: true,
        notificationsEnabled: true
    };

    const [ cameraOn, setCameraOn ] = useState(defaults.cameraOn);
    const [ micMuted, setMicMuted ] = useState(defaults.micMuted);
    const [ autoJoin, setAutoJoin ] = useState(defaults.autoJoinOnMatch);
    const [ notifications, setNotifications ] = useState(defaults.notificationsEnabled);

    useEffect(() => {
        let mounted = true;

        apiClient.get<Record<string, any>>('/api/client/preferences').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'vri_preferences_load_failed', { error: response.error });

                return;
            }

            const prefs = response.data;

            if (prefs) {
                const next = {
                    cameraOn: !Boolean(prefs.camera_default_off),
                    micMuted: Boolean(prefs.mic_default_off ?? true),
                    autoJoinOnMatch: !Boolean(prefs.skip_waiting_room),
                    notificationsEnabled: Boolean(prefs.notifications_enabled ?? true)
                };

                setCameraOn(next.cameraOn);
                setMicMuted(next.micMuted);
                setAutoJoin(next.autoJoinOnMatch);
                setNotifications(next.notificationsEnabled);
                setPersistentItem('vri_media_defaults', JSON.stringify(next));
            }
        });

        return () => {
            mounted = false;
        };
    }, []);

    const saveDefaults = useCallback((updates: Partial<MediaDefaults>) => {
        const next = { cameraOn, micMuted, autoJoinOnMatch: autoJoin, notificationsEnabled: notifications, ...updates };
        setPersistentItem('vri_media_defaults', JSON.stringify(next));
        void apiClient.put('/api/client/preferences', {
            camera_default_off: !next.cameraOn,
            mic_default_off: next.micMuted,
            skip_waiting_room: !next.autoJoinOnMatch,
            notifications_enabled: next.notificationsEnabled
        }).then(response => {
            if (response.error) {
                mobileLog('warn', 'vri_preferences_save_failed', { error: response.error });
            }
        });
    }, [ cameraOn, micMuted, autoJoin, notifications ]);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity
                    accessibilityLabel = 'Back to VRI console'
                    onPress = { () => navigateRoot(screen.vri.console) }>
                    <Text style = { [ styles.backText, { color: theme.accent } ] }>{'<'} Back</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Settings</Text>
                <View style = { styles.headerSpacer } />
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                <Text style = { styles.sectionTitle }>Media Defaults</Text>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Camera on when joining</Text>
                    <Switch
                        onValueChange = { v => { setCameraOn(v); saveDefaults({ cameraOn: v }); } }
                        trackColor = {{ false: '#333', true: theme.accent }}
                        value = { cameraOn } />
                </View>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Microphone muted</Text>
                    <Switch
                        onValueChange = { v => { setMicMuted(v); saveDefaults({ micMuted: v }); } }
                        trackColor = {{ false: '#333', true: theme.accent }}
                        value = { micMuted } />
                </View>

                <Text style = { styles.sectionTitle }>Session</Text>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Auto-join on match</Text>
                    <Switch
                        onValueChange = { v => { setAutoJoin(v); saveDefaults({ autoJoinOnMatch: v }); } }
                        trackColor = {{ false: '#333', true: theme.accent }}
                        value = { autoJoin } />
                </View>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Notifications</Text>
                    <Switch
                        onValueChange = { v => { setNotifications(v); saveDefaults({ notificationsEnabled: v }); } }
                        trackColor = {{ false: '#333', true: theme.accent }}
                        value = { notifications } />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    backText: {
        color: '#2979ff',
        fontSize: 15
    },
    container: {
        backgroundColor: '#0a0a1a',
        flex: 1
    },
    content: {
        paddingBottom: 40,
        paddingHorizontal: 20
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    headerSpacer: {
        width: 50
    },
    label: {
        color: '#ddd',
        fontSize: 15
    },
    row: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderBottomColor: '#252540',
        borderBottomWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14
    },
    sectionTitle: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginTop: 20,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600'
    }
});

export default VRISettingsScreen;
