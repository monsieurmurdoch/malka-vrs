/**
 * Network status indicator for mobile screens.
 *
 * Shows a dismissible banner when network connectivity is poor or lost.
 * Wraps a simple check — consumers can pass isConnected and optional
 * reconnecting state from their queue/WebSocket state.
 */

import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

interface NetworkStatusBarProps {
    isConnected: boolean;
    isReconnecting?: boolean;
    onDismiss?: () => void;
}

const NetworkStatusBar = ({ isConnected, isReconnecting, onDismiss }: NetworkStatusBarProps) => {
    if (isConnected) {
        return null;
    }

    return (
        <View style = { styles.banner }>
            <View style = { styles.bannerContent }>
                <View style = { styles.dot } />
                <Text style = { styles.text }>
                    { isReconnecting
                        ? 'Reconnecting to service...'
                        : 'No connection. Some features may be unavailable.' }
                </Text>
            </View>
            { onDismiss && (
                <TouchableOpacity
                    accessibilityLabel = 'Dismiss network warning'
                    onPress = { onDismiss }>
                    <Text style = { styles.dismiss }>Dismiss</Text>
                </TouchableOpacity>
            ) }
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        alignItems: 'center',
        backgroundColor: '#ff9800',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8
    },
    bannerContent: {
        alignItems: 'center',
        flexDirection: 'row',
        flex: 1
    },
    dismiss: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600'
    },
    dot: {
        backgroundColor: '#fff',
        borderRadius: 3,
        height: 6,
        marginRight: 8,
        width: 6
    },
    text: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500'
    }
});

export default NetworkStatusBar;
