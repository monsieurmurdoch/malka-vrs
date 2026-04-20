/**
 * Reducer for the contacts feature.
 */

import ReducerRegistry from '../base/redux/ReducerRegistry';

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
import type { ContactsState, ContactNote, TimelineItem } from './types';
import type { ContactEntry, ContactGroup, BlockedContact } from './contactsAPI';

const INITIAL_STATE: ContactsState = {
    contacts: [],
    groups: [],
    blocked: [],
    selectedContactId: null,
    contactDetail: null,
    isLoading: false,
    isDetailLoading: false,
    search: '',
    activeTab: 'all',
    selectedGroupId: null,
    syncToken: null,
    error: null
};

interface ContactsAction {
    type: string;
    contacts?: ContactEntry[];
    contact?: ContactEntry;
    contactId?: string;
    contactDetail?: { contact: ContactEntry; timeline: TimelineItem[]; notes: ContactNote[] };
    note?: ContactNote;
    noteId?: string;
    content?: string;
    groups?: ContactGroup[];
    group?: ContactGroup;
    groupId?: string;
    blocked?: BlockedContact[];
    changes?: any[];
    serverTimestamp?: string;
    token?: string;
    search?: string;
    tab?: string;
    groupIdFilter?: string | null;
    error?: string;
}

ReducerRegistry.register<ContactsState>('features/contacts',
    (state = INITIAL_STATE, action: ContactsAction): ContactsState => {
        switch (action.type) {
            case CONTACTS_LOADING:
                return { ...state, isLoading: true, error: null };

            case CONTACTS_LOADED:
                return {
                    ...state,
                    contacts: action.contacts || [],
                    isLoading: false
                };

            case CONTACT_ADDED:
                if (action.contact) {
                    return {
                        ...state,
                        contacts: [ ...state.contacts, action.contact ]
                    };
                }
                return state;

            case CONTACT_UPDATED:
                if (action.contact) {
                    return {
                        ...state,
                        contacts: state.contacts.map(c =>
                            c.id === action.contact!.id ? action.contact! : c
                        ),
                        contactDetail: state.contactDetail?.contact.id === action.contact!.id
                            ? { ...state.contactDetail, contact: action.contact! }
                            : state.contactDetail
                    };
                }
                return state;

            case CONTACT_DELETED:
                return {
                    ...state,
                    contacts: state.contacts.filter(c => c.id !== action.contactId),
                    contactDetail: state.contactDetail?.contact.id === action.contactId
                        ? null
                        : state.contactDetail,
                    selectedContactId: state.selectedContactId === action.contactId
                        ? null
                        : state.selectedContactId
                };

            case CONTACT_DETAIL_LOADING:
                return { ...state, isDetailLoading: true };

            case CONTACT_DETAIL_LOADED:
                if (action.contactDetail) {
                    return {
                        ...state,
                        contactDetail: {
                            contact: action.contactDetail.contact,
                            timeline: action.contactDetail.timeline,
                            notes: action.contactDetail.notes
                        },
                        isDetailLoading: false
                    };
                }
                return { ...state, isDetailLoading: false };

            case CONTACT_SELECTED:
                return { ...state, selectedContactId: action.contactId || null };

            case CONTACT_DETAIL_CLOSED:
                return {
                    ...state,
                    contactDetail: null,
                    selectedContactId: null,
                    isDetailLoading: false
                };

            case CONTACT_NOTE_ADDED:
                if (action.note && state.contactDetail) {
                    return {
                        ...state,
                        contactDetail: {
                            ...state.contactDetail,
                            notes: [ action.note, ...state.contactDetail.notes ],
                            timeline: [
                                {
                                    type: 'note',
                                    id: action.note.id,
                                    timestamp: action.note.created_at,
                                    data: { content: action.note.content, author_id: action.note.author_id }
                                },
                                ...state.contactDetail.timeline
                            ]
                        }
                    };
                }
                return state;

            case CONTACT_NOTE_UPDATED:
                if (action.note && state.contactDetail) {
                    return {
                        ...state,
                        contactDetail: {
                            ...state.contactDetail,
                            notes: state.contactDetail.notes.map(n =>
                                n.id === action.note!.id ? { ...n, ...action.note! } : n
                            ),
                            timeline: state.contactDetail.timeline.map(t =>
                                t.type === 'note' && t.id === action.note!.id
                                    ? { ...t, data: { ...t.data, content: action.note!.content } }
                                    : t
                            )
                        }
                    };
                }
                return state;

            case CONTACT_NOTE_DELETED:
                if (action.noteId && state.contactDetail) {
                    return {
                        ...state,
                        contactDetail: {
                            ...state.contactDetail,
                            notes: state.contactDetail.notes.filter(n => n.id !== action.noteId),
                            timeline: state.contactDetail.timeline.filter(t =>
                                !(t.type === 'note' && t.id === action.noteId)
                            )
                        }
                    };
                }
                return state;

            case CONTACT_GROUPS_LOADED:
                return { ...state, groups: action.groups || [] };

            case CONTACT_GROUP_ADDED:
                if (action.group) {
                    return { ...state, groups: [ ...state.groups, action.group ] };
                }
                return state;

            case CONTACT_GROUP_DELETED:
                return {
                    ...state,
                    groups: state.groups.filter(g => g.id !== action.groupId)
                };

            case CONTACT_BLOCKED_LOADED:
                return { ...state, blocked: action.blocked || [] };

            case CONTACTS_SYNC_RECEIVED: {
                if (!action.changes) return state;

                let updatedContacts = [ ...state.contacts ];

                for (const change of action.changes) {
                    if (change.action === 'delete') {
                        updatedContacts = updatedContacts.filter(c => c.id !== change.entity_id);
                    } else if (change.action === 'create' && change.snapshot) {
                        const exists = updatedContacts.some(c => c.id === change.entity_id);
                        if (!exists) {
                            updatedContacts.push(change.snapshot);
                        }
                    } else if (change.action === 'update' && change.snapshot) {
                        updatedContacts = updatedContacts.map(c =>
                            c.id === change.entity_id ? { ...c, ...change.snapshot } : c
                        );
                    }
                }

                return { ...state, contacts: updatedContacts };
            }

            case CONTACTS_SYNC_TOKEN_UPDATED:
                return { ...state, syncToken: action.token || null };

            case CONTACTS_SET_SEARCH:
                return { ...state, search: action.search || '' };

            case CONTACTS_SET_TAB:
                return { ...state, activeTab: action.tab || 'all' };

            case CONTACTS_SET_GROUP_FILTER:
                return { ...state, selectedGroupId: action.groupIdFilter ?? null };

            case CONTACTS_ERROR:
                return {
                    ...state,
                    error: action.error || 'Unknown error',
                    isLoading: false,
                    isDetailLoading: false
                };

            case CONTACTS_CLEAR_ERROR:
                return { ...state, error: null };

            default:
                return state;
        }
    });
