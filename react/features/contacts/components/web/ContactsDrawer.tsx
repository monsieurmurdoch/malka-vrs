/* eslint-disable react/jsx-no-bind */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import {
    contactsAPI,
    ContactEntry,
    ContactGroup,
    BlockedContact,
    DuplicateSet,
    ImportResult
} from '../../contactsAPI';
import {
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
    setSearch,
    setTab,
    setGroupFilter,
    clearError
} from '../../actions';
import type { ContactsState } from '../../types';
import ContactTimeline from './ContactTimeline';
import ContactNotes from './ContactNotes';
import GoogleContactsImport from './GoogleContactsImport';
import { queueService } from '../../../interpreter-queue/InterpreterQueueService';

// ============================================
// AVATAR HELPER
// ============================================

const AVATAR_COLORS = [
    '#4A90D9', '#7B68EE', '#E74C3C', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB', '#E91E63'
];

function getInitials(name: string): string {
    return (name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function pickAvatarColor(name: string, explicit?: string | null): string {
    if (explicit) return explicit;
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);

    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================
// STYLES
// ============================================

const useStyles = makeStyles()(theme => ({
    drawer: {
        width: '100%',
        maxWidth: '480px',
        backgroundColor: theme.palette.ui01,
        borderRadius: theme.shape.borderRadius,
        border: `1px solid ${theme.palette.ui03}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '560px'
    },

    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02
    },

    headerTitle: {
        fontSize: '16px',
        fontWeight: 600,
        color: theme.palette.text01
    },

    headerActions: {
        display: 'flex',
        gap: '6px',
        alignItems: 'center'
    },

    headerBtn: {
        background: 'none',
        border: `1px solid ${theme.palette.ui03}`,
        borderRadius: '6px',
        color: theme.palette.text01,
        fontSize: '12px',
        padding: '4px 10px',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: theme.palette.ui03
        }
    },

    headerBtnActive: {
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        borderColor: theme.palette.action01
    },

    searchBox: {
        padding: '8px 16px',
        borderBottom: `1px solid ${theme.palette.ui03}`
    },

    searchInput: {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02,
        color: theme.palette.text01,
        fontSize: '14px',
        outline: 'none',
        '&:focus': {
            borderColor: theme.palette.action01
        }
    },

    body: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0'
    },

    // Section headers for alphabetical grouping
    sectionHeader: {
        padding: '4px 16px',
        fontSize: '11px',
        fontWeight: 700,
        color: theme.palette.text03,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        position: 'sticky',
        top: 0,
        backgroundColor: theme.palette.ui01,
        zIndex: 1
    },

    contactRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 16px',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: theme.palette.ui02
        }
    },

    avatar: {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 600,
        flexShrink: 0
    },

    contactInfo: {
        flex: 1,
        minWidth: 0
    },

    contactName: {
        fontSize: '14px',
        fontWeight: 500,
        color: theme.palette.text01,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },

    contactSub: {
        fontSize: '12px',
        color: theme.palette.text03,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    },

    favoriteStar: {
        fontSize: '14px',
        flexShrink: 0,
        cursor: 'pointer'
    },

    contactActions: {
        display: 'flex',
        gap: '4px',
        flexShrink: 0
    },

    iconBtn: {
        background: 'none',
        border: 'none',
        color: theme.palette.text03,
        cursor: 'pointer',
        padding: '4px',
        borderRadius: '4px',
        fontSize: '14px',
        '&:hover': {
            backgroundColor: theme.palette.ui03,
            color: theme.palette.text01
        }
    },

    emptyState: {
        padding: '32px 16px',
        textAlign: 'center',
        color: theme.palette.text03,
        fontSize: '14px'
    },

    // Contact detail card
    detailOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.palette.ui01,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10
    },

    detailHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        borderBottom: `1px solid ${theme.palette.ui03}`
    },

    detailAvatar: {
        width: '52px',
        height: '52px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: '18px',
        fontWeight: 600
    },

    detailName: {
        fontSize: '18px',
        fontWeight: 600,
        color: theme.palette.text01
    },

    detailOrg: {
        fontSize: '13px',
        color: theme.palette.text03
    },

    detailBody: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px'
    },

    detailSection: {
        marginBottom: '16px'
    },

    detailSectionTitle: {
        fontSize: '12px',
        fontWeight: 700,
        color: theme.palette.text03,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '8px'
    },

    detailField: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        fontSize: '14px'
    },

    detailLabel: {
        color: theme.palette.text03
    },

    detailValue: {
        color: theme.palette.text01,
        fontWeight: 500
    },

    callRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontSize: '13px',
        borderBottom: `1px solid ${theme.palette.ui03}`
    },

    // Groups panel
    groupChip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '14px',
        fontSize: '12px',
        fontWeight: 500,
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02,
        color: theme.palette.text01,
        cursor: 'pointer',
        margin: '2px'
    },

    groupChipActive: {
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        borderColor: theme.palette.action01
    },

    // Import panel
    importDropZone: {
        border: `2px dashed ${theme.palette.ui03}`,
        borderRadius: '8px',
        padding: '24px',
        textAlign: 'center',
        cursor: 'pointer',
        marginBottom: '12px',
        '&:hover': {
            borderColor: theme.palette.action01
        }
    },

    importResult: {
        fontSize: '13px',
        padding: '8px',
        borderRadius: '6px',
        marginBottom: '8px'
    },

    importSuccess: {
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        color: '#2ECC71'
    },

    importError: {
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        color: '#E74C3C'
    },

    // Duplicate panel
    dupSet: {
        padding: '12px',
        marginBottom: '8px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02
    },

    dupField: {
        fontSize: '12px',
        color: theme.palette.text03,
        marginBottom: '6px'
    },

    dupContactRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 0'
    },

    dupRadio: {
        accentColor: theme.palette.action01
    },

    mergeBtn: {
        marginTop: '8px',
        padding: '6px 14px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '13px',
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 }
    },

    // Edit form
    editForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px'
    },

    formField: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },

    formLabel: {
        fontSize: '12px',
        fontWeight: 600,
        color: theme.palette.text03
    },

    formInput: {
        padding: '8px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02,
        color: theme.palette.text01,
        fontSize: '14px',
        outline: 'none',
        '&:focus': {
            borderColor: theme.palette.action01
        }
    },

    saveBtn: {
        padding: '8px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 }
    },

    cancelBtn: {
        padding: '8px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: 'transparent',
        color: theme.palette.text01,
        fontSize: '14px',
        cursor: 'pointer'
    },

    // Blocked contact row
    blockedRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: `1px solid ${theme.palette.ui03}`
    },

    blockedInfo: {
        fontSize: '14px',
        color: theme.palette.text01
    },

    blockedReason: {
        fontSize: '12px',
        color: theme.palette.text03
    },

    unblockBtn: {
        padding: '4px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: 'transparent',
        color: theme.palette.text01,
        fontSize: '12px',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: theme.palette.ui03
        }
    },

    loadingSpinner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: theme.palette.text03,
        fontSize: '14px'
    },

    groupFilterRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        padding: '6px 16px',
        borderBottom: `1px solid ${theme.palette.ui03}`
    }
}));

// ============================================
// TABS
// ============================================

type Tab = 'all' | 'favorites' | 'groups' | 'import' | 'duplicates' | 'blocked';

// ============================================
// MAIN COMPONENT
// ============================================

interface Props {
    onClose?: () => void;
    onInviteContact?: (contact: ContactEntry) => void;
    showInviteActions?: boolean;
}

export default function ContactsDrawer({ onClose, onInviteContact, showInviteActions }: Props) {
    const { classes, cx } = useStyles();
    const dispatch = useDispatch();

    // Redux state
    const {
        contacts,
        groups,
        blocked,
        isLoading: loading,
        error,
        search,
        activeTab,
        selectedGroupId,
        contactDetail
    } = useSelector((state: any) => state['features/contacts'] as ContactsState);

    // Local-only UI state
    const [addingNew, setAddingNew] = useState(false);
    const [editingContact, setEditingContact] = useState<ContactEntry | null>(null);
    const [duplicates, setDuplicates] = useState<DuplicateSet[]>([]);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importing, setImporting] = useState(false);

    // ============================================
    // DATA LOADING
    // ============================================

    useEffect(() => {
        dispatch(loadContacts(
            search || undefined,
            selectedGroupId || undefined,
            activeTab === 'favorites' ? true : undefined
        ) as any);
    }, [search, selectedGroupId, activeTab === 'favorites', dispatch]);

    useEffect(() => {
        dispatch(loadGroups() as any);
    }, [dispatch]);

    useEffect(() => {
        if (activeTab === 'blocked') {
            dispatch(loadBlocked() as any);
        }
    }, [activeTab, dispatch]);

    useEffect(() => {
        if (activeTab === 'duplicates') {
            contactsAPI.findDuplicates().then(data => setDuplicates(data.duplicates || [])).catch(() => {});
        }
    }, [activeTab]);

    // ============================================
    // ALPHABETICAL GROUPING
    // ============================================

    const grouped = useMemo(() => {
        const map = new Map<string, ContactEntry[]>();
        for (const c of contacts) {
            const letter = (c.name?.[0] || '#').toUpperCase();
            if (!map.has(letter)) map.set(letter, []);
            map.get(letter)!.push(c);
        }

        return Array.from(map.entries()).sort(([ a ], [ b ]) => a.localeCompare(b));
    }, [contacts]);

    // ============================================
    // ACTIONS
    // ============================================

    const handleToggleFavorite = useCallback((e: React.MouseEvent, contact: ContactEntry) => {
        e.stopPropagation();
        dispatch(toggleFavorite(contact.id, contact.is_favorite) as any);
    }, [dispatch]);

    const handleDelete = useCallback(async (contactId: string) => {
        if (!confirm('Delete this contact?')) return;
        dispatch(deleteContactAction(contactId) as any);
        dispatch(closeContactDetail() as any);
    }, [dispatch]);

    const handleMerge = useCallback(async (primaryId: string, secondaryIds: string[]) => {
        try {
            await contactsAPI.merge(primaryId, secondaryIds);
            contactsAPI.findDuplicates().then(data => setDuplicates(data.duplicates || [])).catch(() => {});
            dispatch(loadContacts() as any);
        } catch {
            // Silently fail
        }
    }, [dispatch]);

    const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);
        try {
            const text = await file.text();
            let rows: Array<Record<string, string>> = [];

            if (file.name.endsWith('.csv')) {
                rows = parseCSV(text);
            } else if (file.name.endsWith('.vcf') || file.name.endsWith('.vcard')) {
                rows = parseVCard(text);
            } else {
                throw new Error('Unsupported file type. Use .csv or .vcf');
            }

            const result = await contactsAPI.import(rows);
            setImportResult(result);
            dispatch(loadContacts() as any);
            dispatch(loadGroups() as any);
        } catch (err) {
            setImportResult({
                imported: 0,
                skipped: 0,
                errors: [{ name: 'File', error: err instanceof Error ? err.message : 'Import failed' }]
            });
        } finally {
            setImporting(false);
        }
    }, [dispatch]);

    const handleUnblock = useCallback(async (blockId: string) => {
        try {
            await contactsAPI.unblock(blockId);
            dispatch(loadBlocked() as any);
        } catch {
            // Silently fail
        }
    }, [dispatch]);

    const handleOpenDetail = useCallback((contact: ContactEntry) => {
        dispatch(loadContactDetail(contact.id) as any);
    }, [dispatch]);

    const handleDial = useCallback((e: React.MouseEvent, contact: ContactEntry) => {
        e.stopPropagation();
        if (!contact.phone_number) return;
        if (queueService?.isConnected()) {
            queueService.sendP2PCall(contact.phone_number);
        }
    }, []);

    // ============================================
    // RENDER
    // ============================================

    const tabs: { key: Tab; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'favorites', label: 'Favorites' },
        { key: 'groups', label: 'Groups' },
        { key: 'import', label: 'Import' },
        { key: 'duplicates', label: 'Duplicates' },
        { key: 'blocked', label: 'Blocked' }
    ];

    return (
        <div className = { classes.drawer }>
            {/* Header */}
            <div className = { classes.header }>
                <span className = { classes.headerTitle }>Contacts</span>
                <div className = { classes.headerActions }>
                    {onClose && (
                        <button
                            className = { classes.headerBtn }
                            onClick = { onClose }
                            type = 'button'>Close</button>
                    )}
                    <button
                        className = { cx(classes.headerBtn, classes.headerBtnActive) }
                        onClick = { () => { setAddingNew(true); setEditingContact(null); } }
                        type = 'button'>+ Add</button>
                </div>
            </div>

            {/* Tab bar */}
            <div style = {{
                display: 'flex',
                overflowX: 'auto',
                padding: '6px 16px',
                gap: '4px',
                borderBottom: `1px solid var(--border-color, rgba(255,255,255,0.1))`
            }}>
                {tabs.map(tab => (
                    <button
                        className = { cx(classes.headerBtn, activeTab === tab.key && classes.headerBtnActive) }
                        key = { tab.key }
                        onClick = { () => dispatch(setTab(tab.key) as any) }
                        type = 'button'>{tab.label}</button>
                ))}
            </div>

            {/* Search */}
            {(activeTab === 'all' || activeTab === 'favorites') && (
                <div className = { classes.searchBox }>
                    <input
                        className = { classes.searchInput }
                        onChange = { e => dispatch(setSearch(e.target.value) as any) }
                        placeholder = 'Search contacts...'
                        type = 'text'
                        value = { search } />
                </div>
            )}

            {/* Group filter chips */}
            {activeTab === 'all' && groups.length > 0 && (
                <div className = { classes.groupFilterRow }>
                    <span
                        className = { cx(classes.groupChip, !selectedGroupId && classes.groupChipActive) }
                        onClick = { () => dispatch(setGroupFilter(null) as any) }
                        role = 'button'>All</span>
                    {groups.map(g => (
                        <span
                            className = { cx(classes.groupChip, selectedGroupId === g.id && classes.groupChipActive) }
                            key = { g.id }
                            onClick = { () => dispatch(setGroupFilter(g.id === selectedGroupId ? null : g.id) as any) }
                            role = 'button'>
                            {g.name} ({g.member_count})
                        </span>
                    ))}
                </div>
            )}

            {/* Body */}
            <div className = { classes.body }>
                {/* ---- Contact list (All / Favorites) ---- */}
                {(activeTab === 'all' || activeTab === 'favorites') && !contactDetail && !addingNew && (
                    <>
                        {loading && <div className = { classes.loadingSpinner }>Loading contacts...</div>}
                        {error && <div className = { classes.emptyState }>{error}</div>}
                        {!loading && !error && contacts.length === 0 && (
                            <div className = { classes.emptyState }>
                                {search ? 'No contacts match your search.' : 'No contacts yet. Add one or import from a file.'}
                            </div>
                        )}
                        {!loading && grouped.map(([letter, items]) => (
                            <div key = { letter }>
                                <div className = { classes.sectionHeader }>{letter}</div>
                                {items.map(c => (
                                    <div
                                        className = { classes.contactRow }
                                        key = { c.id }
                                        onClick = { () => handleOpenDetail(c) }
                                        role = 'button'>
                                        <div
                                            className = { classes.avatar }
                                            style = {{ backgroundColor: pickAvatarColor(c.name, c.avatar_color) }}>
                                            {getInitials(c.name)}
                                        </div>
                                        <div className = { classes.contactInfo }>
                                            <div className = { classes.contactName }>{c.name}</div>
                                            <div className = { classes.contactSub }>
                                                {c.phone_number || c.email || c.organization || 'No details'}
                                            </div>
                                        </div>
                                        <span
                                            className = { classes.favoriteStar }
                                            onClick = { e => handleToggleFavorite(e, c) }
                                            role = 'button'>{c.is_favorite ? '\u2605' : '\u2606'}</span>
                                        {showInviteActions && onInviteContact && (
                                            <div className = { classes.contactActions }>
                                                {c.phone_number && (
                                                    <button
                                                        aria-label = { `Call ${c.name}` }
                                                        className = { classes.iconBtn }
                                                        onClick = { e => handleDial(e, c) }
                                                        title = 'Call'
                                                        type = 'button'>Call</button>
                                                )}
                                                <button
                                                    className = { classes.iconBtn }
                                                    onClick = { e => { e.stopPropagation(); onInviteContact(c); } }
                                                    title = 'Invite to room'
                                                    type = 'button'>Invite</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </>
                )}

                {/* ---- Contact detail card ---- */}
                {contactDetail && (
                    <ContactDetail
                        contact = { contactDetail.contact }
                        timeline = { contactDetail.timeline || [] }
                        notes = { contactDetail.notes || [] }
                        groups = { groups }
                        onBack = { () => dispatch(closeContactDetail() as any) }
                        onDelete = { handleDelete }
                        onEdit = { c => { setEditingContact(c); setAddingNew(false); } }
                        onToggleFavorite = { handleToggleFavorite }
                        onAddNote = { (content: string) => dispatch(addNote(contactDetail.contact.id, content) as any) }
                        onUpdateNote = { (noteId: string, content: string) => dispatch(updateNote(contactDetail.contact.id, noteId, content) as any) }
                        onDeleteNote = { (noteId: string) => dispatch(deleteNote(contactDetail.contact.id, noteId) as any) } />
                )}

                {/* ---- Add / Edit form ---- */}
                {(addingNew || editingContact) && (
                    <ContactEditForm
                        contact = { editingContact }
                        groups = { groups }
                        onCancel = { () => { setAddingNew(false); setEditingContact(null); } }
                        onSaved = { () => {
                            setAddingNew(false);
                            setEditingContact(null);
                            dispatch(loadContacts() as any);
                            dispatch(loadGroups() as any);
                        } } />
                )}

                {/* ---- Groups panel ---- */}
                {activeTab === 'groups' && (
                    <GroupsPanel
                        groups = { groups }
                        onRefresh = { () => dispatch(loadGroups() as any) } />
                )}

                {/* ---- Import panel ---- */}
                {activeTab === 'import' && (
                    <div style = {{ padding: '16px' }}>
                        {/* Google Contacts import */}
                        <div style = {{ marginBottom: '16px', padding: '12px', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', borderRadius: '8px' }}>
                            <div className = { classes.detailSectionTitle }>Import from Google</div>
                            <GoogleContactsImport onImported = { () => { dispatch(loadContacts() as any); dispatch(loadGroups() as any); } } />
                        </div>

                        <div className = { classes.detailSectionTitle }>Import from File</div>
                        <div
                            className = { classes.importDropZone }
                            onClick = { () => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.csv,.vcf,.vcard';
                                input.onchange = (e: Event) => {
                                    const fe = e as unknown as React.ChangeEvent<HTMLInputElement>;
                                    handleImportFile(fe);
                                };
                                input.click();
                            } }
                            role = 'button'>
                            <p style = {{ color: 'var(--text-color, #fff)', fontSize: '14px' }}>
                                {importing ? 'Importing...' : 'Click to browse CSV or VCard files'}
                            </p>
                            <p style = {{ color: 'var(--text-muted, #888)', fontSize: '12px', marginTop: '4px' }}>
                                CSV columns: Name, Phone, Email, Organization<br />
                                VCard (.vcf) format also supported
                            </p>
                        </div>
                        {importResult && (
                            <div>
                                {importResult.imported > 0 && (
                                    <div className = { cx(classes.importResult, classes.importSuccess) }>
                                        Imported {importResult.imported} contact{importResult.imported > 1 ? 's' : ''}
                                    </div>
                                )}
                                {importResult.skipped > 0 && (
                                    <div className = { classes.importResult }>
                                        Skipped {importResult.skipped} duplicate{importResult.skipped > 1 ? 's' : ''}
                                    </div>
                                )}
                                {importResult.errors.map((err: { name: string; error: string }, i: number) => (
                                    <div className = { cx(classes.importResult, classes.importError) } key = { i }>
                                        {err.name}: {err.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ---- Duplicates panel ---- */}
                {activeTab === 'duplicates' && (
                    <div style = {{ padding: '16px' }}>
                        {duplicates.length === 0 ? (
                            <div className = { classes.emptyState }>No duplicate contacts found.</div>
                        ) : (
                            duplicates.map((dup, di) => (
                                <DuplicateSetCard
                                    dup = { dup }
                                    key = { di }
                                    onMerge = { handleMerge } />
                            ))
                        )}
                    </div>
                )}

                {/* ---- Blocked panel ---- */}
                {activeTab === 'blocked' && (
                    <div>
                        {blocked.length === 0 ? (
                            <div className = { classes.emptyState }>No blocked contacts.</div>
                        ) : (
                            blocked.map(b => (
                                <div className = { classes.blockedRow } key = { b.id }>
                                    <div>
                                        <div className = { classes.blockedInfo }>
                                            {b.blocked_phone || b.blocked_email || b.blocked_client_id}
                                        </div>
                                        {b.reason && <div className = { classes.blockedReason }>{b.reason}</div>}
                                    </div>
                                    <button
                                        className = { classes.unblockBtn }
                                        onClick = { () => handleUnblock(b.id) }
                                        type = 'button'>Unblock</button>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface ContactDetailProps {
    contact: ContactEntry;
    timeline: Array<{ type: 'call' | 'missed_call' | 'voicemail' | 'note'; id: string; timestamp: string; data: Record<string, any> }>;
    notes: Array<{ id: string; contact_id: string; author_id: string; content: string; created_at: string; updated_at: string }>;
    groups: ContactGroup[];
    onBack: () => void;
    onDelete: (id: string) => void;
    onEdit: (c: ContactEntry) => void;
    onToggleFavorite: (e: React.MouseEvent, c: ContactEntry) => void;
    onAddNote: (content: string) => Promise<void>;
    onUpdateNote: (noteId: string, content: string) => Promise<void>;
    onDeleteNote: (noteId: string) => Promise<void>;
}

function ContactDetail({ contact, timeline, notes, groups, onBack, onDelete, onEdit, onToggleFavorite, onAddNote, onUpdateNote, onDeleteNote }: ContactDetailProps) {
    const { classes } = useStyles();
    const contactGroups = (contact.group_ids || '').split(',').filter(Boolean);

    return (
        <div style = {{ padding: '0' }}>
            {/* Back button */}
            <div style = {{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.1))'
            }}>
                <button
                    className = { classes.headerBtn }
                    onClick = { onBack }
                    style = {{ marginBottom: 0 }}
                    type = 'button'>Back</button>
            </div>

            {/* Avatar + name */}
            <div style = {{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px'
            }}>
                <div
                    className = { classes.detailAvatar }
                    style = {{ backgroundColor: pickAvatarColor(contact.name, contact.avatar_color) }}>
                    {getInitials(contact.name)}
                </div>
                <div style = {{ flex: 1 }}>
                    <div className = { classes.detailName }>{contact.name}</div>
                    {contact.organization && <div className = { classes.detailOrg }>{contact.organization}</div>}
                </div>
                <span
                    className = { classes.favoriteStar }
                    onClick = { e => onToggleFavorite(e, contact) }
                    role = 'button'
                    style = {{ fontSize: '20px', cursor: 'pointer' }}>
                    {contact.is_favorite ? '\u2605' : '\u2606'}
                </span>
            </div>

            {/* Contact info */}
            <div style = {{ padding: '0 16px' }}>
                <div className = { classes.detailSection }>
                    <div className = { classes.detailSectionTitle }>Contact Info</div>
                    {contact.phone_number && (
                        <div className = { classes.detailField }>
                            <span className = { classes.detailLabel }>Phone</span>
                            <span className = { classes.detailValue }>{contact.phone_number}</span>
                        </div>
                    )}
                    {contact.email && (
                        <div className = { classes.detailField }>
                            <span className = { classes.detailLabel }>Email</span>
                            <span className = { classes.detailValue }>{contact.email}</span>
                        </div>
                    )}
                    <div className = { classes.detailField }>
                        <span className = { classes.detailLabel }>Last Call</span>
                        <span className = { classes.detailValue }>{formatDate(contact.last_call_date)}</span>
                    </div>
                    <div className = { classes.detailField }>
                        <span className = { classes.detailLabel }>Added</span>
                        <span className = { classes.detailValue }>{formatDate(contact.created_at)}</span>
                    </div>
                </div>

                {/* Groups */}
                {contactGroups.length > 0 && (
                    <div className = { classes.detailSection }>
                        <div className = { classes.detailSectionTitle }>Groups</div>
                        <div style = {{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {(contact.group_names || '').split(',').filter(Boolean).map((name: string, i: number) => (
                                <span className = { classes.groupChip } key = { i }>{name}</span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Notes */}
                {contact.notes && (
                    <div className = { classes.detailSection }>
                        <div className = { classes.detailSectionTitle }>Description</div>
                        <div style = {{ fontSize: '14px', color: 'var(--text-color, #fff)' }}>{contact.notes}</div>
                    </div>
                )}

                {/* Timeline */}
                <div className = { classes.detailSection }>
                    <div className = { classes.detailSectionTitle }>Timeline</div>
                    <ContactTimeline timeline = { timeline } />
                </div>

                {/* Timestamped Notes */}
                <div className = { classes.detailSection }>
                    <div className = { classes.detailSectionTitle }>Notes</div>
                    <ContactNotes
                        notes = { notes }
                        onAdd = { onAddNote }
                        onDelete = { onDeleteNote }
                        onUpdate = { onUpdateNote } />
                </div>
            </div>

            {/* Actions */}
            <div style = {{
                display: 'flex',
                gap: '8px',
                padding: '12px 16px',
                borderTop: '1px solid var(--border-color, rgba(255,255,255,0.1))'
            }}>
                {contact.phone_number && (
                    <button
                        aria-label = { `Call ${contact.name}` }
                        className = { classes.saveBtn }
                        onClick = { e => {
                            e.stopPropagation();
                            if (queueService?.isConnected()) {
                                queueService.sendP2PCall(contact.phone_number!);
                            }
                        } }
                        style = {{ flex: 1 }}
                        type = 'button'>Call</button>
                )}
                <button
                    className = { classes.saveBtn }
                    onClick = { () => onEdit(contact) }
                    style = {{ flex: 1 }}
                    type = 'button'>Edit</button>
                <button
                    className = { classes.cancelBtn }
                    onClick = { () => onDelete(contact.id) }
                    style = {{
                        flex: 1,
                        color: '#E74C3C',
                        borderColor: '#E74C3C'
                    }}
                    type = 'button'>Delete</button>
            </div>
        </div>
    );
}

// ============================================
// EDIT / ADD FORM
// ============================================

interface ContactEditFormProps {
    contact: ContactEntry | null;
    groups: ContactGroup[];
    onCancel: () => void;
    onSaved: () => void;
}

function ContactEditForm({ contact, groups, onCancel, onSaved }: ContactEditFormProps) {
    const { classes, cx } = useStyles();
    const isEdit = !!contact;

    const [name, setName] = useState(contact?.name || '');
    const [phone, setPhone] = useState(contact?.phone_number || '');
    const [email, setEmail] = useState(contact?.email || '');
    const [org, setOrg] = useState(contact?.organization || '');
    const [notes, setNotes] = useState(contact?.notes || '');
    const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
        if (!contact?.group_ids) return [];
        return contact.group_ids.split(',').filter(Boolean);
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            if (isEdit && contact) {
                await contactsAPI.update(contact.id, {
                    name,
                    phone_number: phone,
                    email,
                    organization: org,
                    notes,
                    groupIds: selectedGroups
                });
            } else {
                await contactsAPI.create({
                    name,
                    phone_number: phone,
                    email,
                    organization: org,
                    notes,
                    groupIds: selectedGroups
                });
            }
            onSaved();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const toggleGroup = (gid: string) => {
        setSelectedGroups(prev =>
            prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid]
        );
    };

    return (
        <div className = { classes.editForm }>
            <div style = {{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
            }}>
                <span style = {{ fontSize: '16px', fontWeight: 600, color: 'var(--text-color, #fff)' }}>
                    {isEdit ? 'Edit Contact' : 'New Contact'}
                </span>
                <button
                    className = { classes.headerBtn }
                    onClick = { onCancel }
                    type = 'button'>Cancel</button>
            </div>

            <div className = { classes.formField }>
                <label className = { classes.formLabel }>Name *</label>
                <input
                    className = { classes.formInput }
                    onChange = { e => setName(e.target.value) }
                    type = 'text'
                    value = { name } />
            </div>
            <div className = { classes.formField }>
                <label className = { classes.formLabel }>Phone</label>
                <input
                    className = { classes.formInput }
                    onChange = { e => setPhone(e.target.value) }
                    type = 'tel'
                    value = { phone } />
            </div>
            <div className = { classes.formField }>
                <label className = { classes.formLabel }>Email</label>
                <input
                    className = { classes.formInput }
                    onChange = { e => setEmail(e.target.value) }
                    type = 'email'
                    value = { email } />
            </div>
            <div className = { classes.formField }>
                <label className = { classes.formLabel }>Organization</label>
                <input
                    className = { classes.formInput }
                    onChange = { e => setOrg(e.target.value) }
                    type = 'text'
                    value = { org } />
            </div>
            <div className = { classes.formField }>
                <label className = { classes.formLabel }>Notes</label>
                <textarea
                    className = { classes.formInput }
                    onChange = { e => setNotes(e.target.value) }
                    rows = { 2 }
                    value = { notes } />
            </div>

            {groups.length > 0 && (
                <div className = { classes.formField }>
                    <label className = { classes.formLabel }>Groups</label>
                    <div style = {{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {groups.map(g => (
                            <span
                                className = { cx(classes.groupChip, selectedGroups.includes(g.id) && classes.groupChipActive) }
                                key = { g.id }
                                onClick = { () => toggleGroup(g.id) }
                                role = 'button'>{g.name}</span>
                        ))}
                    </div>
                </div>
            )}

            <button
                className = { classes.saveBtn }
                disabled = { saving || !name.trim() }
                onClick = { handleSave }
                type = 'button'>
                {saving ? 'Saving...' : isEdit ? 'Update Contact' : 'Add Contact'}
            </button>
        </div>
    );
}

// ============================================
// GROUPS PANEL
// ============================================

interface GroupsPanelProps {
    groups: ContactGroup[];
    onRefresh: () => void;
}

function GroupsPanel({ groups, onRefresh }: GroupsPanelProps) {
    const { classes, cx } = useStyles();
    const [newGroupName, setNewGroupName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!newGroupName.trim()) return;
        setCreating(true);
        try {
            await contactsAPI.createGroup({ name: newGroupName.trim() });
            setNewGroupName('');
            onRefresh();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to create group');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (gid: string) => {
        if (!confirm('Delete this group?')) return;
        try {
            await contactsAPI.deleteGroup(gid);
            onRefresh();
        } catch {
            // Silently fail
        }
    };

    return (
        <div style = {{ padding: '16px' }}>
            <div className = { classes.detailSectionTitle }>Your Groups</div>
            {groups.length === 0 && (
                <div className = { classes.emptyState }>No groups yet.</div>
            )}
            {groups.map(g => (
                <div
                    className = { classes.blockedRow }
                    key = { g.id }
                    style = {{ padding: '10px 12px' }}>
                    <div>
                        <div className = { classes.blockedInfo }>
                            {g.color && (
                                <span style = {{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    backgroundColor: g.color,
                                    marginRight: '6px'
                                }} />
                            )}
                            {g.name}
                        </div>
                        <div className = { classes.blockedReason }>{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                        className = { classes.unblockBtn }
                        onClick = { () => handleDelete(g.id) }
                        type = 'button'>Delete</button>
                </div>
            ))}

            {/* Create new group */}
            <div style = {{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <input
                    className = { classes.formInput }
                    onChange = { e => setNewGroupName(e.target.value) }
                    onKeyDown = { e => e.key === 'Enter' && handleCreate() }
                    placeholder = 'New group name...'
                    style = {{ flex: 1 }}
                    type = 'text'
                    value = { newGroupName } />
                <button
                    className = { cx(classes.saveBtn, creating && 'disabled') }
                    disabled = { creating || !newGroupName.trim() }
                    onClick = { handleCreate }
                    style = {{ padding: '8px 16px' }}
                    type = 'button'>
                    {creating ? '...' : 'Add'}
                </button>
            </div>
        </div>
    );
}

// ============================================
// DUPLICATE SET CARD
// ============================================

interface DuplicateSetCardProps {
    dup: DuplicateSet;
    onMerge: (primaryId: string, secondaryIds: string[]) => void;
}

function DuplicateSetCard({ dup, onMerge }: DuplicateSetCardProps) {
    const { classes } = useStyles();
    const [primaryId, setPrimaryId] = useState(dup.contacts[0]?.id || '');

    const secondaryIds = dup.contacts.filter(c => c.id !== primaryId).map(c => c.id);

    return (
        <div className = { classes.dupSet }>
            <div className = { classes.dupField }>
                Duplicate {dup.field}: {dup.value}
            </div>
            {dup.contacts.map(c => (
                <div className = { classes.dupContactRow } key = { c.id }>
                    <input
                        checked = { primaryId === c.id }
                        className = { classes.dupRadio }
                        name = { `dup-${dup.value}` }
                        onChange = { () => setPrimaryId(c.id) }
                        type = 'radio' />
                    <span style = {{ fontSize: '14px', color: 'var(--text-color, #fff)' }}>
                        {c.name} {c.phone_number ? `(${c.phone_number})` : ''} {c.email ? `<${c.email}>` : ''}
                    </span>
                </div>
            ))}
            <button
                className = { classes.mergeBtn }
                onClick = { () => onMerge(primaryId, secondaryIds) }
                type = 'button'>
                Merge {secondaryIds.length} into selected
            </button>
        </div>
    );
}

// ============================================
// CSV / VCard PARSERS
// ============================================

function parseCSV(text: string): Array<Record<string, string>> {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
    const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));
    const orgIdx = headers.findIndex(h => h.includes('org') || h.includes('company'));

    if (nameIdx === -1) return [];

    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

        return {
            name: cols[nameIdx] || '',
            phone_number: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
            email: emailIdx >= 0 ? cols[emailIdx] || '' : '',
            organization: orgIdx >= 0 ? cols[orgIdx] || '' : ''
        };
    }).filter(r => r.name);
}

function parseVCard(text: string): Array<Record<string, string>> {
    const contacts: Array<Record<string, string>> = [];
    const blocks = text.split('BEGIN:VCARD');

    for (const block of blocks) {
        if (!block.includes('END:VCARD')) continue;
        const entry: Record<string, string> = {};

        for (const line of block.split(/\r?\n/)) {
            const lower = line.toLowerCase();
            if (lower.startsWith('fn:') || lower.startsWith('fn;')) {
                entry.name = line.replace(/^fn[^:]*:/i, '').trim();
            } else if (lower.startsWith('tel:') || lower.startsWith('tel;')) {
                entry.phone_number = line.replace(/^tel[^:]*:/i, '').trim();
            } else if (lower.startsWith('email:') || lower.startsWith('email;')) {
                entry.email = line.replace(/^email[^:]*:/i, '').trim();
            } else if (lower.startsWith('org:')) {
                entry.organization = line.replace(/^org:/i, '').trim();
            }
        }

        if (entry.name) {
            contacts.push(entry);
        }
    }

    return contacts;
}
