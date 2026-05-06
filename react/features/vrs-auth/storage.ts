/**
 * Shared storage helpers for VRS auth/session data.
 *
 * We mirror auth data into both localStorage and sessionStorage so existing
 * pages keep working while login persists across browser restarts. React Native
 * does not expose those browser globals, so native builds also use AsyncStorage
 * and hydrate an in-memory cache before session validation/queue auth.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const memoryStorage = new Map<string, string>();

type NativeStorage = {
    getItem: (key: string) => Promise<string | null>;
    removeItem: (key: string) => Promise<void>;
    setItem: (key: string, value: string) => Promise<void>;
};

function getNativeStorage(): NativeStorage | undefined {
    return AsyncStorage;
}

function getLocalStorage(): Storage | undefined {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : undefined;
    } catch {
        return undefined;
    }
}

function getSessionStorage(): Storage | undefined {
    try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;
    } catch {
        return undefined;
    }
}

function safeGet(storage: Storage | undefined, key: string): string | null {
    if (!storage) {
        return null;
    }

    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(storage: Storage | undefined, key: string, value: string): void {
    if (!storage) {
        return;
    }

    try {
        storage.setItem(key, value);
    } catch {
        // Ignore storage write failures (private mode, quotas, etc.)
    }
}

function safeRemove(storage: Storage | undefined, key: string): void {
    if (!storage) {
        return;
    }

    try {
        storage.removeItem(key);
    } catch {
        // Ignore storage remove failures.
    }
}

async function safeNativeGet(key: string): Promise<string | null> {
    const storage = getNativeStorage();

    if (!storage) {
        return null;
    }

    try {
        return await storage.getItem(key);
    } catch {
        return null;
    }
}

async function safeNativeSet(key: string, value: string): Promise<void> {
    const storage = getNativeStorage();

    if (!storage) {
        return;
    }

    try {
        await storage.setItem(key, value);
    } catch {
        // Ignore native storage write failures.
    }
}

async function safeNativeRemove(key: string): Promise<void> {
    const storage = getNativeStorage();

    if (!storage) {
        return;
    }

    try {
        await storage.removeItem(key);
    } catch {
        // Ignore native storage remove failures.
    }
}

export function getPersistentItem(key: string): string | null {
    const local = safeGet(getLocalStorage(), key);
    if (local !== null) {
        safeSet(getSessionStorage(), key, local);
        memoryStorage.set(key, local);
        void safeNativeSet(key, local);

        return local;
    }

    const session = safeGet(getSessionStorage(), key);
    if (session !== null) {
        safeSet(getLocalStorage(), key, session);
        memoryStorage.set(key, session);
        void safeNativeSet(key, session);

        return session;
    }

    return memoryStorage.get(key) ?? null;
}

export async function getPersistentItemAsync(key: string): Promise<string | null> {
    const cached = getPersistentItem(key);
    if (cached !== null) {
        return cached;
    }

    const native = await safeNativeGet(key);
    if (native !== null) {
        memoryStorage.set(key, native);
        safeSet(getLocalStorage(), key, native);
        safeSet(getSessionStorage(), key, native);

        return native;
    }

    return null;
}

export async function hydratePersistentItems(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => getPersistentItemAsync(key)));
}

export function setPersistentItem(key: string, value: string): void {
    memoryStorage.set(key, value);
    safeSet(getLocalStorage(), key, value);
    safeSet(getSessionStorage(), key, value);
    void safeNativeSet(key, value);
}

export function removePersistentItem(key: string): void {
    memoryStorage.delete(key);
    safeRemove(getLocalStorage(), key);
    safeRemove(getSessionStorage(), key);
    void safeNativeRemove(key);
}

export function clearPersistentItems(keys: string[]): void {
    keys.forEach(removePersistentItem);
}

export function getPersistentJson<T>(key: string): T | null {
    const value = getPersistentItem(key);

    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export async function getPersistentJsonAsync<T>(key: string): Promise<T | null> {
    const value = await getPersistentItemAsync(key);

    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export function hasPersistentAuthToken(): boolean {
    const auth = getPersistentJson<{ token?: string }>('vrs_auth_token');

    return Boolean(auth?.token);
}

const PENDING_ROOM_REDIRECT_KEY = 'vrs_pending_room_redirect';

export function setPendingRoomRedirect(url: string): void {
    setPersistentItem(PENDING_ROOM_REDIRECT_KEY, url);
}

export function getPendingRoomRedirect(): string | null {
    return getPersistentItem(PENDING_ROOM_REDIRECT_KEY);
}

export function consumePendingRoomRedirect(): string | null {
    const url = getPendingRoomRedirect();

    if (url) {
        removePersistentItem(PENDING_ROOM_REDIRECT_KEY);
    }

    return url;
}
