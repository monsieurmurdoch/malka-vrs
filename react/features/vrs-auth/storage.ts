/**
 * Shared storage helpers for VRS auth/session data.
 *
 * We mirror auth data into both localStorage and sessionStorage so existing
 * pages keep working while login persists across browser restarts. React Native
 * does not expose those browser globals, so we also keep an in-memory fallback
 * that lets mobile flows share auth/session data during the current app run.
 */

const memoryStorage = new Map<string, string>();

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

export function getPersistentItem(key: string): string | null {
    const local = safeGet(getLocalStorage(), key);
    if (local !== null) {
        safeSet(getSessionStorage(), key, local);
        memoryStorage.set(key, local);

        return local;
    }

    const session = safeGet(getSessionStorage(), key);
    if (session !== null) {
        safeSet(getLocalStorage(), key, session);
        memoryStorage.set(key, session);

        return session;
    }

    return memoryStorage.get(key) ?? null;
}

export function setPersistentItem(key: string, value: string): void {
    memoryStorage.set(key, value);
    safeSet(getLocalStorage(), key, value);
    safeSet(getSessionStorage(), key, value);
}

export function removePersistentItem(key: string): void {
    memoryStorage.delete(key);
    safeRemove(getLocalStorage(), key);
    safeRemove(getSessionStorage(), key);
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
