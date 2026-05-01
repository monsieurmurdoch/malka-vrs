/**
 * Mobile Login Screen.
 *
 * Tenant-aware login that routes to the correct home screen after auth.
 * VRS apps (MalkaVRS): quick name entry, no password required for clients.
 * VRI apps (MalkaVRI, MapleVRI): organization code + name entry.
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
import { useDispatch } from 'react-redux';

import { getAppName, getAppType, getTenantId, isVriApp } from '../../../../base/whitelabel/functions';
import { setPersistentItem, getPersistentJson } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

const MobileLoginScreen = () => {
    const dispatch = useDispatch();
    const appName = getAppName();
    const tenantId = getTenantId();
    const isVRI = isVriApp();

    const [ name, setName ] = useState('');
    const [ email, setEmail ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ orgCode, setOrgCode ] = useState('');
    const [ role, setRole ] = useState<'client' | 'interpreter'>('client');
    const [ loading, setLoading ] = useState(false );
    const [ error, setError ] = useState('');

    const handleLogin = useCallback(() => {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedName && !trimmedEmail) {
            setError('Please enter your name or email');

            return;
        }

        setError('');
        setLoading(true);

        const now = Date.now();
        const serviceMode = isVRI ? 'vri' : 'vrs';
        const userId = `${role}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const user = {
            id: userId,
            role,
            name: trimmedName || trimmedEmail.split('@')[0],
            email: trimmedEmail || undefined,
            tenantId,
            serviceModes: [ serviceMode ],
            languages: role === 'interpreter' ? [ 'ASL', 'English' ] : undefined,
            isAuthenticated: true,
            authenticatedAt: now,
            expiresAt: now + 4 * 60 * 60 * 1000 // 4 hours
        };

        setPersistentItem('vrs_user_role', role);
        setPersistentItem('vrs_client_auth', 'true');
        setPersistentItem('vrs_user_info', JSON.stringify(user));

        // TODO: Replace with real JWT from POST /api/auth/login
        // const response = await apiClient.post('/api/auth/login', { email, password });
        if (trimmedEmail) {
            setPersistentItem('vrs_auth_token', `demo-jwt-${userId}`);
        }

        // Navigate to the correct home screen for this role and tenant
        let homeScreen;

        if (role === 'interpreter') {
            homeScreen = screen.interpreter.home;
        } else {
            homeScreen = isVRI ? screen.vri.console : screen.vrs.home;
        }

        navigateRoot(homeScreen);
        setLoading(false);
    }, [ name, email, password, orgCode, tenantId, isVRI, role, dispatch ]);

    return (
        <SafeAreaView style = { styles.container }>
            <KeyboardAvoidingView
                behavior = { Platform.OS === 'ios' ? 'padding' : 'height' }
                style = { styles.inner }>
                {/* Brand Header */}
                <View style = { styles.header }>
                    <Text style = { styles.appName }>{ appName }</Text>
                    <Text style = { styles.tagline }>
                        { isVRI ? 'Video Remote Interpreting' : 'Video Relay Service' }
                    </Text>
                </View>

                {/* Login Form */}
                <View style = { styles.form }>
                    {/* Role Selector */}
                    <View style = { styles.roleRow }>
                        <TouchableOpacity
                            onPress = { () => setRole('client') }
                            style = { [ styles.roleButton, role === 'client' && styles.roleButtonActive ] }>
                            <Text style = { [ styles.roleText, role === 'client' && styles.roleTextActive ] }>
                                { isVRI ? 'VRI Client' : 'VRS Client' }
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress = { () => setRole('interpreter') }
                            style = { [ styles.roleButton, role === 'interpreter' && styles.roleButtonActive ] }>
                            <Text style = { [ styles.roleText, role === 'interpreter' && styles.roleTextActive ] }>
                                Interpreter
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text style = { styles.label }>Your Name</Text>
                    <TextInput
                        accessibilityLabel = 'Your name'
                        autoCapitalize = 'words'
                        autoCorrect = { false }
                        editable = { !loading }
                        onChangeText = { setName }
                        placeholder = 'Enter your name'
                        placeholderTextColor = '#666'
                        returnKeyType = 'next'
                        style = { styles.input }
                        value = { name } />

                    <Text style = { styles.label }>Email (optional)</Text>
                    <TextInput
                        accessibilityLabel = 'Email address'
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
                        returnKeyType = { password ? 'next' : 'go' }
                        style = { styles.input }
                        value = { email } />

                    { Boolean(email.trim()) && (
                        <>
                            <Text style = { styles.label }>Password</Text>
                            <TextInput
                                accessibilityLabel = 'Password'
                                autoCapitalize = 'none'
                                autoCorrect = { false }
                                editable = { !loading }
                                onChangeText = { setPassword }
                                placeholder = 'Enter password'
                                placeholderTextColor = '#666'
                                returnKeyType = 'go'
                                secureTextEntry
                                style = { styles.input }
                                value = { password } />
                        </>
                    ) }

                    { error ? <Text style = { styles.errorText }>{ error }</Text> : null }

                    { isVRI && (
                        <>
                            <Text style = { styles.label }>Organization Code</Text>
                            <TextInput
                                autoCapitalize = 'characters'
                                autoCorrect = { false }
                                editable = { !loading }
                                onChangeText = { setOrgCode }
                                placeholder = 'Enter organization code'
                                placeholderTextColor = '#666'
                                returnKeyType = 'go'
                                style = { styles.input }
                                value = { orgCode } />
                        </>
                    ) }

                    <TouchableOpacity
                        accessibilityLabel = 'Sign in'
                        disabled = { loading || (!name.trim() && !email.trim()) }
                        onPress = { handleLogin }
                        style = { [
                            styles.loginButton,
                            ((!name.trim() && !email.trim()) || loading) && styles.loginButtonDisabled
                        ] }>
                        <Text style = { styles.loginButtonText }>
                            { loading ? 'Signing in...' : 'Continue' }
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        accessibilityLabel = 'Reset password'
                        onPress = { () => navigateRoot(screen.auth.resetPassword) }
                        style = { styles.forgotPassword }>
                        <Text style = { styles.forgotPasswordText }>Forgot password?</Text>
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style = { styles.footer }>
                    <Text style = { styles.footerText }>
                        By continuing you agree to the { appName } terms of service
                    </Text>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    appName: {
        color: '#ffffff',
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.5
    },
    container: {
        backgroundColor: '#0f0f23',
        flex: 1
    },
    errorText: {
        color: '#d32f2f',
        fontSize: 13,
        marginBottom: 8
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 24,
        paddingTop: 16
    },
    footerText: {
        color: '#555',
        fontSize: 12,
        textAlign: 'center'
    },
    form: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28
    },
    forgotPassword: {
        alignItems: 'center',
        marginTop: 16
    },
    forgotPasswordText: {
        color: '#2979ff',
        fontSize: 14
    },
    header: {
        alignItems: 'center',
        paddingTop: 48
    },
    inner: {
        flex: 1
    },
    input: {
        backgroundColor: '#1a1a2e',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        marginBottom: 20,
        padding: 14
    },
    label: {
        color: '#aaa',
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 6
    },
    loginButton: {
        alignItems: 'center',
        backgroundColor: '#2979ff',
        borderRadius: 12,
        elevation: 3,
        marginTop: 8,
        padding: 16
    },
    loginButtonDisabled: {
        backgroundColor: '#1a1a3e',
        elevation: 0
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600'
    },
    tagline: {
        color: '#888',
        fontSize: 14,
        marginTop: 4
    },
    roleRow: {
        flexDirection: 'row',
        marginBottom: 20
    },
    roleButton: {
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        flex: 1,
        marginRight: 8,
        paddingVertical: 10
    },
    roleButtonActive: {
        backgroundColor: '#2979ff'
    },
    roleText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center'
    },
    roleTextActive: {
        color: '#fff'
    }
});

export default MobileLoginScreen;
