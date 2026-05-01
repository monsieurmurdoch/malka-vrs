/**
 * Deep linking configuration for React Navigation.
 *
 * Defines URL schemes and path mappings so that external links
 * can navigate directly to specific screens in the mobile app.
 *
 * Supported schemes (per tenant):
 *   - malkavrs://  (Malka VRS)
 *   - malkavri://  (Malka VRI)
 *   - maplevri://  (Maple VRI)
 *
 * Supported paths:
 *   - /call/{roomName}     → Join conference room
 *   - /voicemail           → Voicemail inbox
 *   - /contacts            → Contacts list
 *   - /history             → Call history
 *   - /interpreter/home    → Interpreter home
 *   - /interpreter/request → Interpreter incoming request
 */

import { LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { screen } from './routes';

type RootStackParamList = Record<string, any>;

/**
 * Tenant-specific URL schemes.
 * The whitelabel-prebuild script should set the active scheme
 * per tenant build.
 */
export const TENANT_SCHEMES: Record<string, string> = {
    malka: 'malkavrs',
    malkavri: 'malkavri',
    maple: 'maplevri'
};

/**
 * Returns the active URL scheme for the current tenant build.
 * Falls back to 'malkavrs' if tenant is not determined.
 */
function getActiveScheme(): string {
    // On native, the scheme is baked into the build via whitelabel-prebuild.
    // On web, deep linking is handled by URL paths, not schemes.
    // This default works for development builds.
    return 'malkavrs';
}

/**
 * React Navigation linking configuration.
 *
 * Wire this into the NavigationContainer's `linking` prop:
 *
 *   <NavigationContainer linking={deepLinkConfig} ...>
 */
export const deepLinkConfig: LinkingOptions<RootStackParamList> = {
    prefixes: [
        `${getActiveScheme()}://`,
        'https://vrs.malkacomm.com',
        'https://vri.malkacomm.com',
        'https://vri.maplecomm.ca'
    ],
    config: {
        screens: {
            // Auth
            [screen.auth.login]: 'login',

            // Client VRS
            [screen.vrs.home]: 'home',
            [screen.vrs.dialPad]: 'dial',
            [screen.vrs.contacts]: 'contacts',
            [screen.vrs.contactDetail]: 'contacts/:contactId',
            [screen.vrs.callHistory]: 'history',
            [screen.vrs.voicemail]: 'voicemail',

            // Client VRI
            [screen.vri.console]: 'vri',
            [screen.vri.settings]: 'vri/settings',
            [screen.vri.usage]: 'vri/usage',

            // Interpreter
            [screen.interpreter.home]: 'interpreter/home',
            [screen.interpreter.settings]: 'interpreter/settings',
            [screen.interpreter.earnings]: 'interpreter/earnings',

            // Conference
            [screen.conference.root]: 'call/:roomName',
            [screen.preJoin]: 'prejoin',
            [screen.connecting]: 'connecting'
        }
    }
};
