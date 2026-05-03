/**
 * Mobile Login Screen.
 *
 * Tenant-aware production login that routes to the correct home screen after auth.
 */

import React, { useCallback, useState } from 'react';
import {
    Image,
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
import { queueService } from '../../../../interpreter-queue/InterpreterQueueService';
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

function getDemoCredentials(tenantId: string, isVRI: boolean) {
    if (tenantId === 'maple') {
        return {
            email: 'vri.client@maplecomm.example',
            label: 'Use Maple demo account',
            password: 'Client123!'
        };
    }

    if (isVRI) {
        return {
            email: 'nataly.malka@gmail.com',
            label: 'Use MalkaVRI demo account',
            password: 'demo123'
        };
    }

    return {
        email: 'nataly.malka@gmail.com',
        label: 'Use MalkaVRS demo account',
        password: 'demo123'
    };
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
    const theme = getWhitelabelConfig()?.theme || {};
    const isVRI = isVriApp();
    const isMaple = tenantId === 'maple';
    const serviceBadge = isVRI ? 'VRI' : 'VRS';
    const logoSource = isMaple
        ? require('../../../../../../images/maple-logo-original.png')
        : require('../../../../../../images/malka-logo-white.png');
    const badgeColor = isMaple
        ? theme.primary || '#E00000'
        : theme.accent || '#F47D22';

    const [ email, setEmail ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ loading, setLoading ] = useState(false );
    const [ error, setError ] = useState('');
    const [ showPassword, setShowPassword ] = useState(false);
    const demoCredentials = getDemoCredentials(tenantId, isVRI);

    const finishLogin = useCallback((token: string, rawUser: AuthUser, fallbackEmail?: string) => {
        const now = Date.now();
        const userRole = 'client';
        const expiresAt = getTokenExpiry(token);
        const user = {
            ...rawUser,
            role: userRole,
            name: rawUser.name || fallbackEmail?.split('@')[0],
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
        setPersistentItem('vrs_client_auth', 'true');
        setPersistentItem('vrs_interpreter_auth', 'false');
        setPersistentItem('vrs_user_info', JSON.stringify(user));
        setPersistentItem('vrs_tenant_config', JSON.stringify(getWhitelabelConfig()));
        setSecureItem('vrs_auth_token', JSON.stringify(authToken));
        queueService.reconnect();

        navigateRoot(isVRI ? screen.vri.console : screen.vrs.home);
    }, [ isVRI, tenantId ]);

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
            const response = await apiClient.post<LoginResponse>('/api/auth/client/login', {
                email: trimmedEmail,
                password: trimmedPassword
            });

            if (response.error || !response.data?.token || !response.data?.user) {
                setError(response.error || response.data?.error || 'Sign in failed');

                return;
            }

            if (response.data.user.role === 'interpreter') {
                setError('Use a client account for this app');

                return;
            }

            finishLogin(response.data.token, response.data.user, trimmedEmail);
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, [ email, password, finishLogin ]);

    return (
        <SafeAreaView style = { [ styles.container, isMaple && styles.mapleContainer ] }>
            <KeyboardAvoidingView
                behavior = { Platform.OS === 'ios' ? 'padding' : 'height' }
                style = { [ styles.inner, isMaple && styles.mapleInner ] }>
                <View style = { [ styles.authCard, isMaple && styles.mapleAuthCard ] }>
                    {/* Brand Header */}
                    <View style = { [ styles.header, isMaple && styles.mapleHeader ] }>
                        <View style = { isMaple ? styles.mapleLogoPlate : undefined }>
                            <Image
                                accessibilityLabel = { `${appName} logo` }
                                resizeMode = 'contain'
                                source = { logoSource }
                                style = { [ styles.logo, isMaple && styles.mapleLogo ] } />
                        </View>
                        { !isMaple && (
                            <Text style = { [ styles.logoBadge, { color: badgeColor } ] }>
                                { serviceBadge }
                            </Text>
                        ) }
                    </View>

                    {/* Login Form */}
                    <View style = { [ styles.form, isMaple && styles.mapleForm ] }>
                        <Text style = { styles.prompt }>
                            { isVRI ? 'Sign in to request an interpreter' : 'Sign in to make video relay calls' }
                        </Text>

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
                            placeholder = 'Email'
                            placeholderTextColor = '#7a7a87'
                            returnKeyType = 'next'
                            style = { styles.input }
                            value = { email } />

                        <View style = { styles.passwordWrap }>
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
                                placeholder = 'Password'
                                placeholderTextColor = '#7a7a87'
                                returnKeyType = 'go'
                                secureTextEntry = { !showPassword }
                                style = { [ styles.input, styles.passwordInput ] }
                                value = { password } />
                            <TouchableOpacity
                                accessibilityLabel = { showPassword ? 'Hide password' : 'Show password' }
                                onPress = { () => setShowPassword(!showPassword) }
                                style = { styles.showPasswordButton }>
                                <Text style = { styles.showPasswordText }>
                                    { showPassword ? 'Hide' : 'Show' }
                                </Text>
                            </TouchableOpacity>
                        </View>

                        { error ? <Text style = { [ styles.errorText, isMaple && styles.mapleErrorText ] }>{ error }</Text> : null }

                        <TouchableOpacity
                            accessibilityLabel = 'Sign in'
                            disabled = { loading || !email.trim() || !password.trim() }
                            onPress = { handleLogin }
                            style = { [
                                styles.loginButton,
                                isMaple && styles.mapleLoginButton,
                                (loading || !email.trim() || !password.trim()) && styles.loginButtonDisabled,
                                isMaple && (loading || !email.trim() || !password.trim()) && styles.mapleLoginButtonDisabled
                            ] }>
                            <Text style = { [ styles.loginButtonText, isMaple && styles.mapleLoginButtonText ] }>
                                { loading ? 'Signing in...' : 'Sign In' }
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            accessibilityLabel = { demoCredentials.label }
                            disabled = { loading }
                            onPress = { () => {
                                setEmail(demoCredentials.email);
                                setPassword(demoCredentials.password);
                                setError('');
                            } }
                            style = { [ styles.demoButton, isMaple && styles.mapleDemoButton ] }>
                            <Text style = { styles.demoButtonText }>
                                { demoCredentials.label }
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            accessibilityLabel = 'Reset password'
                            onPress = { () => navigateRoot(screen.auth.resetPassword) }
                            style = { styles.forgotPassword }>
                            <Text style = { [ styles.forgotPasswordText, isMaple && styles.mapleForgotPasswordText ] }>
                                Forgot password?
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    authCard: {
        flex: 1
    },
    container: {
        backgroundColor: '#050508',
        flex: 1
    },
    demoButton: {
        alignItems: 'center',
        borderColor: '#30364f',
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        marginTop: 12,
        minHeight: 52
    },
    demoButtonText: {
        color: '#f7f7fa',
        fontSize: 15,
        fontWeight: '700'
    },
    errorText: {
        color: '#d32f2f',
        fontSize: 13,
        marginBottom: 8
    },
    form: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingHorizontal: 32,
        paddingTop: 48
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
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        paddingTop: 80
    },
    inner: {
        flex: 1
    },
    input: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        color: '#111111',
        fontSize: 16,
        marginBottom: 14,
        minHeight: 56,
        paddingHorizontal: 18
    },
    loginButton: {
        alignItems: 'center',
        backgroundColor: '#1865f2',
        borderRadius: 12,
        marginTop: 10,
        minHeight: 58,
        justifyContent: 'center'
    },
    loginButtonDisabled: {
        backgroundColor: '#1d2550'
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700'
    },
    logo: {
        height: 92,
        width: 220
    },
    logoBadge: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 1.5
    },
    mapleAuthCard: {
        backgroundColor: '#E00000',
        borderColor: 'rgba(255, 255, 255, 0.28)',
        borderRadius: 24,
        borderWidth: 1,
        elevation: 8,
        flex: 0,
        marginHorizontal: 18,
        overflow: 'hidden',
        shadowColor: '#450000',
        shadowOffset: {
            height: 18,
            width: 0
        },
        shadowOpacity: 0.18,
        shadowRadius: 28
    },
    mapleContainer: {
        backgroundColor: '#fff7f7'
    },
    mapleForm: {
        flex: 0,
        paddingBottom: 30,
        paddingHorizontal: 24,
        paddingTop: 28
    },
    mapleHeader: {
        flexDirection: 'column',
        gap: 0,
        paddingHorizontal: 24,
        paddingTop: 28
    },
    mapleInner: {
        backgroundColor: '#fff7f7',
        justifyContent: 'center'
    },
    mapleDemoButton: {
        borderColor: 'rgba(255, 255, 255, 0.36)'
    },
    mapleErrorText: {
        color: '#fff',
        fontWeight: '700'
    },
    mapleForgotPasswordText: {
        color: '#fff'
    },
    mapleLoginButton: {
        backgroundColor: '#fff'
    },
    mapleLoginButtonDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.52)'
    },
    mapleLoginButtonText: {
        color: '#A90000'
    },
    mapleLogo: {
        height: 72,
        width: '100%'
    },
    mapleLogoPlate: {
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: '#fff',
        borderRadius: 8,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        shadowColor: '#450000',
        shadowOffset: {
            height: 8,
            width: 0
        },
        shadowOpacity: 0.18,
        shadowRadius: 18
    },
    passwordInput: {
        marginBottom: 0,
        paddingRight: 86
    },
    passwordWrap: {
        marginBottom: 8,
        position: 'relative'
    },
    prompt: {
        color: '#f7f7fa',
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 24,
        textAlign: 'center'
    },
    showPasswordButton: {
        alignItems: 'center',
        bottom: 0,
        justifyContent: 'center',
        paddingHorizontal: 18,
        position: 'absolute',
        right: 0,
        top: 0
    },
    showPasswordText: {
        color: '#1865f2',
        fontSize: 15,
        fontWeight: '700'
    }
});

export default MobileLoginScreen;
