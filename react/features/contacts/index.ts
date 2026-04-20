import './middleware';
import './reducer';

export { default as ContactsDrawer } from './components/web/ContactsDrawer';
export { default as ContactTimeline } from './components/web/ContactTimeline';
export { default as ContactNotes } from './components/web/ContactNotes';
export { default as GoogleContactsImport } from './components/web/GoogleContactsImport';
export { contactsAPI } from './contactsAPI';
export type {
    ContactEntry,
    ContactGroup,
    BlockedContact,
    DuplicateSet,
    ImportResult
} from './contactsAPI';
export type {
    ContactNote,
    TimelineItem,
    ContactDetail,
    ContactsState
} from './types';

// Redux actions
export {
    loadContacts,
    loadContactDetail,
    closeContactDetail,
    addContact,
    updateContactAction,
    deleteContactAction,
    toggleFavorite,
    addNote,
    updateNote,
    deleteNote,
    loadGroups,
    addGroup,
    deleteGroup,
    loadBlocked,
    syncContacts,
    importContacts,
    setSearch,
    setTab,
    setGroupFilter,
    clearError
} from './actions';
