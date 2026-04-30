/**
 * Whitelabel feature flag utilities.
 *
 * Reads from window.__WHITELABEL__ injected by whitelabel-runtime.js
 * (generated at build time by scripts/whitelabel-prebuild.js).
 */

import { APP_TYPE, FEATURES, type AppType, type FeatureKey } from './constants';

/**
 * Get the full whitelabel config object.
 */
export function getWhitelabelConfig() {
    return window.__WHITELABEL__;
}

/**
 * Check whether a specific feature is enabled for the current tenant.
 *
 * Returns true (enabled) by default if no whitelabel config is present
 * or if the feature key is not defined in the config.
 */
export function isFeatureEnabled(feature: FeatureKey | string): boolean {
    const wl = window.__WHITELABEL__;
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
    const wl = window.__WHITELABEL__;
    if (wl?.features?.languages && Array.isArray(wl.features.languages)) {
        return wl.features.languages;
    }
    return [ 'en', 'asl', 'fr', 'lsq' ];
}

/**
 * Get the default language for the current tenant.
 */
export function getDefaultLanguage(): string {
    const wl = window.__WHITELABEL__;
    if (wl?.features?.defaultLanguage) {
        return wl.features.defaultLanguage;
    }
    return 'en';
}

/**
 * Get the tenant's app name.
 */
export function getAppName(): string {
    const wl = window.__WHITELABEL__;
    if (wl?.appName) {
        return wl.appName;
    }
    return 'MalkaVRS';
}

/**
 * Get the tenant's logo URL (white variant for dark backgrounds).
 */
export function getLogoWhiteUrl(): string {
    const wl = window.__WHITELABEL__;
    if (wl?.assets?.logoWhite) {
        return wl.assets.logoWhite;
    }
    return 'images/malka-logo-white.png';
}

/**
 * Get the tenant's primary logo URL.
 */
export function getLogoUrl(): string {
    const wl = window.__WHITELABEL__;
    if (wl?.assets?.logo) {
        return wl.assets.logo;
    }
    return 'images/malka-logo.png';
}

/**
 * Check if the current tenant is not "malka" (i.e., is a whitelabeled tenant).
 */
export function isWhitelabeled(): boolean {
    const wl = window.__WHITELABEL__;
    return wl ? wl.tenantId !== 'malka' : false;
}

/**
 * Get the current tenant ID.
 */
export function getTenantId(): string {
    return window.__WHITELABEL__?.tenantId ?? 'malka';
}

/**
 * Get the app type (VRS or VRI) for the current build.
 *
 * Determined by the `operations.appType` field in the tenant config.
 * Falls back to checking `features.vrs` vs `features.vri`.
 */
export function getAppType(): AppType {
    const wl = window.__WHITELABEL__;

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
