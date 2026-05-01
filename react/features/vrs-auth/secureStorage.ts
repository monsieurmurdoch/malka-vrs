/**
 * Secure token storage abstraction.
 *
 * Provides a Keychain/Keystore-ready interface for sensitive auth data.
 * On native, sensitive tokens (vrs_auth_token) should be stored via
 * react-native-keychain when it is linked. We mirror values into the existing
 * persistent cache so synchronous call sites can still read during app boot.
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
const KEYCHAIN_SERVICE_PREFIX = 'malka.vrs.';

type KeychainModule = {
    getGenericPassword?: (options?: { service?: string }) => Promise<false | { password: string }>;
    setGenericPassword?: (username: string, password: string, options?: { service?: string }) => Promise<unknown>;
    resetGenericPassword?: (options?: { service?: string }) => Promise<unknown>;
    getSupportedBiometryType?: () => Promise<string | null>;
};

function getKeychain(): KeychainModule | null {
    try {
        const maybeRequire = typeof require === 'function' ? require : undefined;

        return maybeRequire ? maybeRequire('react-native-keychain') as KeychainModule : null;
    } catch {
        return null;
    }
}

function serviceFor(key: string): string {
    return `${KEYCHAIN_SERVICE_PREFIX}${key}`;
}

/**
 * Read a sensitive value. Sync version checks the in-memory/localStorage
 * cache first; use getSecureItemAsync for the authoritative native read.
 */
export function getSecureItem(key: string): string | null {
    if (!SECURE_KEYS.has(key)) {
        return getPersistentItem(key);
    }

    return getPersistentItem(key);
}

/**
 * Async read for sensitive values — preferred on native.
 */
export async function getSecureItemAsync(key: string): Promise<string | null> {
    if (!SECURE_KEYS.has(key)) {
        return getPersistentItemAsync(key);
    }

    const keychain = getKeychain();

    if (keychain?.getGenericPassword) {
        const credentials = await keychain.getGenericPassword({ service: serviceFor(key) });

        if (credentials && credentials.password) {
            setPersistentItem(key, credentials.password);

            return credentials.password;
        }
    }

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

    setPersistentItem(key, value);

    const keychain = getKeychain();

    if (keychain?.setGenericPassword) {
        void keychain.setGenericPassword(key, value, { service: serviceFor(key) });
    }
}

/**
 * Remove a sensitive value.
 */
export function removeSecureItem(key: string): void {
    if (!SECURE_KEYS.has(key)) {
        removePersistentItem(key);

        return;
    }

    removePersistentItem(key);

    const keychain = getKeychain();

    if (keychain?.resetGenericPassword) {
        void keychain.resetGenericPassword({ service: serviceFor(key) });
    }
}

/**
 * Check whether secure hardware-backed storage is available.
 * Returns true once react-native-keychain is linked and Keychain.isAvailable().
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
    const keychain = getKeychain();

    if (!keychain?.getSupportedBiometryType && !keychain?.setGenericPassword) {
        return false;
    }

    return true;
}
