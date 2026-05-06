/**
 * Shared API client for web and mobile.
 *
 * Provides typed HTTP methods that read the base URL from the
 * whitelabel config (web) or AsyncStorage-cached tenant config (native).
 * All requests include the JWT auth token from secure storage.
 *
 * Usage:
 *   import { apiClient } from '../shared/api-client';
 *   const profile = await apiClient.get<UserProfile>('/api/client/profile');
 */

import { Platform } from 'react-native';

import type { ApiResponse } from '../../../../contracts/types';
import { getWhitelabelConfig } from '../../base/whitelabel/functions';
import { getPersistentItem, getPersistentJson } from '../../vrs-auth/storage';
import { getSecureItem, setSecureItem } from '../../vrs-auth/secureStorage';

interface TenantConfig {
    domains?: {
        api?: string;
        clientVrs?: string;
        clientVri?: string;
        interpreter?: string;
    };
    operations?: {
        appType?: 'vrs' | 'vri';
    };
}

function getBaseUrl(): string {
    if (Platform.OS === 'web') {
        // Web: relative URL (same origin) or read from whitelabel config
        return '';
    }

    const wl = getWhitelabelConfig() as TenantConfig;
    const cached = getPersistentJson<TenantConfig>('vrs_tenant_config');
    const domains = wl?.domains || cached?.domains;
    const appType = wl?.operations?.appType || cached?.operations?.appType;
    const domain = domains?.api || (appType === 'vrs'
        ? domains?.clientVrs || domains?.clientVri || domains?.interpreter
        : domains?.clientVri || domains?.clientVrs || domains?.interpreter);

    if (domain) {
        return `https://${domain}`;
    }

    // Fallback: production URL
    return 'https://vrs.malkacomm.com';
}

function getAuthToken(): string | null {
    // Try secure storage first, then regular storage
    const raw = getSecureItem('vrs_auth_token') || getPersistentItem('vrs_auth_token');

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as { token?: string };

        return parsed.token || raw;
    } catch {
        return raw;
    }
}

function getAuthTokenEnvelope(): { token?: string; role?: string; userId?: string } | null {
    const raw = getSecureItem('vrs_auth_token') || getPersistentItem('vrs_auth_token');

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as { token?: string; role?: string; userId?: string };
    } catch {
        return { token: raw };
    }
}

async function refreshAuthToken(): Promise<string | null> {
    const envelope = getAuthTokenEnvelope();

    if (!envelope?.token) {
        return null;
    }

    try {
        const response = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
            headers: {
                Authorization: `Bearer ${envelope.token}`,
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as { token?: string };

        if (!data.token) {
            return null;
        }

        setSecureItem('vrs_auth_token', JSON.stringify({
            ...envelope,
            token: data.token,
            refreshedAt: Date.now()
        }));

        return data.token;
    } catch {
        return null;
    }
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    retried = false
): Promise<ApiResponse<T>> {
    const baseUrl = getBaseUrl();
    const token = getAuthToken();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            body: body ? JSON.stringify(body) : undefined,
            headers,
            method
        });

        const status = response.status;

        if (response.status === 401 && token && !retried) {
            const refreshedToken = await refreshAuthToken();

            if (refreshedToken) {
                return request<T>(method, path, body, true);
            }
        }

        if (!response.ok) {
            let errorMessage = `HTTP ${status}`;

            try {
                const errBody = await response.json();
                errorMessage = errBody.error || errBody.message || errorMessage;
            } catch {
                // non-JSON error body
            }

            return { data: null, error: errorMessage, status };
        }

        // 204 No Content
        if (status === 204) {
            return { data: null, error: null, status };
        }

        const data = await response.json() as T;

        return { data, error: null, status };
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Network error';

        return {
            data: null,
            error: errorMessage,
            status: 0
        };
    }
}

export const apiClient = {
    get: <T>(path: string) => request<T>('GET', path),

    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),

    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),

    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),

    del: <T>(path: string) => request<T>('DELETE', path)
};
