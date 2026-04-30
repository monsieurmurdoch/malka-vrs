/**
 * Secure token storage abstraction.
 *
 * Provides a Keychain/Keystore-ready interface for sensitive auth data.
 * On native, sensitive tokens (vrs_auth_token) should be stored via
 * react-native-keychain. Until that native dependency is linked,
 * this falls back to the existing AsyncStorage layer.
 *
 * The API mirrors react-native-keychain's set/get/reset pattern so the
 * swap-in is a one-line change per function when the dep is installed.
 */

import {
    getPersistentItem,
    getPersistentItemAsync,
    removePersistentItem,
    setPersistentItem
} from './storage';

const SECURE_KEYS = new Set([
    'vrs_auth_token',
    'vrs_interpreter_auth'
]);

/**
 * Read a sensitive value. Sync version checks the in-memory/localStorage
 * cache first; use getSecureItemAsync for the authoritative native read.
 */
export function getSecureItem(key: string): string | null {
    if (!SECURE_KEYS.has(key)) {
        return getPersistentItem(key);
    }

    // TODO: Replace with Keychain.getGenericPassword() when
    // react-native-keychain is linked.
    return getPersistentItem(key);
}

/**
 * Async read for sensitive values — preferred on native.
 */
export async function getSecureItemAsync(key: string): Promise<string | null> {
    if (!SECURE_KEYS.has(key)) {
        return getPersistentItemAsync(key);
    }

    // TODO: Replace with Keychain.getGenericPassword() when
    // react-native-keychain is linked.
    return getPersistentItemAsync(key);
}

/**
 * Write a sensitive value.
 */
export function setSecureItem(key: string, value: string): void {
    if (!SECURE_KEYS.has(key)) {
        setPersistentItem(key, value);

        return;
    }

    // TODO: Replace with Keychain.setGenericPassword(key, value) when
    // react-native-keychain is linked.
    setPersistentItem(key, value);
}

/**
 * Remove a sensitive value.
 */
export function removeSecureItem(key: string): void {
    if (!SECURE_KEYS.has(key)) {
        removePersistentItem(key);

        return;
    }

    // TODO: Replace with Keychain.resetGenericPassword() when
    // react-native-keychain is linked.
    removePersistentItem(key);
}

/**
 * Check whether secure hardware-backed storage is available.
 * Returns true once react-native-keychain is linked and Keychain.isAvailable().
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
    // TODO: return Keychain.isAvailable() ?? false;
    return false;
}
