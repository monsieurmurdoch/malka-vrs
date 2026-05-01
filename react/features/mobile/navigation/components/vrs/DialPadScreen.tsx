/**
 * VRS Dial Pad Screen.
 *
 * Phone-style dial pad for placing VRS calls through an interpreter.
 * User dials a hearing party's number, system connects them via interpreter.
 */

import React, { useCallback, useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useDispatch } from 'react-redux';

import { appNavigate } from '../../../../app/actions';
import { isFeatureEnabled } from '../../../../base/whitelabel/functions';
import { FEATURES } from '../../../../base/whitelabel/constants';

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

        // Navigate to a VRS room — the backend will bridge the hearing party via P2P
        const roomName = `vrs-${ Date.now() }`;

        dispatch(appNavigate(roomName, { hidePrejoin: true }));
    }, [ digits, canDialOut, dispatch ]);

    return (
        <SafeAreaView style = { styles.container }>
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
            </View>

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
    actionSpacer: {
        width: 64
    }
});

export default DialPadScreen;
