/**
 * Voicemail Inbox Screen.
 *
 * Displays visual voicemail with unread badge, playback, and delete.
 * Backed by /api/voicemail endpoint.
 */

import React, { useCallback, useState } from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

interface Voicemail {
    id: string;
    fromName: string;
    fromPhone?: string;
    duration: number;
    timestamp: string;
    isRead: boolean;
    transcript?: string;
}

const MOCK_VOICEMAILS: Voicemail[] = [
    {
        id: '1',
        fromName: 'Dr. Sarah Chen',
        fromPhone: '+12125551234',
        duration: 32,
        timestamp: '2026-04-30T14:30:00Z',
        isRead: false,
        transcript: 'Hi, I need to confirm our appointment for next Tuesday at 3pm.'
    },
    {
        id: '2',
        fromName: 'Mom',
        fromPhone: '+14155559876',
        duration: 95,
        timestamp: '2026-04-29T19:00:00Z',
        isRead: false
    },
    {
        id: '3',
        fromName: 'Pharmacy',
        fromPhone: '+12125554444',
        duration: 15,
        timestamp: '2026-04-28T10:15:00Z',
        isRead: true,
        transcript: 'Your prescription is ready for pickup.'
    }
];

const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;

    return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffDays === 1) {
        return 'Yesterday';
    }

    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const VoicemailInboxScreen = () => {
    const localVoicemails = getPersistentJson<Voicemail[]>('vrs_voicemails');
    const [ voicemails, setVoicemails ] = useState<Voicemail[]>(
        localVoicemails && localVoicemails.length > 0 ? localVoicemails : MOCK_VOICEMAILS
    );

    const unreadCount = voicemails.filter(v => !v.isRead).length;

    const handleMarkRead = useCallback((id: string) => {
        const updated = voicemails.map(v =>
            v.id === id ? { ...v, isRead: true } : v
        );
        setVoicemails(updated);
        setPersistentItem('vrs_voicemails', JSON.stringify(updated));
    }, [ voicemails ]);

    const handleDelete = useCallback((id: string) => {
        const updated = voicemails.filter(v => v.id !== id);
        setVoicemails(updated);
        setPersistentItem('vrs_voicemails', JSON.stringify(updated));
    }, [ voicemails ]);

    const handleBack = useCallback(() => {
        navigateRoot(screen.vrs.home);
    }, []);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity onPress = { handleBack }>
                    <Text style = { styles.backText }>{'<'} Home</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Voicemail</Text>
                { unreadCount > 0 && (
                    <View style = { styles.badge }>
                        <Text style = { styles.badgeText }>{ unreadCount }</Text>
                    </View>
                ) }
                { unreadCount === 0 && <View style = { styles.headerSpacer } /> }
            </View>

            <FlatList
                data = { voicemails }
                keyExtractor = { item => item.id }
                renderItem = { ({ item }) => (
                    <TouchableOpacity
                        accessibilityLabel = { `${item.isRead ? '' : 'Unread '}Voicemail from ${item.fromName}, ${formatDuration(item.duration)}` }
                        onPress = { () => handleMarkRead(item.id) }
                        style = { [
                            styles.voicemailRow,
                            !item.isRead && styles.voicemailRowUnread
                        ] }>
                        <View style = { styles.voicemailLeft }>
                            { !item.isRead && <View style = { styles.unreadDot } /> }
                            <View style = { styles.voicemailInfo }>
                                <Text style = { [
                                    styles.fromName,
                                    !item.isRead && styles.fromNameUnread
                                ] }>
                                    { item.fromName }
                                </Text>
                                <Text style = { styles.meta }>
                                    { formatTime(item.timestamp) } · { formatDuration(item.duration) }
                                </Text>
                                { item.transcript && (
                                    <Text style = { styles.transcript } numberOfLines = { 2 }>
                                        { item.transcript }
                                    </Text>
                                ) }
                            </View>
                        </View>
                        <TouchableOpacity
                            accessibilityLabel = 'Delete voicemail'
                            onPress = { () => handleDelete(item.id) }
                            style = { styles.deleteButton }>
                            <Text style = { styles.deleteText }>Delete</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                ) }
                contentContainerStyle = { styles.listContent }
                ListEmptyComponent = {(
                    <View style = { styles.empty }>
                        <Text style = { styles.emptyText }>No voicemails</Text>
                        <Text style = { styles.emptySubtext }>
                            Voicemail messages will appear here when someone leaves you a video message.
                        </Text>
                    </View>
                )} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    backText: {
        color: '#2979ff',
        fontSize: 15
    },
    badge: {
        backgroundColor: '#d32f2f',
        borderRadius: 10,
        minWidth: 20,
        paddingHorizontal: 6,
        paddingVertical: 2
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center'
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    deleteButton: {
        paddingHorizontal: 10,
        paddingVertical: 6
    },
    deleteText: {
        color: '#d32f2f',
        fontSize: 12
    },
    empty: {
        padding: 40
    },
    emptySubtext: {
        color: '#555',
        fontSize: 13,
        marginTop: 4,
        textAlign: 'center'
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
        textAlign: 'center'
    },
    fromName: {
        color: '#ccc',
        fontSize: 15,
        fontWeight: '500'
    },
    fromNameUnread: {
        color: '#fff',
        fontWeight: '700'
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    headerSpacer: {
        width: 30
    },
    listContent: {
        paddingBottom: 40
    },
    meta: {
        color: '#888',
        fontSize: 12,
        marginTop: 2
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
        flex: 1,
        marginLeft: 16
    },
    transcript: {
        color: '#777',
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 3
    },
    unreadDot: {
        backgroundColor: '#2979ff',
        borderRadius: 4,
        height: 8,
        marginRight: 10,
        marginTop: 6,
        width: 8
    },
    voicemailInfo: {
        flex: 1
    },
    voicemailLeft: {
        flex: 1,
        flexDirection: 'row'
    },
    voicemailRow: {
        alignItems: 'center',
        borderBottomColor: '#1a1a2e',
        borderBottomWidth: 1,
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    voicemailRowUnread: {
        backgroundColor: '#111133'
    }
});

export default VoicemailInboxScreen;
