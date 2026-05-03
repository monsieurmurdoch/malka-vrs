/**
 * TypeScript types for the whitelabel system.
 */

export interface WhitelabelBrand {
    appName: string;
    providerName: string;
    tagline: string;
    description: string;
    supportUrl: string;
    inviteDomain: string;
}

export interface WhitelabelTheme {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    errorDark: string;
    surfaceDark: string;
    surfaceMid: string;
    surfaceLight: string;
    textPrimary: string;
    textSecondary: string;
    toolbarBg: string;
    chatBg: string;
}

export interface WhitelabelAssets {
    logo: string;
    logoWhite: string;
    favicon: string;
    faviconSvg: string;
    favicon16: string;
    favicon32: string;
    appleTouchIcon: string;
    welcomeBackground: string;
}

export interface WhitelabelFeatures {
    vrs: boolean;
    vri: boolean;
    voicemail: boolean;
    recording: boolean;
    phoneDialOut: boolean;
    languages: string[];
    defaultLanguage: string;
}

export interface WhitelabelConfig {
    tenantId: string;
    appName: string;
    providerName: string;
    tagline: string;
    description: string;
    supportUrl: string;
    theme: WhitelabelTheme;
    features: WhitelabelFeatures;
    assets: WhitelabelAssets;
    operations?: {
        appType?: string;
        defaultServiceModes?: string[];
        [key: string]: unknown;
    };
}

declare global {
    interface Window {
        __WHITELABEL__?: WhitelabelConfig;
    }

    // Native builds may inject tenant config outside a browser window.
    // Keep the surface typed so shared helpers do not need broad `any` casts.
    // eslint-disable-next-line no-var
    var __WHITELABEL__: WhitelabelConfig | undefined;
}
