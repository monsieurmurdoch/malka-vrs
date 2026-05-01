/**
 * Voicemail Inbox Screen.
 *
 * Displays visual voicemail with unread badge, playback, and delete.
 * Backed by /api/voicemail endpoint.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Linking,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { apiClient } from '../../../../shared/api-client';
import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import { Voicemail } from '../../../types';

interface VoicemailInboxResponse {
    messages?: Array<Record<string, any>>;
    total?: number;
    unreadCount?: number;
}

function normalizeVoicemail(raw: Record<string, any>): Voicemail {
    return {
        id: String(raw.id),
        fromName: raw.caller_name || raw.fromName || raw.caller_phone || 'Unknown caller',
        fromPhone: raw.caller_phone || raw.fromPhone || raw.callee_phone,
        duration: Number(raw.duration_seconds ?? raw.durationSeconds ?? raw.duration ?? 0),
        timestamp: raw.created_at || raw.timestamp || new Date().toISOString(),
        isRead: Boolean(raw.seen ?? raw.isRead),
        transcript: raw.transcript,
        playbackUrl: raw.playbackUrl
    };
}

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
        localVoicemails && localVoicemails.length > 0 ? localVoicemails : []
    );
    const [ playingId, setPlayingId ] = useState<string | null>(null);
    const [ playbackProgress, setPlaybackProgress ] = useState<Record<string, number>>({});

    const unreadCount = voicemails.filter(v => !v.isRead).length;

    useEffect(() => {
        let mounted = true;

        apiClient.get<VoicemailInboxResponse>('/api/voicemail/inbox?limit=50&offset=0').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'voicemail_inbox_load_failed', { error: response.error });

                return;
            }

            const nextVoicemails = (response.data?.messages || []).map(normalizeVoicemail);

            setVoicemails(nextVoicemails);
            setPersistentItem('vrs_voicemails', JSON.stringify(nextVoicemails));
        });

        return () => {
            mounted = false;
        };
    }, []);

    // Group voicemails by time period
    const groupedVoicemails = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 86400000);

        const groups: { title: string; items: Voicemail[] }[] = [];
        const today: Voicemail[] = [];
        const yesterday: Voicemail[] = [];
        const older: Voicemail[] = [];

        for (const vm of voicemails) {
            const d = new Date(vm.timestamp);

            if (d >= todayStart) {
                today.push(vm);
            } else if (d >= yesterdayStart) {
                yesterday.push(vm);
            } else {
                older.push(vm);
            }
        }

        if (today.length > 0) {
            groups.push({ title: 'Today', items: today });
        }

        if (yesterday.length > 0) {
            groups.push({ title: 'Yesterday', items: yesterday });
        }

        if (older.length > 0) {
            groups.push({ title: 'Older', items: older });
        }

        return groups;
    }, [ voicemails ]);

    const handleMarkRead = useCallback((id: string) => {
        const updated = voicemails.map(v =>
            v.id === id ? { ...v, isRead: true } : v
        );
        setVoicemails(updated);
        setPersistentItem('vrs_voicemails', JSON.stringify(updated));
        void apiClient.post(`/api/voicemail/messages/${id}/seen`).then(response => {
            if (response.error) {
                mobileLog('warn', 'voicemail_mark_seen_failed', { id, error: response.error });
            }
        });
    }, [ voicemails ]);

    const handleDelete = useCallback((id: string) => {
        const updated = voicemails.filter(v => v.id !== id);

        setVoicemails(updated);
        setPersistentItem('vrs_voicemails', JSON.stringify(updated));
        void apiClient.del(`/api/voicemail/messages/${id}`).then(response => {
            if (response.error) {
                mobileLog('warn', 'voicemail_delete_failed', { id, error: response.error });
            }
        });
    }, [ voicemails ]);

    const handleBack = useCallback(() => {
        navigateRoot(screen.vrs.home);
    }, []);

    const handleTogglePlay = useCallback(async (message: Voicemail) => {
        if (playingId === message.id) {
            setPlayingId(null);
        } else {
            setPlayingId(message.id);
            setPlaybackProgress(prev => ({
                ...prev,
                [message.id]: prev[message.id] || 0
            }));
            handleMarkRead(message.id);

            const messageResponse = message.playbackUrl
                ? { data: message, error: null }
                : await apiClient.get<Voicemail>(`/api/voicemail/messages/${message.id}`);
            const playbackUrl = messageResponse.data?.playbackUrl;

            if (messageResponse.error || !playbackUrl) {
                mobileLog('warn', 'voicemail_playback_url_missing', {
                    id: message.id,
                    error: messageResponse.error || 'No playback URL'
                });

                return;
            }

            await Linking.openURL(playbackUrl);
            setPlaybackProgress(prev => ({ ...prev, [message.id]: 100 }));
        }
    }, [ playingId, handleMarkRead ]);

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
                data = { groupedVoicemails }
                keyExtractor = { (group, index) => group.title + index }
                renderItem = { ({ item: group }) => (
                    <View>
                        <Text style = { styles.groupHeader }>{ group.title }</Text>
                        { group.items.map(item => {
                            const isPlaying = playingId === item.id;
                            const progress = playbackProgress[item.id] || 0;

                            return (
                                <TouchableOpacity
                                    accessibilityLabel = { `${item.isRead ? '' : 'Unread '}Voicemail from ${item.fromName}, ${formatDuration(item.duration)}` }
                                    key = { item.id }
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
                                            {/* Playback controls */}
                                            <View style = { styles.playbackRow }>
                                                <TouchableOpacity
                                                    accessibilityLabel = { isPlaying ? 'Pause' : 'Play' }
                                                    onPress = { () => handleTogglePlay(item) }
                                                    style = { styles.playButton }>
                                                    <Text style = { styles.playIcon }>
                                                        { isPlaying ? '||' : '\u25B6' }
                                                    </Text>
                                                </TouchableOpacity>
                                                <View style = { styles.progressBar }>
                                                    <View style = { [
                                                        styles.progressFill,
                                                        { width: `${progress}%` }
                                                    ] } />
                                                </View>
                                                <Text style = { styles.playbackTime }>
                                                    { formatDuration(Math.round(item.duration * progress / 100)) }
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        accessibilityLabel = 'Delete voicemail'
                                        onPress = { () => handleDelete(item.id) }
                                        style = { styles.deleteButton }>
                                        <Text style = { styles.deleteText }>Delete</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        }) }
                    </View>
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
    groupHeader: {
        backgroundColor: '#0d0d1a',
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        paddingHorizontal: 20,
        paddingVertical: 8,
        textTransform: 'uppercase'
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
    playButton: {
        marginRight: 8
    },
    playIcon: {
        color: '#2979ff',
        fontSize: 16
    },
    playbackRow: {
        alignItems: 'center',
        flexDirection: 'row',
        marginTop: 8
    },
    playbackTime: {
        color: '#888',
        fontSize: 11,
        marginLeft: 6,
        minWidth: 30
    },
    progressBar: {
        backgroundColor: '#333',
        borderRadius: 2,
        flex: 1,
        height: 3
    },
    progressFill: {
        backgroundColor: '#2979ff',
        borderRadius: 2,
        height: 3
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
