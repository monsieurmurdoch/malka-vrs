/**
 * Contacts API client — thin wrapper around fetch for the contacts endpoints.
 */

export interface ContactEntry {
    id: string;
    client_id: string;
    name: string;
    email: string | null;
    phone_number: string | null;
    organization: string | null;
    notes: string | null;
    avatar_color: string | null;
    is_favorite: number;
    linked_client_id: string | null;
    merged_into: string | null;
    group_ids: string | null;
    group_names: string | null;
    last_call_date: string | null;
    created_at: string;
    updated_at: string;
    callHistory?: any[];
}

export interface ContactGroup {
    id: string;
    client_id: string;
    name: string;
    color: string | null;
    sort_order: number;
    member_count: number;
}

export interface BlockedContact {
    id: string;
    client_id: string;
    blocked_phone: string | null;
    blocked_email: string | null;
    blocked_client_id: string | null;
    reason: string | null;
    created_at: string;
}

export interface DuplicateSet {
    field: string;
    value: string;
    contacts: ContactEntry[];
}

export interface ImportResult {
    imported: number;
    skipped: number;
    errors: Array<{ name: string; error: string }>;
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

export const contactsAPI = {
    // Contact CRUD
    list(search?: string, groupId?: string, favoritesOnly?: boolean): Promise<{ contacts: ContactEntry[] }> {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (groupId) params.set('groupId', groupId);
        if (favoritesOnly) params.set('favorites', 'true');
        const qs = params.toString();

        return apiFetch(`/api/contacts${qs ? `?${qs}` : ''}`);
    },

    get(contactId: string): Promise<{ contact: ContactEntry }> {
        return apiFetch(`/api/contacts/${contactId}`);
    },

    create(data: Partial<ContactEntry> & { groupIds?: string[] }): Promise<{ contact: { id: string; name: string } }> {
        return apiFetch('/api/contacts', {
            method: 'POST',
            body: JSON.stringify({
                name: data.name,
                email: data.email,
                phoneNumber: data.phone_number,
                organization: data.organization,
                notes: data.notes,
                avatarColor: data.avatar_color,
                isFavorite: data.is_favorite,
                linkedClientId: data.linked_client_id,
                groupIds: data.groupIds
            })
        });
    },

    update(contactId: string, data: Partial<ContactEntry> & { groupIds?: string[] }): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/${contactId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: data.name,
                email: data.email,
                phoneNumber: data.phone_number,
                organization: data.organization,
                notes: data.notes,
                avatarColor: data.avatar_color,
                isFavorite: data.is_favorite,
                linkedClientId: data.linked_client_id,
                groupIds: data.groupIds
            })
        });
    },

    delete(contactId: string): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
    },

    // Groups
    listGroups(): Promise<{ groups: ContactGroup[] }> {
        return apiFetch('/api/contacts/groups/list');
    },

    createGroup(data: { name: string; color?: string }): Promise<{ group: { id: string; name: string } }> {
        return apiFetch('/api/contacts/groups', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    updateGroup(groupId: string, data: { name?: string; color?: string }): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    deleteGroup(groupId: string): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/groups/${groupId}`, { method: 'DELETE' });
    },

    setContactGroups(contactId: string, groupIds: string[]): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/${contactId}/groups`, {
            method: 'PUT',
            body: JSON.stringify({ groupIds })
        });
    },

    // Block list
    listBlocked(): Promise<{ blocked: BlockedContact[] }> {
        return apiFetch('/api/contacts/blocked/list');
    },

    block(data: { blockedPhone?: string; blockedEmail?: string; blockedClientId?: string; reason?: string }): Promise<{ block: { id: string } }> {
        return apiFetch('/api/contacts/blocked', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    unblock(blockId: string): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/blocked/${blockId}`, { method: 'DELETE' });
    },

    // Merge / dedup
    findDuplicates(): Promise<{ duplicates: DuplicateSet[] }> {
        return apiFetch('/api/contacts/duplicates/list');
    },

    merge(primaryId: string, secondaryIds: string[]): Promise<{ success: boolean; merged: number }> {
        return apiFetch('/api/contacts/merge', {
            method: 'POST',
            body: JSON.stringify({ primaryId, secondaryIds })
        });
    },

    // Import
    import(contacts: Array<Record<string, any>>): Promise<ImportResult> {
        return apiFetch('/api/contacts/import', {
            method: 'POST',
            body: JSON.stringify({ contacts })
        });
    },

    // Migration
    migrateSpeedDial(): Promise<{ success: boolean; migrated: number }> {
        return apiFetch('/api/contacts/migrate-speed-dial', { method: 'POST' });
    },

    // Timeline
    getTimeline(contactId: string): Promise<{ timeline: Array<{ type: string; id: string; timestamp: string; data: Record<string, any> }> }> {
        return apiFetch(`/api/contacts/${contactId}/timeline`);
    },

    // Notes CRUD
    getNotes(contactId: string): Promise<{ notes: Array<{ id: string; contact_id: string; author_id: string; content: string; created_at: string; updated_at: string }> }> {
        return apiFetch(`/api/contacts/${contactId}/notes`);
    },

    addNote(contactId: string, content: string): Promise<{ note: { id: string; contact_id: string; author_id: string; content: string; created_at: string } }> {
        return apiFetch(`/api/contacts/${contactId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    },

    updateNote(contactId: string, noteId: string, content: string): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/${contactId}/notes/${noteId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    },

    deleteNote(contactId: string, noteId: string): Promise<{ success: boolean }> {
        return apiFetch(`/api/contacts/${contactId}/notes/${noteId}`, { method: 'DELETE' });
    },

    // Sync
    sync(since?: string | null): Promise<{ changes: any[]; serverTimestamp: string }> {
        const qs = since ? `?since=${encodeURIComponent(since)}` : '';

        return apiFetch(`/api/contacts/sync${qs}`);
    },

    // Google Contacts
    googleAuthUrl(): Promise<{ url: string }> {
        return apiFetch('/api/google-contacts/auth-url');
    },

    googleFetch(): Promise<{ contacts: Array<Record<string, any>> }> {
        return apiFetch('/api/google-contacts/fetch', { method: 'POST' });
    },

    googleImport(contacts: Array<Record<string, any>>): Promise<{ imported: number; skipped: number; errors: Array<{ name: string; error: string }> }> {
        return apiFetch('/api/google-contacts/import', {
            method: 'POST',
            body: JSON.stringify({ contacts })
        });
    }
};

declare var config: any;
