/**
 * Action creators for the contacts feature.
 */

import {
    CONTACTS_LOADED,
    CONTACTS_LOADING,
    CONTACT_ADDED,
    CONTACT_UPDATED,
    CONTACT_DELETED,
    CONTACT_DETAIL_LOADED,
    CONTACT_DETAIL_LOADING,
    CONTACT_SELECTED,
    CONTACT_DETAIL_CLOSED,
    CONTACT_NOTE_ADDED,
    CONTACT_NOTE_UPDATED,
    CONTACT_NOTE_DELETED,
    CONTACT_GROUPS_LOADED,
    CONTACT_GROUP_ADDED,
    CONTACT_GROUP_DELETED,
    CONTACT_BLOCKED_LOADED,
    CONTACTS_SYNC_RECEIVED,
    CONTACTS_SYNC_TOKEN_UPDATED,
    CONTACTS_SET_SEARCH,
    CONTACTS_SET_TAB,
    CONTACTS_SET_GROUP_FILTER,
    CONTACTS_ERROR,
    CONTACTS_CLEAR_ERROR
} from './actionTypes';
import { contactsAPI } from './contactsAPI';

/**
 * Load the contacts list.
 */
export function loadContacts(search?: string, groupId?: string, favoritesOnly?: boolean) {
    return async (dispatch: Function, getState: Function) => {
        dispatch({ type: CONTACTS_LOADING });
        try {
            const state = getState()?.['features/contacts'];
            const effectiveSearch = search !== undefined ? search : state?.search || undefined;
            const effectiveGroupId = groupId !== undefined ? groupId : state?.selectedGroupId || undefined;
            const effectiveFavoritesOnly
                = favoritesOnly !== undefined ? favoritesOnly : state?.activeTab === 'favorites';
            const result = await contactsAPI.list(effectiveSearch, effectiveGroupId, effectiveFavoritesOnly || undefined);
            dispatch({ type: CONTACTS_LOADED, contacts: result.contacts });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Load full contact detail with timeline and notes.
 */
export function loadContactDetail(contactId: string) {
    return async (dispatch: Function) => {
        dispatch({ type: CONTACT_DETAIL_LOADING });
        dispatch({ type: CONTACT_SELECTED, contactId });
        try {
            const result = await contactsAPI.get(contactId);
            const contact = result.contact;

            // Fetch timeline and notes in parallel
            const [timelineResult, notesResult] = await Promise.all([
                contactsAPI.getTimeline(contactId).catch(() => ({ timeline: [] })),
                contactsAPI.getNotes(contactId).catch(() => ({ notes: [] }))
            ]);

            dispatch({
                type: CONTACT_DETAIL_LOADED,
                contactDetail: {
                    contact,
                    timeline: (timelineResult.timeline || []) as Array<{
                        type: 'call' | 'missed_call' | 'voicemail' | 'note';
                        id: string;
                        timestamp: string;
                        data: Record<string, any>;
                    }>,
                    notes: notesResult.notes || []
                }
            });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Close contact detail view.
 */
export function closeContactDetail() {
    return { type: CONTACT_DETAIL_CLOSED };
}

/**
 * Create a new contact.
 */
export function addContact(data: Partial<any> & { groupIds?: string[] }) {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.create(data);
            if (result.contact) {
                dispatch({ type: CONTACT_ADDED, contact: result.contact });
            } else {
                // Reload full list since we didn't get the complete contact back
                dispatch(loadContacts());
            }
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Update an existing contact.
 */
export function updateContactAction(contactId: string, data: Partial<any> & { groupIds?: string[] }) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.update(contactId, data);
            // Reload to get the updated contact
            dispatch(loadContacts());
            if (data.groupIds) {
                dispatch(loadGroups());
            }
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Delete a contact.
 */
export function deleteContactAction(contactId: string) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.delete(contactId);
            dispatch({ type: CONTACT_DELETED, contactId });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Toggle favorite status.
 */
export function toggleFavorite(contactId: string, currentFavorite: number) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.update(contactId, { is_favorite: currentFavorite ? 0 : 1 });
            dispatch(loadContacts());
        } catch {
            // Silent fail for favorite toggle
        }
    };
}

/**
 * Add a note to a contact.
 */
export function addNote(contactId: string, content: string) {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.addNote(contactId, content);
            if (result.note) {
                dispatch({ type: CONTACT_NOTE_ADDED, note: result.note });
            }
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Update a contact note.
 */
export function updateNote(contactId: string, noteId: string, content: string) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.updateNote(contactId, noteId, content);
            dispatch({ type: CONTACT_NOTE_UPDATED, note: { id: noteId, content, updated_at: new Date().toISOString() } });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Delete a contact note.
 */
export function deleteNote(contactId: string, noteId: string) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.deleteNote(contactId, noteId);
            dispatch({ type: CONTACT_NOTE_DELETED, noteId });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Load contact groups.
 */
export function loadGroups() {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.listGroups();
            dispatch({ type: CONTACT_GROUPS_LOADED, groups: result.groups });
        } catch {
            // Groups are non-critical
        }
    };
}

/**
 * Create a contact group.
 */
export function addGroup(data: { name: string; color?: string }) {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.createGroup(data);
            if (result.group) {
                dispatch({ type: CONTACT_GROUP_ADDED, group: result.group });
            } else {
                dispatch(loadGroups());
            }
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Delete a contact group.
 */
export function deleteGroup(groupId: string) {
    return async (dispatch: Function) => {
        try {
            await contactsAPI.deleteGroup(groupId);
            dispatch({ type: CONTACT_GROUP_DELETED, groupId });
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
        }
    };
}

/**
 * Load blocked contacts.
 */
export function loadBlocked() {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.listBlocked();
            dispatch({ type: CONTACT_BLOCKED_LOADED, blocked: result.blocked });
        } catch {
            // Non-critical
        }
    };
}

/**
 * Sync contacts from server (delta sync).
 */
export function syncContacts() {
    return async (dispatch: Function, getState: Function) => {
        const state = getState();
        const syncToken = state['features/contacts']?.syncToken;

        try {
            const result = await contactsAPI.sync(syncToken);
            dispatch({
                type: CONTACTS_SYNC_RECEIVED,
                changes: result.changes,
                serverTimestamp: result.serverTimestamp
            });
            dispatch({ type: CONTACTS_SYNC_TOKEN_UPDATED, token: result.serverTimestamp });
        } catch {
            // Fallback: full reload
            dispatch(loadContacts());
        }
    };
}

/**
 * Import contacts from file data.
 */
export function importContacts(contacts: Array<Record<string, any>>) {
    return async (dispatch: Function) => {
        try {
            const result = await contactsAPI.import(contacts);
            dispatch(loadContacts());
            dispatch(loadGroups());
            return result;
        } catch (error: any) {
            dispatch({ type: CONTACTS_ERROR, error: error.message });
            throw error;
        }
    };
}

// UI actions
export function setSearch(search: string) {
    return { type: CONTACTS_SET_SEARCH, search };
}

export function setTab(tab: string) {
    return { type: CONTACTS_SET_TAB, tab };
}

export function setGroupFilter(groupId: string | null) {
    return { type: CONTACTS_SET_GROUP_FILTER, groupIdFilter: groupId };
}

export function clearError() {
    return { type: CONTACTS_CLEAR_ERROR };
}
