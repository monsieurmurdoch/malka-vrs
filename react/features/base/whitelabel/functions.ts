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
import malkaStagingConfig from '../../../../whitelabel/malka-staging.json';
import malkaVriConfig from '../../../../whitelabel/malkavri.json';
import malkaVriStagingConfig from '../../../../whitelabel/malkavri-staging.json';
import mapleConfig from '../../../../whitelabel/maple.json';
import mapleStagingConfig from '../../../../whitelabel/maple-staging.json';

type UnknownRecord = Record<string, unknown>;
type GlobalTenantScope = typeof globalThis & {
    __WHITELABEL__?: unknown;
    process?: {
        env?: Record<string, string | undefined>;
    };
    window?: {
        __WHITELABEL__?: unknown;
    };
};

type RuntimeWhitelabelConfig = {
    tenantId?: string;
    appName?: string;
    providerName?: string;
    tagline?: string;
    description?: string;
    supportUrl?: string;
    domains?: Record<string, string | undefined>;
    theme?: Record<string, string | undefined>;
    features?: Record<string, unknown>;
    assets?: Record<string, unknown>;
    operations?: Record<string, unknown>;
};

const STATIC_TENANTS: Record<string, unknown> = {
    malka: malkaConfig,
    'malka-staging': malkaStagingConfig,
    malkavri: malkaVriConfig,
    'malkavri-staging': malkaVriStagingConfig,
    maple: mapleConfig,
    'maple-staging': mapleStagingConfig
};

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getGlobalWhitelabel(): RuntimeWhitelabelConfig | undefined {
    try {
        const globalScope = typeof globalThis !== 'undefined'
            ? globalThis as GlobalTenantScope
            : undefined;

        return normalizeConfig(globalScope?.window?.__WHITELABEL__ || globalScope?.__WHITELABEL__);
    } catch {
        return undefined;
    }
}

function getBuildTenantId(): string | undefined {
    try {
        const globalScope = typeof globalThis !== 'undefined'
            ? globalThis as GlobalTenantScope
            : undefined;
        const env = globalScope?.process?.env;

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

function flattenFeatures(features: Record<string, unknown> = {}) {
    const flattened: Record<string, unknown> = {};

    for (const [ key, value ] of Object.entries(features)) {
        if (key === 'languages' && isRecord(value)) {
            flattened.languages = value.enabled;
            flattened.defaultLanguage = value.default;
        } else if (isRecord(value) && 'enabled' in value) {
            flattened[key] = value.enabled;
        } else {
            flattened[key] = value;
        }
    }

    return flattened;
}

function normalizeConfig(config: unknown): RuntimeWhitelabelConfig | undefined {
    if (!isRecord(config)) {
        return undefined;
    }

    if (typeof config.appName === 'string') {
        return config as RuntimeWhitelabelConfig;
    }

    const brand = isRecord(config.brand) ? config.brand : {};

    return {
        tenantId: typeof config.tenantId === 'string' ? config.tenantId : undefined,
        appName: typeof brand.appName === 'string' ? brand.appName : undefined,
        providerName: typeof brand.providerName === 'string' ? brand.providerName : undefined,
        tagline: typeof brand.tagline === 'string' ? brand.tagline : undefined,
        description: typeof brand.description === 'string' ? brand.description : undefined,
        supportUrl: typeof brand.supportUrl === 'string' ? brand.supportUrl : undefined,
        domains: isRecord(config.domains) ? config.domains as Record<string, string | undefined> : {},
        theme: isRecord(config.theme) ? config.theme as Record<string, string | undefined> : {},
        features: flattenFeatures(isRecord(config.features) ? config.features : {}),
        assets: isRecord(config.assets) ? config.assets : {},
        operations: isRecord(config.operations) ? config.operations : {}
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
export function getWhitelabelConfig(): RuntimeWhitelabelConfig {
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
    const languages = wl?.features?.languages;

    if (Array.isArray(languages)) {
        return languages.filter((language): language is string => typeof language === 'string');
    }

    return [ 'en', 'asl', 'fr', 'lsq' ];
}

/**
 * Get the default language for the current tenant.
 */
export function getDefaultLanguage(): string {
    const wl = getWhitelabelConfig();
    const defaultLanguage = wl?.features?.defaultLanguage;

    if (typeof defaultLanguage === 'string' && defaultLanguage) {
        return defaultLanguage;
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
    const logoWhite = wl?.assets?.logoWhite;

    if (typeof logoWhite === 'string' && logoWhite) {
        return logoWhite;
    }

    return 'images/malka-logo-white.png';
}

/**
 * Get the tenant's primary logo URL.
 */
export function getLogoUrl(): string {
    const wl = getWhitelabelConfig();
    const logo = wl?.assets?.logo;

    if (typeof logo === 'string' && logo) {
        return logo;
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
    if (wl?.operations?.appType === APP_TYPE.VRS || wl?.operations?.appType === APP_TYPE.VRI) {
        return wl.operations.appType;
    }

    // Fallback: infer from default service modes
    const modes = wl?.operations?.defaultServiceModes;
    if (Array.isArray(modes) && modes.includes('vrs')) {
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
