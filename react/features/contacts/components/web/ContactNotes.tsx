/**
 * ContactNotes — add/edit/delete timestamped notes for a contact.
 */

import React, { useCallback, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import type { ContactNote } from '../../types';

interface Props {
    notes: ContactNote[];
    onAdd: (content: string) => Promise<void>;
    onUpdate: (noteId: string, content: string) => Promise<void>;
    onDelete: (noteId: string) => Promise<void>;
}

const useStyles = makeStyles()(theme => ({
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
    },

    noteItem: {
        padding: '10px 12px',
        borderRadius: '8px',
        backgroundColor: theme.palette.ui02,
        border: `1px solid ${theme.palette.ui03}`
    },

    noteContent: {
        fontSize: '14px',
        color: theme.palette.text01,
        marginBottom: '6px',
        whiteSpace: 'pre-wrap' as const,
        wordBreak: 'break-word' as const
    },

    noteMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px',
        color: theme.palette.text03
    },

    noteActions: {
        display: 'flex',
        gap: '6px'
    },

    noteActionBtn: {
        background: 'none',
        border: 'none',
        color: theme.palette.text03,
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '11px',
        '&:hover': {
            backgroundColor: theme.palette.ui03,
            color: theme.palette.text01
        }
    },

    addRow: {
        display: 'flex',
        gap: '8px',
        marginTop: '4px'
    },

    addInput: {
        flex: 1,
        padding: '8px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui02,
        color: theme.palette.text01,
        fontSize: '13px',
        outline: 'none',
        resize: 'none',
        '&:focus': {
            borderColor: theme.palette.action01
        }
    },

    addBtn: {
        padding: '8px 14px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '13px',
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        '&:hover': { opacity: 0.9 },
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
    },

    editArea: {
        width: '100%',
        padding: '8px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.action01}`,
        backgroundColor: theme.palette.ui02,
        color: theme.palette.text01,
        fontSize: '13px',
        outline: 'none',
        resize: 'none',
        marginBottom: '4px'
    },

    editBtnRow: {
        display: 'flex',
        gap: '6px',
        justifyContent: 'flex-end'
    },

    editBtn: {
        padding: '4px 10px',
        borderRadius: '4px',
        border: `1px solid ${theme.palette.ui03}`,
        background: 'none',
        color: theme.palette.text01,
        fontSize: '12px',
        cursor: 'pointer',
        '&:hover': { backgroundColor: theme.palette.ui03 }
    },

    saveEditBtn: {
        padding: '4px 10px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '12px',
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 }
    },

    emptyNotes: {
        color: theme.palette.text03,
        fontSize: '13px',
        padding: '4px 0'
    }
}));

function formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMins = Math.floor((now - then) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffMins / 1440);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ContactNotes({ notes, onAdd, onUpdate, onDelete }: Props) {
    const { classes } = useStyles();
    const [newContent, setNewContent] = useState('');
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const handleAdd = useCallback(async () => {
        if (!newContent.trim() || adding) return;
        setAdding(true);
        try {
            await onAdd(newContent.trim());
            setNewContent('');
        } finally {
            setAdding(false);
        }
    }, [newContent, adding, onAdd]);

    const startEdit = useCallback((note: ContactNote) => {
        setEditingId(note.id);
        setEditContent(note.content);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditContent('');
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId || !editContent.trim()) return;
        await onUpdate(editingId, editContent.trim());
        setEditingId(null);
        setEditContent('');
    }, [editingId, editContent, onUpdate]);

    const handleDelete = useCallback(async (noteId: string) => {
        await onDelete(noteId);
    }, [onDelete]);

    return (
        <div className = { classes.container }>
            {(!notes || notes.length === 0) && (
                <div className = { classes.emptyNotes }>No notes yet.</div>
            )}
            {notes.map(note => (
                <div className = { classes.noteItem } key = { note.id }>
                    {editingId === note.id ? (
                        <>
                            <textarea
                                className = { classes.editArea }
                                onChange = { e => setEditContent(e.target.value) }
                                rows = { 3 }
                                value = { editContent } />
                            <div className = { classes.editBtnRow }>
                                <button
                                    className = { classes.editBtn }
                                    onClick = { cancelEdit }
                                    type = 'button'>Cancel</button>
                                <button
                                    className = { classes.saveEditBtn }
                                    onClick = { saveEdit }
                                    type = 'button'>Save</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className = { classes.noteContent }>{note.content}</div>
                            <div className = { classes.noteMeta }>
                                <span>{formatRelativeTime(note.updated_at || note.created_at)}</span>
                                <div className = { classes.noteActions }>
                                    <button
                                        className = { classes.noteActionBtn }
                                        onClick = { () => startEdit(note) }
                                        type = 'button'>Edit</button>
                                    <button
                                        className = { classes.noteActionBtn }
                                        onClick = { () => handleDelete(note.id) }
                                        style = {{ color: '#E74C3C' }}
                                        type = 'button'>Delete</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ))}

            {/* Add note */}
            <div className = { classes.addRow }>
                <textarea
                    className = { classes.addInput }
                    disabled = { adding }
                    onChange = { e => setNewContent(e.target.value) }
                    onKeyDown = { e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleAdd();
                        }
                    } }
                    placeholder = 'Add a note...'
                    rows = { 2 }
                    value = { newContent } />
                <button
                    className = { classes.addBtn }
                    disabled = { adding || !newContent.trim() }
                    onClick = { handleAdd }
                    type = 'button'>
                    {adding ? '...' : 'Add'}
                </button>
            </div>
        </div>
    );
}
