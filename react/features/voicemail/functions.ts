/**
 * API helpers for the voicemail feature.
 *
 * All calls go through the VRS auth endpoint configured in config.vrs.
 */

import { getPersistentJson } from '../vrs-auth/storage';

declare var config: any;

type StoredAuthToken = {
    token?: string;
};

function normalizeToken(candidate: unknown): string | undefined {
    if (!candidate) {
        return undefined;
    }

    if (typeof candidate === 'string') {
        try {
            const parsed = JSON.parse(candidate) as StoredAuthToken;

            return parsed.token || candidate;
        } catch {
            return candidate;
        }
    }

    if (typeof candidate === 'object' && 'token' in candidate) {
        return (candidate as StoredAuthToken).token;
    }

    return undefined;
}

function getAuthHeaders(getState: Function): Record<string, string> {
    let token: string | undefined;

    // Try to get token from Redux state
    try {
        const state = getState();
        token = normalizeToken(state['features/vrs-auth']?.token);
    } catch { /* ignore */ }

    // Fallback to persistent VRS auth storage.
    if (!token) {
        token = getPersistentJson<StoredAuthToken>('vrs_auth_token')?.token;
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

function getBaseUrl(): string {
    if (typeof config !== 'undefined' && config.vrs?.authEndpoint) {
        return config.vrs.authEndpoint.replace('/auth', '/voicemail');
    }
    return 'http://localhost:3001/api/voicemail';
}

/**
 * Fetch the voicemail inbox.
 */
export async function fetchVoicemailInbox(getState: Function, limit: number, offset: number) {
    const url = `${getBaseUrl()}/inbox?limit=${limit}&offset=${offset}`;
    const response = await fetch(url, { headers: getAuthHeaders(getState) });

    if (!response.ok) {
        throw new Error(`Failed to fetch inbox: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Fetch a single voicemail message with presigned playback URL.
 */
export async function fetchVoicemailMessage(getState: Function, messageId: string) {
    const url = `${getBaseUrl()}/messages/${messageId}`;
    const response = await fetch(url, { headers: getAuthHeaders(getState) });

    if (!response.ok) {
        throw new Error(`Failed to fetch message: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Delete a voicemail message.
 */
export async function deleteVoicemailMessage(getState: Function, messageId: string) {
    const url = `${getBaseUrl()}/messages/${messageId}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: getAuthHeaders(getState)
    });

    if (!response.ok) {
        throw new Error(`Failed to delete message: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Mark a message as seen.
 */
export async function markMessageSeen(getState: Function, messageId: string) {
    const url = `${getBaseUrl()}/messages/${messageId}/seen`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(getState)
    });

    if (!response.ok) {
        throw new Error(`Failed to mark message as seen: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get the unread voicemail count.
 */
export async function fetchUnreadCount(getState: Function) {
    const url = `${getBaseUrl()}/unread-count`;
    const response = await fetch(url, { headers: getAuthHeaders(getState) });

    if (!response.ok) {
        throw new Error(`Failed to fetch unread count: ${response.statusText}`);
    }

    const data = await response.json();

    return data.count as number;
}

/**
 * Start a voicemail recording session.
 */
export async function startVoicemailRecording(getState: Function, calleePhone: string) {
    const url = `${getBaseUrl()}/start`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(getState),
        body: JSON.stringify({ calleePhone })
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(data.error || 'Failed to start recording');
    }

    return response.json();
}

/**
 * Cancel an active recording.
 */
export async function cancelVoicemailRecording(getState: Function, messageId: string) {
    const url = `${getBaseUrl()}/cancel/${messageId}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(getState)
    });

    if (!response.ok) {
        throw new Error(`Failed to cancel recording: ${response.statusText}`);
    }

    return response.json();
}
