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

type AuthMethod = 'email' | 'phone' | 'sms';

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
    const [ phoneNumber, setPhoneNumber ] = useState('');
    const [ otpCode, setOtpCode ] = useState('');
    const [ orgCode, setOrgCode ] = useState('');
    const [ role, setRole ] = useState<'client' | 'interpreter'>('client');
    const [ authMethod, setAuthMethod ] = useState<AuthMethod>('email');
    const [ loading, setLoading ] = useState(false );
    const [ error, setError ] = useState('');
    const [ otpSent, setOtpSent ] = useState(false);
    const [ showPassword, setShowPassword ] = useState(false);

    const finishLogin = useCallback((token: string, rawUser: AuthUser, fallbackEmail?: string) => {
        const now = Date.now();
        const userRole = rawUser.role || role;
        const expiresAt = getTokenExpiry(token);
        const user = {
            ...rawUser,
            role: userRole,
            name: rawUser.name || name.trim() || fallbackEmail?.split('@')[0] || phoneNumber.trim(),
            email: rawUser.email || fallbackEmail,
            tenantId: rawUser.tenantId || tenantId,
            serviceModes: rawUser.serviceModes || [ isVRI ? 'vri' : 'vrs' ],
            isAuthenticated: true,
            authenticatedAt: now,
            expiresAt
        };
        const authToken = {
            token,
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
    }, [ isVRI, name, phoneNumber, role, tenantId ]);

    const handleLogin = useCallback(async () => {
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();
        const trimmedPhone = phoneNumber.trim();
        const trimmedCode = otpCode.trim();

        if (authMethod === 'email' && (!trimmedEmail || !trimmedPassword)) {
            setError('Please enter your email and password');

            return;
        }

        if (authMethod === 'phone' && (!trimmedPhone || !trimmedPassword)) {
            setError('Please enter your phone number and password');
            return;
        }

        if (authMethod === 'sms' && (!trimmedPhone || !trimmedCode)) {
            setError('Please enter your phone number and verification code');

            return;
        }

        setError('');
        setLoading(true);

        try {
            const endpoint = authMethod === 'phone'
                ? '/api/auth/client/phone-login'
                : authMethod === 'sms'
                    ? '/api/auth/otp/verify'
                    : role === 'interpreter'
                        ? '/api/auth/interpreter/login'
                        : '/api/auth/client/login';
            const payload = authMethod === 'phone'
                ? { phoneNumber: trimmedPhone, password: trimmedPassword }
                : authMethod === 'sms'
                    ? { phoneNumber: trimmedPhone, code: trimmedCode, purpose: 'login' }
                    : {
                        email: trimmedEmail,
                        password: trimmedPassword,
                        organizationCode: orgCode.trim() || undefined
                    };
            const response = await apiClient.post<LoginResponse>(endpoint, payload);

            if (response.error || !response.data?.token || !response.data?.user) {
                setError(response.error || response.data?.error || 'Sign in failed');

                return;
            }

            finishLogin(response.data.token, response.data.user, trimmedEmail);
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, [ authMethod, email, password, phoneNumber, otpCode, orgCode, role, finishLogin ]);

    const handleRequestOtp = useCallback(async () => {
        const trimmedPhone = phoneNumber.trim();

        if (!trimmedPhone) {
            setError('Please enter your phone number');

            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await apiClient.post<{ success?: boolean; expiresIn?: number }>('/api/auth/otp/request', {
                phoneNumber: trimmedPhone,
                purpose: 'login'
            });

            if (response.error) {
                setError(response.error);

                return;
            }

            setOtpSent(true);
        } catch (err: any) {
            setError(err?.message || 'Unable to send verification code');
        } finally {
            setLoading(false);
        }
    }, [ phoneNumber ]);

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
                            onPress = { () => setAuthMethod('email') }
                            style = { [ styles.roleButton, authMethod === 'email' && styles.roleButtonActive ] }>
                            <Text style = { [ styles.roleText, authMethod === 'email' && styles.roleTextActive ] }>
                                Email
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress = { () => {
                                setAuthMethod('phone');
                                setRole('client');
                            } }
                            style = { [ styles.roleButton, authMethod === 'phone' && styles.roleButtonActive ] }>
                            <Text style = { [ styles.roleText, authMethod === 'phone' && styles.roleTextActive ] }>
                                Phone
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress = { () => {
                                setAuthMethod('sms');
                                setRole('client');
                            } }
                            style = { [ styles.roleButton, authMethod === 'sms' && styles.roleButtonActive ] }>
                            <Text style = { [ styles.roleText, authMethod === 'sms' && styles.roleTextActive ] }>
                                SMS
                            </Text>
                        </TouchableOpacity>
                    </View>

                    { authMethod === 'email' && (
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
                    ) }

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

                    { authMethod === 'email' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <Text style = { styles.label }>Phone Number</Text>
                            <TextInput
                                accessibilityLabel = 'Phone number'
                                autoCapitalize = 'none'
                                autoCorrect = { false }
                                editable = { !loading }
                                keyboardType = 'phone-pad'
                                onChangeText = { text => {
                                    setPhoneNumber(text);
                                    setError('');
                                } }
                                placeholder = '+1 555 123 4567'
                                placeholderTextColor = '#666'
                                returnKeyType = 'next'
                                style = { styles.input }
                                value = { phoneNumber } />
                        </>
                    ) }

                    { authMethod === 'sms' ? (
                        <>
                            <TouchableOpacity
                                accessibilityLabel = 'Send verification code'
                                disabled = { loading || !phoneNumber.trim() }
                                onPress = { handleRequestOtp }
                                style = { [ styles.secondaryButton, (loading || !phoneNumber.trim()) && styles.loginButtonDisabled ] }>
                                <Text style = { styles.secondaryButtonText }>
                                    { otpSent ? 'Send Code Again' : 'Send Verification Code' }
                                </Text>
                            </TouchableOpacity>
                            <Text style = { styles.label }>Verification Code</Text>
                            <TextInput
                                accessibilityLabel = 'SMS verification code'
                                editable = { !loading }
                                keyboardType = 'number-pad'
                                maxLength = { 6 }
                                onChangeText = { text => {
                                    setOtpCode(text);
                                    setError('');
                                } }
                                placeholder = '6-digit code'
                                placeholderTextColor = '#666'
                                returnKeyType = 'go'
                                style = { styles.input }
                                value = { otpCode } />
                        </>
                    ) : (
                        <>
                            <View style = { styles.passwordLabelRow }>
                                <Text style = { styles.label }>Password</Text>
                                <TouchableOpacity
                                    accessibilityLabel = { showPassword ? 'Hide password' : 'Show password' }
                                    onPress = { () => setShowPassword(!showPassword) }>
                                    <Text style = { styles.showPasswordText }>
                                        { showPassword ? 'Hide' : 'Show' }
                                    </Text>
                                </TouchableOpacity>
                            </View>
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
                                secureTextEntry = { !showPassword }
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
                        disabled = { loading
                            || (authMethod === 'email' && (!email.trim() || !password.trim()))
                            || (authMethod === 'phone' && (!phoneNumber.trim() || !password.trim()))
                            || (authMethod === 'sms' && (!phoneNumber.trim() || !otpCode.trim())) }
                        onPress = { handleLogin }
                        style = { [
                            styles.loginButton,
                            (loading
                                || (authMethod === 'email' && (!email.trim() || !password.trim()))
                                || (authMethod === 'phone' && (!phoneNumber.trim() || !password.trim()))
                                || (authMethod === 'sms' && (!phoneNumber.trim() || !otpCode.trim()))) && styles.loginButtonDisabled
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
    passwordLabelRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between'
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
    },
    secondaryButton: {
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderColor: '#2979ff',
        borderRadius: 10,
        borderWidth: 1,
        marginBottom: 16,
        padding: 12
    },
    secondaryButtonText: {
        color: '#8ab4ff',
        fontSize: 14,
        fontWeight: '600'
    },
    showPasswordText: {
        color: '#8ab4ff',
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 6
    }
});

export default MobileLoginScreen;
