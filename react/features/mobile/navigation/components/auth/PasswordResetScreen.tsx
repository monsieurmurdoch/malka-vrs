/**
 * Password Reset Screen.
 *
 * Allows users to request a password reset via email.
 * After submitting, shows a confirmation message.
 * Backed by POST /api/auth/reset-password when available.
 */

import React, { useCallback, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

const PasswordResetScreen = () => {
    const [ email, setEmail ] = useState('');
    const [ sent, setSent ] = useState(false);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState('');

    const handleReset = useCallback(() => {
        const trimmed = email.trim();

        if (!trimmed) {
            setError('Please enter your email address');

            return;
        }

        // Basic email format check
        if (!trimmed.includes('@') || !trimmed.includes('.')) {
            setError('Please enter a valid email address');

            return;
        }

        setLoading(true);
        setError('');

        // TODO: Call POST /api/auth/reset-password with { email }
        // const response = await apiClient.post('/api/auth/reset-password', { email });
        // For now, simulate success after a brief delay
        setTimeout(() => {
            setSent(true);
            setLoading(false);
        }, 800);
    }, [ email ]);

    return (
        <SafeAreaView style = { styles.container }>
            <KeyboardAvoidingView
                behavior = { Platform.OS === 'ios' ? 'padding' : 'height' }
                style = { styles.inner }>
                {/* Header */}
                <View style = { styles.header }>
                    <TouchableOpacity onPress = { () => navigateRoot(screen.auth.login) }>
                        <Text style = { styles.backText }>{'<'} Back</Text>
                    </TouchableOpacity>
                </View>

                { sent ? (
                    /* Success State */
                    <View style = { styles.successSection }>
                        <Text style = { styles.successTitle }>Check Your Email</Text>
                        <Text style = { styles.successMessage }>
                            If an account exists for { email }, you will receive a
                            password reset link shortly.
                        </Text>
                        <TouchableOpacity
                            onPress = { () => navigateRoot(screen.auth.login) }
                            style = { styles.backToLoginButton }>
                            <Text style = { styles.backToLoginText }>Back to Sign In</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    /* Form State */
                    <View style = { styles.form }>
                        <Text style = { styles.title }>Reset Password</Text>
                        <Text style = { styles.subtitle }>
                            Enter the email address associated with your account
                            and we will send you a reset link.
                        </Text>

                        <Text style = { styles.label }>Email Address</Text>
                        <TextInput
                            autoCapitalize = 'none'
                            autoCorrect = { false }
                            editable = { !loading }
                            keyboardType = 'email-address'
                            onChangeText = { text => {
                                setEmail(text);
                                setError('');
                            } }
                            placeholder = 'you@example.com'
                            placeholderTextColor = '#666'
                            returnKeyType = 'go'
                            style = { styles.input }
                            value = { email } />

                        { error ? (
                            <Text style = { styles.errorText }>{ error }</Text>
                        ) : null }

                        <TouchableOpacity
                            accessibilityLabel = 'Send reset link'
                            disabled = { loading || !email.trim() }
                            onPress = { handleReset }
                            style = { [
                                styles.resetButton,
                                (!email.trim() || loading) && styles.resetButtonDisabled
                            ] }>
                            <Text style = { styles.resetButtonText }>
                                { loading ? 'Sending...' : 'Send Reset Link' }
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) }
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    backText: {
        color: '#2979ff',
        fontSize: 15
    },
    backToLoginButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 12,
        marginTop: 24,
        padding: 16
    },
    backToLoginText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600'
    },
    container: {
        backgroundColor: '#0a0a1a',
        flex: 1
    },
    errorText: {
        color: '#d32f2f',
        fontSize: 13,
        marginBottom: 12
    },
    form: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 14
    },
    inner: {
        flex: 1
    },
    input: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        marginBottom: 12,
        padding: 14
    },
    label: {
        color: '#aaa',
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 6
    },
    resetButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 12,
        elevation: 3,
        marginTop: 8,
        padding: 16
    },
    resetButtonDisabled: {
        backgroundColor: '#1a1a3e',
        elevation: 0
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600'
    },
    subtitle: {
        color: '#888',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 28
    },
    successMessage: {
        color: '#aaa',
        fontSize: 15,
        lineHeight: 22,
        marginTop: 12,
        textAlign: 'center'
    },
    successSection: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28
    },
    successTitle: {
        color: '#4caf50',
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center'
    },
    title: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8
    }
});

export default PasswordResetScreen;
