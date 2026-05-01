import { NavigationContainer, Theme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text } from 'react-native';
import { connect } from 'react-redux';

import { IReduxState, IStore } from '../../../app/types';
import { isVriApp } from '../../../base/whitelabel/functions';
import DialInSummary from '../../../invite/components/dial-in-summary/native/DialInSummary';
import Prejoin from '../../../prejoin/components/native/Prejoin';
import UnsafeRoomWarning from '../../../prejoin/components/native/UnsafeRoomWarning';
import { isUnsafeRoomWarningEnabled } from '../../../prejoin/functions';
import { clearPersistentItems, getPersistentItem, getPersistentJson, hydratePersistentItems } from '../../../vrs-auth/storage';
// eslint-disable-next-line
// @ts-ignore
import WelcomePage from '../../../welcome/components/WelcomePage';
import { isWelcomePageEnabled } from '../../../welcome/functions';
import Whiteboard from '../../../whiteboard/components/native/Whiteboard';
import { _ROOT_NAVIGATION_READY } from '../actionTypes';
import { deepLinkConfig } from '../linking';
import { rootNavigationRef } from '../rootNavigationContainerRef';
import { screen } from '../routes';
import {
    conferenceNavigationContainerScreenOptions,
    connectingScreenOptions,
    dialInSummaryScreenOptions,
    fullScreenOptions,
    navigationContainerTheme,
    preJoinScreenOptions,
    unsafeMeetingScreenOptions,
    welcomeScreenOptions,
    whiteboardScreenOptions
} from '../screenOptions';

import ConnectingPage from './ConnectingPage';
import ConferenceNavigationContainer
    from './conference/components/ConferenceNavigationContainer';
import VRIConsoleScreen from './vri/VRIConsoleScreen';
import VRISettingsScreen from './vri/VRISettingsScreen';
import VRIUsageScreen from './vri/VRIUsageScreen';
import VRSHomeScreen from './vrs/VRSHomeScreen';
import VoicemailInboxScreen from './vrs/VoicemailInboxScreen';
import MobileLoginScreen from './auth/MobileLoginScreen';
import PasswordResetScreen from './auth/PasswordResetScreen';
import InterpreterHomeScreen from './interpreter/InterpreterHomeScreen';
import InterpreterSettingsScreen from './interpreter/InterpreterSettingsScreen';
import InterpreterEarningsScreen from './interpreter/InterpreterEarningsScreen';
import CallHistoryScreen from './vrs/CallHistoryScreen';
import ContactsScreen from './vrs/ContactsScreen';
import ContactDetailScreen from './vrs/ContactDetailScreen';
import DialPadScreen from './vrs/DialPadScreen';

const RootStack = createStackNavigator();
const AUTH_STORAGE_KEYS = [
    'vrs_client_auth',
    'vrs_interpreter_auth',
    'vrs_auth_token',
    'vrs_user_info',
    'vrs_user_role',
    'vrs_tenant_config'
];

/**
 * Determine the initial route based on auth state and tenant app type.
 *
 * - If the user is already authenticated, route directly to the app home.
 * - If not authenticated, show the login screen.
 * - Falls back to the standard Jitsi welcome/connecting flow for SDK usage.
 */
function getInitialRoute(): string {
    const isAuthed = getPersistentItem('vrs_client_auth') === 'true'
        || getPersistentItem('vrs_auth_token');

    if (isAuthed) {
        // Check if session has expired
        const userInfo = getPersistentJson<{ expiresAt?: number }>('vrs_user_info');
        const expiresAt = userInfo?.expiresAt;

        if (expiresAt && Date.now() > expiresAt) {
            // Session expired — clear auth state and show login
            clearPersistentItems([ 'vrs_client_auth', 'vrs_auth_token', 'vrs_user_info' ]);

            return screen.auth.login;
        }

        const role = getPersistentItem('vrs_user_role');

        if (role === 'interpreter') {
            return screen.interpreter.home;
        }

        return isVriApp() ? screen.vri.console : screen.vrs.home;
    }

    return screen.auth.login;
}

async function getHydratedInitialRoute(isWelcomePageAvailable: boolean): Promise<string> {
    if (!isWelcomePageAvailable) {
        return screen.connecting;
    }

    await hydratePersistentItems(AUTH_STORAGE_KEYS);

    return getInitialRoute();
}


interface IProps {

    /**
     * Redux dispatch function.
     */
    dispatch: IStore['dispatch'];

    /**
    * Is unsafe room warning available?
    */
    isUnsafeRoomWarningAvailable: boolean;

    /**
    * Is welcome page available?
    */
    isWelcomePageAvailable: boolean;
}


