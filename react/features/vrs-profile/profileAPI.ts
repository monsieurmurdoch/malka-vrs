/**
 * Profile API client — thin wrapper around fetch for profile/settings endpoints.
 */

export interface ClientProfile {
    id: string;
    name: string;
    email: string;
    organization: string | null;
    primaryPhone: string | null;
    phoneNumbers: Array<{ id: string; phone_number: string; is_primary: boolean }>;
}

export interface InterpreterProfileData {
    id: string;
    name: string;
    email: string;
    languages: string[];
    active: boolean;
}

export interface ClientPreferences {
    dnd_enabled: boolean;
    dnd_message: string | null;
    dark_mode: 'light' | 'dark' | 'system';
    camera_default_off: boolean;
    mic_default_off: boolean;
    skip_waiting_room: boolean;
    remember_media_permissions: boolean;
}

export interface InterpreterStats {
    totalCalls: number;
    totalMinutes: number;
    avgDuration: number;
    totalEarnings: number;
}

function getApiBase(): string {
    if (typeof config !== 'undefined' && config.vrs?.queueServiceUrl) {
        const wsUrl = config.vrs.queueServiceUrl as string;

        return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
    }

    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}

function getToken(): string | null {
    try {
        const raw = localStorage.getItem('vrs_auth_token');
        if (!raw) return null;
        const parsed = JSON.parse(raw);

        return parsed?.token || null;
    } catch {
        return null;
    }
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${getApiBase()}${path}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || `API error ${response.status}`);
    }

    return data;
}

export const profileAPI = {
    // Client profile
    getClientProfile(): Promise<ClientProfile> {
        return apiFetch('/api/client/profile');
    },

    updateClientProfile(data: Partial<Pick<ClientProfile, 'name' | 'email' | 'organization'>>): Promise<ClientProfile> {
        return apiFetch('/api/client/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // Client preferences
    getPreferences(): Promise<ClientPreferences> {
        return apiFetch('/api/client/preferences');
    },

    updatePreferences(data: Partial<ClientPreferences>): Promise<ClientPreferences> {
        return apiFetch('/api/client/preferences', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // Interpreter profile
    getInterpreterProfile(): Promise<InterpreterProfileData> {
        return apiFetch('/api/interpreter/profile');
    },

    updateInterpreterProfile(data: Partial<Pick<InterpreterProfileData, 'name' | 'email' | 'languages'>>): Promise<InterpreterProfileData> {
        return apiFetch('/api/interpreter/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // Interpreter stats
    getInterpreterStats(): Promise<InterpreterStats> {
        return apiFetch('/api/interpreter/stats');
    },

    // Password change
    changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
        return apiFetch('/api/auth/password/change', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    }
};

declare var config: any;
