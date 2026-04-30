/**
 * Whitelabel feature flag constants.
 *
 * Use these strings with isFeatureEnabled() to check whether
 * a specific feature is available for the current tenant.
 */
export const FEATURES = {
    VRS: 'vrs',
    VRI: 'vri',
    VOICEMAIL: 'voicemail',
    RECORDING: 'recording',
    PHONE_DIAL_OUT: 'phoneDialOut'
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

/**
 * App type distinguishes the three mobile apps:
 *   vrs  — MalkaVRS  (phone-number VRS flow, dial pad, contacts, voicemail)
 *   vri  — MalkaVRI / MapleVRI (corporate VRI console, self-view, request interpreter)
 */
export const APP_TYPE = {
    VRS: 'vrs',
    VRI: 'vri'
} as const;

export type AppType = typeof APP_TYPE[keyof typeof APP_TYPE];