const RootNavigationContainer = ({ dispatch, isUnsafeRoomWarningAvailable, isWelcomePageAvailable }: IProps) => {
    const [ initialRouteName, setInitialRouteName ] = useState<string | null>(null);
    const onReady = useCallback(() => {
        dispatch({
            type: _ROOT_NAVIGATION_READY,
            ready: true
        });
    }, [ dispatch ]);

    useEffect(() => {
        let mounted = true;

        getHydratedInitialRoute(isWelcomePageAvailable).then(routeName => {
            if (mounted) {
                setInitialRouteName(routeName);
            }
        });

        return () => {
            mounted = false;
        };
    }, [ isWelcomePageAvailable ]);

    if (!initialRouteName) {
        return (
            <SafeAreaView style = { bootStyles.container }>
                <StatusBar
                    animated = { true }
                    backgroundColor = 'transparent'
                    barStyle = { 'light-content' }
                    translucent = { true } />
                <Text style = { bootStyles.text }>Loading...</Text>
            </SafeAreaView>
        );
    }

    return (
        <NavigationContainer
            independent = { true }
            linking = { deepLinkConfig }
            onReady = { onReady }
            ref = { rootNavigationRef }
            theme = { navigationContainerTheme as Theme }>
            <StatusBar
                animated = { true }
                backgroundColor = 'transparent'
                barStyle = { 'light-content' }
                translucent = { true } />
            <RootStack.Navigator
                initialRouteName = { initialRouteName }>
                {
                    isWelcomePageAvailable
                        && <>
                            <RootStack.Screen // @ts-ignore
                                component = { WelcomePage }
                                name = { screen.welcome.main }
                                options = { welcomeScreenOptions } />
                            <RootStack.Screen

                                // @ts-ignore
                                component = { DialInSummary }
                                name = { screen.dialInSummary }
                                options = { dialInSummaryScreenOptions } />
                        </>
                }
                <RootStack.Screen
                    component = { ConnectingPage }
                    name = { screen.connecting }
                    options = { connectingScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { Whiteboard }
                    name = { screen.conference.whiteboard }
                    options = { whiteboardScreenOptions } />
                <RootStack.Screen
                    component = { Prejoin }
                    name = { screen.preJoin }
                    options = { preJoinScreenOptions } />
                {
                    isUnsafeRoomWarningAvailable
                    && <RootStack.Screen
                        component = { UnsafeRoomWarning }
                        name = { screen.unsafeRoomWarning }
                        options = { unsafeMeetingScreenOptions } />
                }
                <RootStack.Screen
                    component = { ConferenceNavigationContainer }
                    name = { screen.conference.root }
                    options = { conferenceNavigationContainerScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { MobileLoginScreen }
                    name = { screen.auth.login }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { PasswordResetScreen }
                    name = { screen.auth.resetPassword }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { VRSHomeScreen }
                    name = { screen.vrs.home }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { VRIConsoleScreen }
                    name = { screen.vri.console }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { DialPadScreen }
                    name = { screen.vrs.dialPad }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { ContactsScreen }
                    name = { screen.vrs.contacts }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { CallHistoryScreen }
                    name = { screen.vrs.callHistory }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { ContactDetailScreen }
                    name = { screen.vrs.contactDetail }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { VRISettingsScreen }
                    name = { screen.vri.settings }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { VRIUsageScreen }
                    name = { screen.vri.usage }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { VoicemailInboxScreen }
                    name = { screen.vrs.voicemail }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { InterpreterHomeScreen }
                    name = { screen.interpreter.home }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { InterpreterSettingsScreen }
                    name = { screen.interpreter.settings }
                    options = { fullScreenOptions } />
                <RootStack.Screen // @ts-ignore
                    component = { InterpreterEarningsScreen }
                    name = { screen.interpreter.earnings }
                    options = { fullScreenOptions } />
            </RootStack.Navigator>
        </NavigationContainer>
    );
};

const bootStyles = StyleSheet.create({
    container: {
        alignItems: 'center',
        backgroundColor: '#0f0f23',
        flex: 1,
        justifyContent: 'center'
    },
    text: {
        color: '#ffffff',
        fontSize: 15
    }
});

/**
 * Maps part of the Redux store to the props of this component.
 *
 * @param {Object} state - The Redux state.
 * @returns {IProps}
 */
function mapStateToProps(state: IReduxState) {
    return {
        isUnsafeRoomWarningAvailable: isUnsafeRoomWarningEnabled(state),
        isWelcomePageAvailable: isWelcomePageEnabled(state)
    };
}

export default connect(mapStateToProps)(RootNavigationContainer);
