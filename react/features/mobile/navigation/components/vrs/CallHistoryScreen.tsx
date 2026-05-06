/**
 * VRS Call History Screen.
 *
 * Displays recent VRS calls with duration, interpreter info, and re-dial.
 * Backed by the /api/client/call-history endpoint.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { apiClient } from '../../../../shared/api-client';
import { getPersistentJson, setPersistentItem } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';
import { CallRecord } from '../../../types';

interface CallHistoryResponse {
    calls?: Array<Record<string, unknown>>;
}

function stringField(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value ? value : fallback;
}

function optionalStringField(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function normalizeDirection(value: unknown): CallRecord['direction'] {
    return value === 'incoming' || value === 'missed' ? value : 'outgoing';
}

function normalizeCallRecord(raw: Record<string, unknown>): CallRecord {
    const durationMinutes = Number(raw.duration_minutes ?? raw.durationMinutes ?? 0);

    return {
        id: String(raw.id || raw.call_id || raw.room_name || Date.now()),
        contactName: stringField(raw.callee_name || raw.client_name || raw.target_name || raw.room_name, 'Unknown'),
        phoneNumber: stringField(raw.callee_phone || raw.target_phone || raw.phoneNumber),
        direction: normalizeDirection(raw.direction),
        duration: Number(raw.duration_seconds ?? raw.durationSeconds ?? durationMinutes * 60),
        interpreterName: optionalStringField(raw.interpreter_name || raw.interpreterName),
        timestamp: stringField(raw.started_at || raw.timestamp || raw.created_at, new Date().toISOString())
    };
}

type DirectionFilter = 'all' | 'missed' | 'outgoing' | 'incoming';

const FILTER_TABS: { key: DirectionFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'missed', label: 'Missed' },
    { key: 'outgoing', label: 'Outgoing' },
    { key: 'incoming', label: 'Incoming' }
];

const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;

    return `${ m }m ${ s }s`;
};

const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `Today ${ d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }`;
    }
    if (diffDays === 1) {
        return `Yesterday`;
    }

    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const CallHistoryScreen = () => {
    const dispatch = useDispatch();

    // Read from local call history storage, fall back to mock data
    const localHistory = getPersistentJson<CallRecord[]>('vrs_call_history');
    const [ calls, setCalls ] = useState<CallRecord[]>(localHistory && localHistory.length > 0 ? localHistory : []);
    const [ directionFilter, setDirectionFilter ] = useState<DirectionFilter>('all');

    useEffect(() => {
        let mounted = true;

        apiClient.get<CallHistoryResponse>('/api/client/call-history?limit=50&offset=0').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'call_history_load_failed', { error: response.error });

                return;
            }

            const nextCalls = (response.data?.calls || []).map(normalizeCallRecord);

            setCalls(nextCalls);
            setPersistentItem('vrs_call_history', JSON.stringify(nextCalls));
        });

        return () => {
            mounted = false;
        };
    }, []);

    const filteredCalls = useMemo(() => {
        if (directionFilter === 'all') {
            return calls;
        }

        return calls.filter(c => c.direction === directionFilter);
    }, [ calls, directionFilter ]);

    const handleAddContact = useCallback((call: CallRecord) => {
        const existing = getPersistentJson<{ id: string; name: string; phoneNumber?: string }[]>('vrs_contacts') || [];
        const alreadyExists = existing.some(
            c => c.phoneNumber === call.phoneNumber || c.name.toLowerCase() === call.contactName.toLowerCase()
        );

        if (alreadyExists) {
            return;
        }

        const newContact = {
            id: `contact-${Date.now()}`,
            name: call.contactName,
            phoneNumber: call.phoneNumber
        };

        setPersistentItem('vrs_contacts', JSON.stringify([ newContact, ...existing ]));

        mobileLog('info', 'add_contact_from_history', {
            callId: call.id,
            contactName: call.contactName
        });
    }, []);

    const handleReDial = useCallback((call: CallRecord) => {
        const roomName = `vrs-${ Date.now() }`;

        // Persist callback metadata for the new call
        const redialRecord: CallRecord = {
            id: `redial-${ Date.now() }`,
            contactName: call.contactName,
            phoneNumber: call.phoneNumber,
            direction: 'outgoing',
            duration: 0,
            timestamp: new Date().toISOString(),
            interpreterName: undefined
        };
        const existing = getPersistentJson<CallRecord[]>('vrs_call_history') || [];
        const updated = [ redialRecord, ...existing ].slice(0, 100);

        setPersistentItem('vrs_call_history', JSON.stringify(updated));

        mobileLog('info', 'call_history_redial', {
            fromCallId: call.id,
            toContact: call.contactName,
            roomName
        });

        dispatch(appNavigate(roomName, { hidePrejoin: true }));
    }, [ dispatch ]);

    const directionIcon = (d: string) => {
        switch (d) {
        case 'outgoing': return '\u{2197}';
        case 'incoming': return '\u{2199}';
        case 'missed': return '\u{00D7}';
        default: return '';
        }
    };

    const directionColor = (d: string) => {
        switch (d) {
        case 'missed': return '#d32f2f';
        case 'incoming': return '#4caf50';
        default: return '#2979ff';
        }
    };

    const renderCall = useCallback(({ item }: { item: CallRecord }) => (
        <View style = { styles.callRow }>
            <View style = { styles.callLeft }>
                <Text style = { [ styles.directionIcon, { color: directionColor(item.direction) } ] }>
                    { directionIcon(item.direction) }
                </Text>
                <View style = { styles.callInfo }>
                    <Text style = { [
                        styles.callName,
                        item.direction === 'missed' && styles.callNameMissed
                    ] }>
                        { item.contactName }
                    </Text>
                    <Text style = { styles.callMeta }>
                        { formatTime(item.timestamp) }
                        { item.duration > 0 && ` \u00B7 ${ formatDuration(item.duration) }` }
                    </Text>
                    { item.interpreterName && (
                        <Text style = { styles.callInterpreter }>
                            via { item.interpreterName }
                        </Text>
                    ) }
                </View>
            </View>
            <View style = { styles.actionsColumn }>
                <TouchableOpacity
                    accessibilityLabel = { `Callback ${item.contactName}` }
                    onPress = { () => handleReDial(item) }
                    style = { styles.callbackButton }>
                    <Text style = { styles.callbackIcon }>{'\u{1F4DE}'}</Text>
                    <Text style = { styles.callbackLabel }>Callback</Text>
                </TouchableOpacity>
                { item.phoneNumber && (
                    <TouchableOpacity
                        accessibilityLabel = { `Add ${item.contactName} to contacts` }
                        onPress = { () => handleAddContact(item) }
                        style = { styles.addContactButton }>
                        <Text style = { styles.addContactIcon }>+</Text>
                    </TouchableOpacity>
                ) }
            </View>
        </View>
    ), [ handleReDial, handleAddContact ]);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity
                    accessibilityLabel = 'Back to VRS home'
                    accessibilityRole = 'button'
                    onPress = { () => navigateRoot(screen.vrs.home) }
                    style = { styles.backButton }>
                    <Text style = { styles.backText }>Back</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Call History</Text>
                <View style = { styles.headerSpacer } />
            </View>

            {/* Filter Tabs */}
            <View style = { styles.filterRow }>
                { FILTER_TABS.map(tab => (
                    <TouchableOpacity
                        accessibilityLabel = { `Filter by ${tab.label}` }
                        accessibilityRole = 'tab'
                        key = { tab.key }
                        onPress = { () => setDirectionFilter(tab.key) }
                        style = { [
                            styles.filterTab,
                            directionFilter === tab.key && styles.filterTabActive
                        ] }>
                        <Text style = { [
                            styles.filterTabText,
                            directionFilter === tab.key && styles.filterTabTextActive
                        ] }>
                            { tab.label }
                        </Text>
                    </TouchableOpacity>
                )) }
            </View>
            <FlatList
                data = { filteredCalls }
                keyExtractor = { item => item.id }
                renderItem = { renderCall }
                contentContainerStyle = { styles.listContent }
                ListEmptyComponent = {(
                    <Text style = { styles.empty }>No call history</Text>
                )} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    actionsColumn: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6
    },
    addContactButton: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        height: 32,
        justifyContent: 'center',
        width: 32
    },
    addContactIcon: {
        color: '#2979ff',
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center'
    },
    callInfo: {
        flex: 1,
        marginLeft: 10
    },
    callInterpreter: {
        color: '#666',
        fontSize: 11,
        marginTop: 2
    },
    callLeft: {
        alignItems: 'center',
        flex: 1,
        flexDirection: 'row'
    },
    callMeta: {
        color: '#888',
        fontSize: 12,
        marginTop: 2
    },
    callName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '500'
    },
    callNameMissed: {
        color: '#d32f2f'
    },
    callRow: {
        alignItems: 'center',
        borderBottomColor: '#1a1a2e',
        borderBottomWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    callbackButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6
    },
    callbackIcon: {
        fontSize: 16
    },
    callbackLabel: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
        marginTop: 1
    },
    backButton: {
        alignItems: 'center',
        borderColor: '#2d2d48',
        borderRadius: 12,
        borderWidth: 1,
        height: 42,
        justifyContent: 'center',
        paddingHorizontal: 14
    },
    backText: {
        color: '#f7f7fa',
        fontSize: 14,
        fontWeight: '700'
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    directionIcon: {
        fontSize: 20,
        fontWeight: '700'
    },
    empty: {
        color: '#666',
        fontSize: 14,
        padding: 40,
        textAlign: 'center'
    },
    filterRow: {
        borderBottomColor: '#1a1a2e',
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: 8,
        paddingBottom: 14,
        paddingHorizontal: 16
    },
    filterTab: {
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        flex: 1,
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8
    },
    filterTabActive: {
        backgroundColor: '#2979ff'
    },
    filterTabText: {
        color: '#888',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center'
    },
    filterTabTextActive: {
        color: '#fff'
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 18,
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 42 : 14
    },
    headerSpacer: {
        width: 74
    },
    listContent: {
        paddingBottom: 40
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '800'
    }
});

export default CallHistoryScreen;
