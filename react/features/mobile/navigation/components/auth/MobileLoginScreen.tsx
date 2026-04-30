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
    const [ orgCode, setOrgCode ] = useState('');
    const [ loading, setLoading ] = useState(false );

    const handleLogin = useCallback(() => {
        const trimmedName = name.trim();

        if (!trimmedName) {
            return;
        }

        setLoading(true);

        const userId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();
        const role = 'client';
        const serviceMode = isVRI ? 'vri' : 'vrs';

        const user = {
            id: userId,
            role,
            name: trimmedName,
            tenantId,
            serviceModes: [ serviceMode ],
            isAuthenticated: true,
            authenticatedAt: now,
            expiresAt: now + 4 * 60 * 60 * 1000 // 4 hours
        };

        setPersistentItem('vrs_user_role', role);
        setPersistentItem('vrs_client_auth', 'true');
        setPersistentItem('vrs_user_info', JSON.stringify(user));

        // Navigate to the correct home screen for this tenant
        const homeScreen = isVRI ? screen.vri.console : screen.vrs.home;

        navigateRoot(homeScreen);
        setLoading(false);
    }, [ name, orgCode, tenantId, isVRI, dispatch ]);

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
                    <Text style = { styles.label }>Your Name</Text>
                    <TextInput
                        autoCapitalize = 'words'
                        autoCorrect = { false }
                        editable = { !loading }
                        onChangeText = { setName }
                        placeholder = 'Enter your name'
                        placeholderTextColor = '#666'
                        returnKeyType = { isVRI ? 'next' : 'go' }
                        style = { styles.input }
                        value = { name } />

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
                        disabled = { loading || !name.trim() }
                        onPress = { handleLogin }
                        style = { [
                            styles.loginButton,
                            (!name.trim() || loading) && styles.loginButtonDisabled
                        ] }>
                        <Text style = { styles.loginButtonText }>
                            { loading ? 'Signing in...' : 'Continue' }
                        </Text>
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
    }
});

export default MobileLoginScreen;
