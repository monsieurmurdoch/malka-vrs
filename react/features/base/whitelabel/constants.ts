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
