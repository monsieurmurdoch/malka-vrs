/**
 * VRS Dial Pad Screen.
 *
 * Phone-style dial pad for placing VRS calls through an interpreter.
 * User dials a hearing party's number, system connects them via interpreter.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { isFeatureEnabled } from '../../../../base/whitelabel/functions';
import { FEATURES } from '../../../../base/whitelabel/constants';
import { queueService } from '../../../../interpreter-queue/InterpreterQueueService';
import { getPersistentJson } from '../../../../vrs-auth/storage';
import { mobileLog } from '../../logging';
import { CallRecord } from '../../../types';

const DIGITS = [
    [ '1', '' ], [ '2', 'ABC' ], [ '3', 'DEF' ],
    [ '4', 'GHI' ], [ '5', 'JKL' ], [ '6', 'MNO' ],
    [ '7', 'PQRS' ], [ '8', 'TUV' ], [ '9', 'WXYZ' ],
    [ '*', '' ], [ '0', '+' ], [ '#', '' ]
];

const formatPhone = (digits: string) => {
    const clean = digits.replace(/[^0-9*#]/g, '');
    if (clean.length <= 3) {
        return clean;
    }
    if (clean.length <= 6) {
        return `(${ clean.slice(0, 3) }) ${ clean.slice(3) }`;
    }

    return `(${ clean.slice(0, 3) }) ${ clean.slice(3, 6) }-${ clean.slice(6, 10) }`;
};

const DialPadScreen = () => {
    const dispatch = useDispatch();
    const canDialOut = isFeatureEnabled(FEATURES.PHONE_DIAL_OUT);
    const [ digits, setDigits ] = useState('');
    const [ callStatus, setCallStatus ] = useState<string | null>(null);

    // Last 3 recent calls for quick redial
    const recentCalls = useMemo(() => {
        const history = getPersistentJson<CallRecord[]>('vrs_call_history') || [];

        return history.slice(0, 3);
    }, []);

    // Listen for P2P call status updates from the queue service
    useEffect(() => {
        const onRinging = () => setCallStatus('Ringing...');
        const onFailed = (data: { message?: string }) => {
            setCallStatus(data.message || 'Call failed');
            setTimeout(() => setCallStatus(null), 3000);
        };
        const onOffline = (data: { calleeName?: string }) => {
            setCallStatus(`${data.calleeName || 'Contact'} is offline`);
            setTimeout(() => setCallStatus(null), 3000);
        };
        const onDnd = (data: { calleeName?: string }) => {
            setCallStatus(`${data.calleeName || 'Contact'} has DND on`);
            setTimeout(() => setCallStatus(null), 3000);
        };

        queueService.on('p2pRinging', onRinging);
        queueService.on('p2pCallFailed', onFailed);
        queueService.on('p2pTargetOffline', onOffline);
        queueService.on('p2pTargetDnd', onDnd);

        return () => {
            queueService.off('p2pRinging', onRinging);
            queueService.off('p2pCallFailed', onFailed);
            queueService.off('p2pTargetOffline', onOffline);
            queueService.off('p2pTargetDnd', onDnd);
        };
    }, []);

    const handleRecentCall = useCallback((call: CallRecord) => {
        if (!call.phoneNumber) {
            return;
        }

        setCallStatus('Calling...');
        queueService.sendP2PCall(call.phoneNumber);
        mobileLog('info', 'dial_redial_p2p', { phoneNumber: call.phoneNumber, contactName: call.contactName });
    }, []);

    const handleDigit = useCallback((d: string) => {
        setDigits(prev => prev + d);
    }, []);

    const handleDelete = useCallback(() => {
        setDigits(prev => prev.slice(0, -1));
    }, []);

    const handleCall = useCallback(() => {
        if (!digits || !canDialOut) {
            return;
        }

        const clean = digits.replace(/[^0-9+]/g, '');

        if (!clean) {
            return;
        }

        // Initiate P2P call through WebSocket — backend looks up callee by
        // phone number, creates a room, and notifies the callee.
        // The middleware auto-enters the room on `p2p_ringing`.
        setCallStatus('Calling...');
        queueService.sendP2PCall(clean);
        mobileLog('info', 'dial_p2p_call', { phoneNumber: clean });
    }, [ digits, canDialOut ]);

    return (
        <SafeAreaView style = { styles.container }>
            <ScrollView contentContainerStyle = { styles.scrollContent }>
                {/* Display */}
                <View style = { styles.display }>
                    <Text style = { styles.phoneNumber }>
                        { digits ? formatPhone(digits) : 'Enter number' }
                    </Text>
                    { !canDialOut && (
                        <Text style = { styles.restricted }>
                            Phone dial-out not available for this account
                        </Text>
                    ) }
                    { callStatus && (
                        <Text style = { styles.callStatus }>
                            { callStatus }
                        </Text>
                    ) }
                </View>

                {/* Recent Calls */}
                { recentCalls.length > 0 && (
                    <View style = { styles.recentSection }>
                        <Text style = { styles.recentTitle }>Recent</Text>
                        { recentCalls.map(call => (
                            <TouchableOpacity
                                accessibilityLabel = { `Redial ${call.contactName}` }
                                key = { call.id }
                                onPress = { () => handleRecentCall(call) }
                                style = { styles.recentRow }>
                                <Text style = { styles.recentName }>
                                    { call.contactName }
                                </Text>
                                <Text style = { styles.recentPhone }>
                                    { call.phoneNumber || 'VRS call' }
                                </Text>
                            </TouchableOpacity>
                        )) }
                    </View>
                ) }

            {/* Keypad */}
            <View style = { styles.keypad }>
                { DIGITS.map(([ digit, letters ]) => (
                    <TouchableOpacity
                        accessibilityLabel = { `Dial ${digit}` }
                        key = { digit }
                        onPress = { () => handleDigit(digit) }
                        style = { styles.key }>
                        <Text style = { styles.keyDigit }>{ digit }</Text>
                        <Text style = { styles.keyLetters }>{ letters }</Text>
                    </TouchableOpacity>
                )) }
            </View>

            {/* Action Row */}
            <View style = { styles.actionRow }>
                <View style = { styles.actionSpacer } />
                <TouchableOpacity
                    accessibilityLabel = 'Place call'
                    disabled = { !digits || !canDialOut }
                    onPress = { handleCall }
                    style = { [
                        styles.callButton,
                        (!digits || !canDialOut) && styles.callButtonDisabled
                    ] }>
                    <Text style = { styles.callIcon }>{'\u{1F4DE}'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    accessibilityLabel = 'Delete digit'
                    disabled = { !digits }
                    onPress = { handleDelete }
                    style = { styles.deleteButton }>
                    <Text style = { styles.deleteText }>{'\u{232B}'}</Text>
                </TouchableOpacity>
            </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    actionRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 24,
        paddingHorizontal: 36
    },
    callButton: {
        alignItems: 'center',
        backgroundColor: '#4caf50',
        borderRadius: 32,
        height: 64,
        justifyContent: 'center',
        width: 64
    },
    callButtonDisabled: {
        backgroundColor: '#2a4a2a'
    },
    callIcon: {
        fontSize: 28
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    callStatus: {
        color: '#2979ff',
        fontSize: 14,
        marginTop: 8
    },
    deleteButton: {
        alignItems: 'center',
        height: 64,
        justifyContent: 'center',
        width: 64
    },
    deleteText: {
        color: '#888',
        fontSize: 28
    },
    display: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'flex-end',
        paddingBottom: 20,
        paddingHorizontal: 20
    },
    key: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 28,
        height: 56,
        justifyContent: 'center',
        margin: 8,
        width: 56
    },
    keyDigit: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '500'
    },
    keyLetters: {
        color: '#666',
        fontSize: 9,
        fontWeight: '600',
        letterSpacing: 1.5
    },
    keypad: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        paddingHorizontal: 24
    },
    phoneNumber: {
        color: '#fff',
        fontSize: 32,
        fontWeight: '300',
        letterSpacing: 1
    },
    restricted: {
        color: '#ff9800',
        fontSize: 12,
        marginTop: 8
    },
    recentName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500'
    },
    recentPhone: {
        color: '#888',
        fontSize: 12,
        marginTop: 2
    },
    recentRow: {
        borderBottomColor: '#1a1a2e',
        borderBottomWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 10
    },
    recentSection: {
        marginBottom: 8,
        marginHorizontal: 16
    },
    recentTitle: {
        color: '#888',
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 4,
        textTransform: 'uppercase'
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 8
    },
    actionSpacer: {
        width: 64
    }
});

export default DialPadScreen;
