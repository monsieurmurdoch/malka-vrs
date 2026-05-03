/**
 * Whitelabel feature flag utilities.
 *
 * Reads from window.__WHITELABEL__ injected by whitelabel-runtime.js
 * (generated at build time by scripts/whitelabel-prebuild.js).
 */

import { APP_TYPE, FEATURES, type AppType, type FeatureKey } from './constants';
import { getPersistentJson } from '../../vrs-auth/storage';
import { NativeModules, Platform } from 'react-native';
import malkaConfig from '../../../../whitelabel/malka.json';
import malkaVriConfig from '../../../../whitelabel/malkavri.json';
import mapleConfig from '../../../../whitelabel/maple.json';

type RuntimeWhitelabelConfig = {
    tenantId?: string;
    appName?: string;
    providerName?: string;
    tagline?: string;
    description?: string;
    supportUrl?: string;
    domains?: Record<string, string | undefined>;
    theme?: Record<string, string | undefined>;
    features?: Record<string, any>;
    assets?: Record<string, any>;
    operations?: Record<string, any>;
};

const STATIC_TENANTS: Record<string, any> = {
    malka: malkaConfig,
    malkavri: malkaVriConfig,
    maple: mapleConfig
};

function getGlobalWhitelabel(): RuntimeWhitelabelConfig | undefined {
    try {
        const globalScope = typeof globalThis !== 'undefined' ? globalThis as any : undefined;

        return globalScope?.window?.__WHITELABEL__ || globalScope?.__WHITELABEL__;
    } catch {
        return undefined;
    }
}

function getBuildTenantId(): string | undefined {
    try {
        const env = (globalThis as any)?.process?.env;

        return env?.TENANT || env?.VRS_TENANT || env?.EXPO_PUBLIC_TENANT || getNativeTenantId();
    } catch {
        return getNativeTenantId();
    }
}

function getNativeTenantId(): string | undefined {
    if (Platform.OS === 'web') {
        return undefined;
    }

    const appName = String(NativeModules?.AppInfo?.name || '').toLowerCase();

    if (appName.includes('maple')) {
        return 'maple';
    }

    if (appName.includes('vri')) {
        return 'malkavri';
    }

    if (appName.includes('vrs') || appName.includes('malka')) {
        return 'malka';
    }

    return undefined;
}

function flattenFeatures(features: Record<string, any> = {}) {
    const flattened: Record<string, any> = {};

    for (const [ key, value ] of Object.entries(features)) {
        if (key === 'languages' && value && typeof value === 'object') {
            flattened.languages = value.enabled;
            flattened.defaultLanguage = value.default;
        } else if (value && typeof value === 'object' && 'enabled' in value) {
            flattened[key] = value.enabled;
        } else {
            flattened[key] = value;
        }
    }

    return flattened;
}

function normalizeConfig(config: any): RuntimeWhitelabelConfig | undefined {
    if (!config) {
        return undefined;
    }

    if (config.appName) {
        return config;
    }

    return {
        tenantId: config.tenantId,
        appName: config.brand?.appName,
        providerName: config.brand?.providerName,
        tagline: config.brand?.tagline,
        description: config.brand?.description,
        supportUrl: config.brand?.supportUrl,
        domains: config.domains || {},
        theme: config.theme || {},
        features: flattenFeatures(config.features || {}),
        assets: config.assets || {},
        operations: config.operations || {}
    };
}

function getStaticTenantConfig(): RuntimeWhitelabelConfig {
    const tenantId = getPersistentJson<{ tenantId?: string }>('vrs_tenant_config')?.tenantId
        || getPersistentJson<{ tenantId?: string }>('vrs_user_info')?.tenantId
        || getBuildTenantId()
        || 'malka';

    return normalizeConfig(STATIC_TENANTS[tenantId] || STATIC_TENANTS.malka) || {};
}

/**
 * Get the full whitelabel config object.
 */
export function getWhitelabelConfig() {
    return normalizeConfig(getGlobalWhitelabel())
        || normalizeConfig(getPersistentJson<RuntimeWhitelabelConfig>('vrs_tenant_config'))
        || getStaticTenantConfig();
}

/**
 * Check whether a specific feature is enabled for the current tenant.
 *
 * Returns true (enabled) by default if no whitelabel config is present
 * or if the feature key is not defined in the config.
 */
export function isFeatureEnabled(feature: FeatureKey | string): boolean {
    const wl = getWhitelabelConfig();
    if (!wl?.features) {
        return true; // default: all features enabled
    }
    const val = wl.features[feature as keyof typeof wl.features];
    if (typeof val === 'boolean') {
        return val;
    }
    return true; // unknown features default to enabled
}

/**
 * Get the list of languages enabled for the current tenant.
 *
 * Falls back to a sensible default if no config is present.
 */
export function getEnabledLanguages(): string[] {
    const wl = getWhitelabelConfig();
    if (wl?.features?.languages && Array.isArray(wl.features.languages)) {
        return wl.features.languages;
    }
    return [ 'en', 'asl', 'fr', 'lsq' ];
}

/**
 * Get the default language for the current tenant.
 */
export function getDefaultLanguage(): string {
    const wl = getWhitelabelConfig();
    if (wl?.features?.defaultLanguage) {
        return wl.features.defaultLanguage;
    }
    return 'en';
}

/**
 * Get the tenant's app name.
 */
export function getAppName(): string {
    const wl = getWhitelabelConfig();
    if (wl?.appName) {
        return wl.appName;
    }
    return 'MalkaVRS';
}

/**
 * Get the tenant's logo URL (white variant for dark backgrounds).
 */
export function getLogoWhiteUrl(): string {
    const wl = getWhitelabelConfig();
    if (wl?.assets?.logoWhite) {
        return wl.assets.logoWhite;
    }
    return 'images/malka-logo-white.png';
}

/**
 * Get the tenant's primary logo URL.
 */
export function getLogoUrl(): string {
    const wl = getWhitelabelConfig();
    if (wl?.assets?.logo) {
        return wl.assets.logo;
    }
    return 'images/malka-logo.png';
}

/**
 * Check if the current tenant is not "malka" (i.e., is a whitelabeled tenant).
 */
export function isWhitelabeled(): boolean {
    const wl = getWhitelabelConfig();
    return wl ? wl.tenantId !== 'malka' : false;
}

/**
 * Get the current tenant ID.
 */
export function getTenantId(): string {
    return getWhitelabelConfig()?.tenantId ?? 'malka';
}

/**
 * Get the app type (VRS or VRI) for the current build.
 *
 * Determined by the `operations.appType` field in the tenant config.
 * Falls back to checking `features.vrs` vs `features.vri`.
 */
export function getAppType(): AppType {
    const wl = getWhitelabelConfig();

    // Explicit appType from tenant config
    if (wl?.operations?.appType) {
        return wl.operations.appType as AppType;
    }

    // Fallback: infer from default service modes
    const modes = wl?.operations?.defaultServiceModes;
    if (modes?.includes('vrs')) {
        return APP_TYPE.VRS;
    }

    return APP_TYPE.VRI;
}

/**
 * Whether this build is a VRS app (MalkaVRS).
 */
export function isVrsApp(): boolean {
    return getAppType() === APP_TYPE.VRS;
}

/**
 * Whether this build is a VRI app (MalkaVRI or MapleVRI).
 */
export function isVriApp(): boolean {
    return getAppType() === APP_TYPE.VRI;
}
