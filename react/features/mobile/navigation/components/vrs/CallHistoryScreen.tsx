/**
 * VRS Call History Screen.
 *
 * Displays recent VRS calls with duration, interpreter info, and re-dial.
 * Backed by the /api/client/call-history endpoint.
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
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { getPersistentJson } from '../../../../vrs-auth/storage';

interface CallRecord {
    id: string;
    contactName: string;
    phoneNumber: string;
    direction: 'outgoing' | 'incoming' | 'missed';
    duration: number; // seconds
    timestamp: string; // ISO
    interpreterName?: string;
}

// Placeholder — will be replaced with API fetch
const MOCK_HISTORY: CallRecord[] = [
    {
        id: '1',
        contactName: 'Dr. Sarah Chen',
        phoneNumber: '+12125551234',
        direction: 'outgoing',
        duration: 420,
        timestamp: '2026-04-30T14:30:00Z',
        interpreterName: 'Maria S.'
    },
    {
        id: '2',
        contactName: 'Mom',
        phoneNumber: '+14155559876',
        direction: 'outgoing',
        duration: 1800,
        timestamp: '2026-04-30T10:00:00Z',
        interpreterName: 'James K.'
    },
    {
        id: '3',
        contactName: 'Unknown',
        phoneNumber: '+12125559999',
        direction: 'missed',
        duration: 0,
        timestamp: '2026-04-29T16:45:00Z'
    },
    {
        id: '4',
        contactName: 'Pizza Palace',
        phoneNumber: '+12125557777',
        direction: 'outgoing',
        duration: 180,
        timestamp: '2026-04-28T19:00:00Z',
        interpreterName: 'Lisa T.'
    },
    {
        id: '5',
        contactName: 'Work — Front Desk',
        phoneNumber: '+12125553000',
        direction: 'incoming',
        duration: 300,
        timestamp: '2026-04-27T09:15:00Z',
        interpreterName: 'Maria S.'
    }
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
    const [ calls ] = useState<CallRecord[]>(localHistory && localHistory.length > 0 ? localHistory : MOCK_HISTORY);

    const handleReDial = useCallback((call: CallRecord) => {
        const roomName = `vrs-${ Date.now() }`;

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
        <TouchableOpacity
            onPress = { () => handleReDial(item) }
            style = { styles.callRow }>
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
            <Text style = { styles.redialIcon }>{'\u{1F4DE}'}</Text>
        </TouchableOpacity>
    ), [ handleReDial ]);

    return (
        <SafeAreaView style = { styles.container }>
            <FlatList
                data = { calls }
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
    listContent: {
        paddingBottom: 40
    },
    redialIcon: {
        fontSize: 20
    }
});

export default CallHistoryScreen;
