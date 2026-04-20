/**
 * Type definitions for the contacts feature.
 */

import type { ContactEntry, ContactGroup, BlockedContact } from './contactsAPI';

export interface ContactNote {
    id: string;
    contact_id: string;
    author_id: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface TimelineItem {
    type: 'call' | 'missed_call' | 'voicemail' | 'note';
    id: string;
    timestamp: string;
    data: Record<string, any>;
}

export interface ContactDetail {
    contact: ContactEntry;
    timeline: TimelineItem[];
    notes: ContactNote[];
}

export interface ContactsState {
    contacts: ContactEntry[];
    groups: ContactGroup[];
    blocked: BlockedContact[];
    selectedContactId: string | null;
    contactDetail: ContactDetail | null;
    isLoading: boolean;
    isDetailLoading: boolean;
    search: string;
    activeTab: string;
    selectedGroupId: string | null;
    syncToken: string | null;
    error: string | null;
}
