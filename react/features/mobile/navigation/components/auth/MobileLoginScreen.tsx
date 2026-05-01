/**
 * Mobile Login Screen.
 *
 * Tenant-aware production login that routes to the correct home screen after auth.
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

import { getAppName, getTenantId, getWhitelabelConfig, isVriApp } from '../../../../base/whitelabel/functions';
import { apiClient } from '../../../../shared/api-client';
import { setSecureItem } from '../../../../vrs-auth/secureStorage';
import { setPersistentItem } from '../../../../vrs-auth/storage';
import { navigateRoot } from '../../rootNavigationContainerRef';
import { screen } from '../../routes';

interface AuthUser {
    id: string;
    name?: string;
    email?: string;
    role?: 'client' | 'interpreter';
    phoneNumber?: string | null;
    tenantId?: string;
    serviceModes?: string[];
    languages?: string[];
    organization?: string;
}

interface LoginResponse {
    success?: boolean;
    token?: string;
    user?: AuthUser;
    error?: string;
}

function getTokenExpiry(token: string): number {
    const defaultExpiry = Date.now() + 12 * 60 * 60 * 1000;
    const payload = token.split('.')[1];
    const decode = (globalThis as any)?.atob;

    if (!payload || typeof decode !== 'function') {
        return defaultExpiry;
    }

    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(decode(normalized)) as { exp?: number };

        return decoded.exp ? decoded.exp * 1000 : defaultExpiry;
    } catch {
        return defaultExpiry;
    }
}

const MobileLoginScreen = () => {
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

    const handleLogin = useCallback(async () => {
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();

        if (!trimmedEmail || !trimmedPassword) {
            setError('Please enter your email and password');

            return;
        }

        setError('');
        setLoading(true);

        try {
            const endpoint = role === 'interpreter'
                ? '/api/auth/interpreter/login'
                : '/api/auth/client/login';
            const response = await apiClient.post<LoginResponse>(endpoint, {
                email: trimmedEmail,
                password: trimmedPassword,
                organizationCode: orgCode.trim() || undefined
            });

            if (response.error || !response.data?.token || !response.data?.user) {
                setError(response.error || response.data?.error || 'Sign in failed');

                return;
            }

            const now = Date.now();
            const userRole = response.data.user.role || role;
            const expiresAt = getTokenExpiry(response.data.token);
            const user = {
                ...response.data.user,
                role: userRole,
                name: response.data.user.name || name.trim() || trimmedEmail.split('@')[0],
                email: response.data.user.email || trimmedEmail,
                tenantId: response.data.user.tenantId || tenantId,
                serviceModes: response.data.user.serviceModes || [ isVRI ? 'vri' : 'vrs' ],
                isAuthenticated: true,
                authenticatedAt: now,
                expiresAt
            };
            const authToken = {
                token: response.data.token,
                role: userRole,
                userId: user.id,
                name: user.name,
                issuedAt: now,
                expiresAt
            };

            setPersistentItem('vrs_user_role', userRole);
            setPersistentItem('vrs_client_auth', userRole === 'client' ? 'true' : 'false');
            setPersistentItem('vrs_interpreter_auth', userRole === 'interpreter' ? 'true' : 'false');
            setPersistentItem('vrs_user_info', JSON.stringify(user));
            setPersistentItem('vrs_tenant_config', JSON.stringify(getWhitelabelConfig()));
            setSecureItem('vrs_auth_token', JSON.stringify(authToken));

            if (userRole === 'interpreter') {
                navigateRoot(screen.interpreter.home);
            } else {
                navigateRoot(isVRI ? screen.vri.console : screen.vrs.home);
            }
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, [ name, email, password, orgCode, tenantId, isVRI, role ]);

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

                    <Text style = { styles.label }>Display Name</Text>
                    <TextInput
                        accessibilityLabel = 'Display name'
                        autoCapitalize = 'words'
                        autoCorrect = { false }
                        editable = { !loading }
                        onChangeText = { setName }
                        placeholder = 'Optional display name'
                        placeholderTextColor = '#666'
                        returnKeyType = 'next'
                        style = { styles.input }
                        value = { name } />

                    <Text style = { styles.label }>Email</Text>
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
                        returnKeyType = 'next'
                        style = { styles.input }
                        value = { email } />

                    <Text style = { styles.label }>Password</Text>
                    <TextInput
                        accessibilityLabel = 'Password'
                        autoCapitalize = 'none'
                        autoCorrect = { false }
                        editable = { !loading }
                        onChangeText = { text => {
                            setPassword(text);
                            setError('');
                        } }
                        onSubmitEditing = { handleLogin }
                        placeholder = 'Enter password'
                        placeholderTextColor = '#666'
                        returnKeyType = 'go'
                        secureTextEntry
                        style = { styles.input }
                        value = { password } />

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
                        disabled = { loading || !email.trim() || !password.trim() }
                        onPress = { handleLogin }
                        style = { [
                            styles.loginButton,
                            (!email.trim() || !password.trim() || loading) && styles.loginButtonDisabled
                        ] }>
                        <Text style = { styles.loginButtonText }>
                            { loading ? 'Signing in...' : 'Sign In' }
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
