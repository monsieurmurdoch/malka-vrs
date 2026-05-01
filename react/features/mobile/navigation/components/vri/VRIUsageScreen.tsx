/**
 * VRI Usage Screen.
 *
 * Displays day/week/month usage summary for VRI corporate accounts.
 * Backed by /api/client/call-history aggregated data.
 */

import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
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

interface UsagePeriod {
    label: string;
    minutes: number;
    sessions: number;
}

interface CallRecord {
    duration: number;
    timestamp: string;
}

interface CallHistoryResponse {
    calls?: Array<Record<string, any>>;
}

function normalizeUsageCall(raw: Record<string, any>): CallRecord {
    const durationMinutes = Number(raw.duration_minutes ?? raw.durationMinutes ?? 0);

    return {
        duration: Number(raw.duration_seconds ?? raw.durationSeconds ?? durationMinutes * 60),
        timestamp: raw.started_at || raw.timestamp || raw.created_at || new Date().toISOString()
    };
}

const VRIUsageScreen = () => {
    const [ localHistory, setLocalHistory ] = useState<CallRecord[]>(
        getPersistentJson<CallRecord[]>('vri_usage_history')
            || getPersistentJson<CallRecord[]>('vrs_call_history')
            || []
    );

    useEffect(() => {
        let mounted = true;

        apiClient.get<CallHistoryResponse>('/api/client/call-history?limit=100&offset=0').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'vri_usage_load_failed', { error: response.error });

                return;
            }

            const nextHistory = (response.data?.calls || []).map(normalizeUsageCall);

            setLocalHistory(nextHistory);
            setPersistentItem('vri_usage_history', JSON.stringify(nextHistory));
        });

        return () => {
            mounted = false;
        };
    }, []);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const computePeriod = (days: number): UsagePeriod => {
        const cutoff = now - days * dayMs;
        const filtered = localHistory.filter(c => new Date(c.timestamp).getTime() >= cutoff);
        const minutes = Math.round(filtered.reduce((sum, c) => sum + c.duration, 0) / 60);

        return {
            minutes,
            sessions: filtered.length,
            label: days === 1 ? 'Today' : days === 7 ? 'This Week' : 'This Month'
        };
    };

    const periods = [ computePeriod(1), computePeriod(7), computePeriod(30) ];

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity
                    accessibilityLabel = 'Back to VRI console'
                    onPress = { () => navigateRoot(screen.vri.console) }>
                    <Text style = { styles.backText }>{'<'} Back</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Usage</Text>
                <View style = { styles.headerSpacer } />
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                { periods.map(p => (
                    <View key = { p.label } style = { styles.periodCard }>
                        <Text style = { styles.periodLabel }>{ p.label }</Text>
                        <View style = { styles.periodStats }>
                            <View style = { styles.stat }>
                                <Text style = { styles.statValue }>{ p.minutes }</Text>
                                <Text style = { styles.statUnit }>minutes</Text>
                            </View>
                            <View style = { styles.statDivider } />
                            <View style = { styles.stat }>
                                <Text style = { styles.statValue }>{ p.sessions }</Text>
                                <Text style = { styles.statUnit }>sessions</Text>
                            </View>
                        </View>
                    </View>
                )) }

                { localHistory.length === 0 && (
                    <Text style = { styles.empty }>
                        Usage data will appear after your first VRI session.
                    </Text>
                ) }
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
    empty: {
        color: '#666',
        fontSize: 14,
        padding: 40,
        textAlign: 'center'
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
    periodCard: {
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        marginBottom: 12,
        padding: 16
    },
    periodLabel: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 12,
        textTransform: 'uppercase'
    },
    periodStats: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    stat: {
        alignItems: 'center',
        flex: 1
    },
    statDivider: {
        backgroundColor: '#333',
        height: 30,
        width: 1
    },
    statUnit: {
        color: '#666',
        fontSize: 12,
        marginTop: 2
    },
    statValue: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700'
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600'
    }
});

export default VRIUsageScreen;
