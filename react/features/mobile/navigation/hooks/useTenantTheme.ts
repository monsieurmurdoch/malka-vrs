/**
 * Tenant theme hook for mobile screens.
 *
 * Reads theme colors from the whitelabel config (web) or from
 * AsyncStorage-cached tenant config (native). Falls back to
 * the default Malka dark theme when no config is available.
 */

import { useMemo } from 'react';
import { Platform } from 'react-native';

import { getWhitelabelConfig } from '../../../base/whitelabel/functions';
import { getPersistentJson } from '../../../vrs-auth/storage';

export interface TenantColors {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    surfaceDark: string;
    surfaceMid: string;
    surfaceLight: string;
    textPrimary: string;
    textSecondary: string;
    toolbarBg: string;
}

const DEFAULT_COLORS: TenantColors = {
    primary: '#0D1A38',
    primaryLight: '#16164C',
    primaryDark: '#00003C',
    accent: '#F47D22',
    success: '#89BD0E',
    warning: '#F47D22',
    error: '#CE0F13',
    surfaceDark: '#0f0f23',
    surfaceMid: '#1a1a2e',
    surfaceLight: '#FFFFFF',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    toolbarBg: '#0D1A38'
};

/**
 * Returns tenant-specific theme colors for use in mobile StyleSheet.create.
 *
 * On web: reads from window.__WHITELABEL__.theme.
 * On native: reads from AsyncStorage-cached tenant config (key: vrs_tenant_config).
 * Falls back to Malka default colors.
 */
export function useTenantTheme(): TenantColors {
    return useMemo(() => {
        // Web path: read from window.__WHITELABEL__
        if (Platform.OS === 'web') {
            const wl = getWhitelabelConfig();
            if (wl?.theme) {
                return { ...DEFAULT_COLORS, ...wl.theme };
            }
        }

        // Native path: read cached tenant config
        const cached = getPersistentJson<{ theme?: Partial<TenantColors> }>('vrs_tenant_config');
        if (cached?.theme) {
            return { ...DEFAULT_COLORS, ...cached.theme };
        }

        return DEFAULT_COLORS;
    }, []);
}
