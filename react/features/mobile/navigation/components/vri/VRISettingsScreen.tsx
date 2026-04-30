/**
 * VRI Settings Screen.
 *
 * Media defaults and session preferences for VRI clients.
 */

import React, { useCallback, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { setPersistentItem, getPersistentJson } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

interface MediaDefaults {
    cameraOn: boolean;
    micMuted: boolean;
    autoJoinOnMatch: boolean;
    notificationsEnabled: boolean;
}

const VRISettingsScreen = () => {
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

    const saveDefaults = useCallback((updates: Partial<MediaDefaults>) => {
        const next = { cameraOn, micMuted, autoJoinOnMatch: autoJoin, notificationsEnabled: notifications, ...updates };
        setPersistentItem('vri_media_defaults', JSON.stringify(next));
    }, [ cameraOn, micMuted, autoJoin, notifications ]);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity onPress = { () => navigateRoot(screen.vri.console) }>
                    <Text style = { styles.backText }>{'<'} Back</Text>
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
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { cameraOn } />
                </View>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Microphone muted</Text>
                    <Switch
                        onValueChange = { v => { setMicMuted(v); saveDefaults({ micMuted: v }); } }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { micMuted } />
                </View>

                <Text style = { styles.sectionTitle }>Session</Text>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Auto-join on match</Text>
                    <Switch
                        onValueChange = { v => { setAutoJoin(v); saveDefaults({ autoJoinOnMatch: v }); } }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
                        value = { autoJoin } />
                </View>

                <View style = { styles.row }>
                    <Text style = { styles.label }>Notifications</Text>
                    <Switch
                        onValueChange = { v => { setNotifications(v); saveDefaults({ notificationsEnabled: v }); } }
                        trackColor = {{ false: '#333', true: '#2979ff' }}
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
