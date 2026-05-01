/**
 * Interpreter Earnings Screen.
 *
 * Shows payable minutes, invoice status, and payout method placeholders.
 * Backed by /api/interpreter/earnings when available.
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

interface CallRecord {
    duration: number;
    timestamp: string;
}

interface EarningsRow {
    total_minutes?: number;
    payable_minutes?: number;
    total_earnings?: number;
    net_earnings?: number;
    status?: string;
    period_start?: string;
    period_end?: string;
}

interface EarningsResponse {
    earnings?: EarningsRow[];
}

interface InterpreterStats {
    totalMinutes?: number;
    totalEarnings?: number;
}

const InterpreterEarningsScreen = () => {
    const localHistory = getPersistentJson<CallRecord[]>('vrs_call_history') || [];
    const [ earnings, setEarnings ] = useState<EarningsRow[]>([]);
    const [ stats, setStats ] = useState<InterpreterStats | null>(null);

    useEffect(() => {
        let mounted = true;

        apiClient.get<EarningsResponse>('/api/interpreter/earnings').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'interpreter_earnings_load_failed', { error: response.error });

                return;
            }

            const rows = response.data?.earnings || [];

            setEarnings(rows);
            setPersistentItem('vrs_interpreter_earnings', JSON.stringify(rows));
        });

        apiClient.get<InterpreterStats>('/api/interpreter/stats').then(response => {
            if (!mounted) {
                return;
            }

            if (response.error) {
                mobileLog('warn', 'interpreter_stats_load_failed', { error: response.error });

                return;
            }

            setStats(response.data);
        });

        return () => {
            mounted = false;
        };
    }, []);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const earningsMinutes = earnings.reduce((sum, row) =>
        sum + Number(row.payable_minutes ?? row.total_minutes ?? 0), 0);
    const totalMinutes = Math.round(earningsMinutes || stats?.totalMinutes || localHistory.reduce((sum, c) => sum + c.duration, 0) / 60);
    const totalEarnings = earnings.reduce((sum, row) =>
        sum + Number(row.net_earnings ?? row.total_earnings ?? 0), 0) || stats?.totalEarnings || 0;

    const periodMinutes = (days: number) => {
        const cutoff = now - days * dayMs;

        return Math.round(
            localHistory
                .filter(c => new Date(c.timestamp).getTime() >= cutoff)
                .reduce((sum, c) => sum + c.duration, 0) / 60
        );
    };

    const todayMin = periodMinutes(1);
    const weekMin = periodMinutes(7);
    const monthMin = periodMinutes(30);

    return (
        <SafeAreaView style = { styles.container }>
            <View style = { styles.header }>
                <TouchableOpacity onPress = { () => navigateRoot(screen.interpreter.home) }>
                    <Text style = { styles.backText }>{'<'} Back</Text>
                </TouchableOpacity>
                <Text style = { styles.title }>Earnings</Text>
                <View style = { styles.headerSpacer } />
            </View>

            <ScrollView contentContainerStyle = { styles.content }>
                {/* Total Summary */}
                <View style = { styles.totalCard }>
                    <Text style = { styles.totalLabel }>Total Payable Minutes</Text>
                    <Text style = { styles.totalValue }>{ totalMinutes }</Text>
                    <Text style = { styles.totalSubvalue }>
                        ${ totalEarnings.toFixed(2) } estimated payable
                    </Text>
                </View>

                {/* Period Breakdown */}
                <View style = { styles.periods }>
                    <View style = { styles.periodCard }>
                        <Text style = { styles.periodValue }>{ todayMin }</Text>
                        <Text style = { styles.periodUnit }>Today</Text>
                    </View>
                    <View style = { styles.periodCard }>
                        <Text style = { styles.periodValue }>{ weekMin }</Text>
                        <Text style = { styles.periodUnit }>This Week</Text>
                    </View>
                    <View style = { styles.periodCard }>
                        <Text style = { styles.periodValue }>{ monthMin }</Text>
                        <Text style = { styles.periodUnit }>This Month</Text>
                    </View>
                </View>

                {/* Invoice Status */}
                <Text style = { styles.sectionTitle }>Invoices</Text>
                <View style = { styles.placeholderCard }>
                    <Text style = { styles.placeholderText }>
                        { earnings.length > 0
                            ? `${earnings.length} earning period${earnings.length === 1 ? '' : 's'} loaded from billing.`
                            : 'No payable earning periods yet.' }
                    </Text>
                </View>

                {/* Payout Method */}
                <Text style = { styles.sectionTitle }>Payout Method</Text>
                <View style = { styles.placeholderCard }>
                    <Text style = { styles.placeholderText }>
                        Payout method and tax/vendor profile are managed by admin until contractor payout rails are finalized.
                    </Text>
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
    periodCard: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        flex: 1,
        marginHorizontal: 4,
        padding: 14
    },
    periodUnit: {
        color: '#666',
        fontSize: 11,
        marginTop: 2,
        textTransform: 'uppercase'
    },
    periodValue: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700'
    },
    periods: {
        flexDirection: 'row',
        marginBottom: 16
    },
    placeholderCard: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        padding: 16
    },
    placeholderText: {
        color: '#666',
        fontSize: 13,
        fontStyle: 'italic'
    },
    sectionTitle: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginTop: 16,
        marginBottom: 8,
        textTransform: 'uppercase'
    },
    title: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600'
    },
    totalCard: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 14,
        marginBottom: 16,
        padding: 24
    },
    totalLabel: {
        color: '#888',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase'
    },
    totalSubvalue: {
        color: '#888',
        fontSize: 13,
        marginTop: 4
    },
    totalValue: {
        color: '#4caf50',
        fontSize: 44,
        fontWeight: '700',
        marginTop: 4
    }
});

export default InterpreterEarningsScreen;
