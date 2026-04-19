/**
 * GoogleContactsImport — OAuth popup + import preview.
 */

import React, { useCallback, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import { contactsAPI, ContactEntry } from '../../contactsAPI';

interface Props {
    onImported: () => void;
}

const useStyles = makeStyles()(theme => ({
    container: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    },

    connectBtn: {
        padding: '10px 16px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: '#4285F4',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 },
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
    },

    statusText: {
        fontSize: '13px',
        color: theme.palette.text03
    },

    previewList: {
        maxHeight: '300px',
        overflowY: 'auto',
        border: `1px solid ${theme.palette.ui03}`,
        borderRadius: '6px'
    },

    previewRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderBottom: `1px solid ${theme.palette.ui03}`,
        fontSize: '13px',
        '&:last-child': { borderBottom: 'none' }
    },

    previewCheck: {
        accentColor: theme.palette.action01
    },

    previewName: {
        color: theme.palette.text01,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const
    },

    previewSub: {
        color: theme.palette.text03,
        fontSize: '12px'
    },

    importBtn: {
        padding: '8px 14px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '13px',
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 },
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
    },

    resultText: {
        fontSize: '13px',
        padding: '8px',
        borderRadius: '6px',
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        color: '#2ECC71'
    },

    errorText: {
        fontSize: '13px',
        padding: '8px',
        borderRadius: '6px',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        color: '#E74C3C'
    }
}));

interface GoogleContact {
    name: string;
    email: string | null;
    phone_number: string | null;
    organization: string | null;
    _googleResourceName: string;
}

export default function GoogleContactsImport({ onImported }: Props) {
    const { classes } = useStyles();
    const [status, setStatus] = useState<'idle' | 'connecting' | 'fetching' | 'preview' | 'importing' | 'done' | 'error'>('idle');
    const [contacts, setContacts] = useState<GoogleContact[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [error, setError] = useState('');
    const [result, setResult] = useState('');

    const handleConnect = useCallback(async () => {
        setStatus('connecting');
        setError('');
        try {
            const { url } = await contactsAPI.googleAuthUrl();
            const popup = window.open(url, 'google-contacts-auth', 'width=500,height=600');

            // Poll for popup close
            const poll = setInterval(() => {
                if (popup?.closed) {
                    clearInterval(poll);
                    setStatus('idle');
                }
            }, 500);

            // Listen for popup close to trigger fetch
            // The popup calls window.close() after successful OAuth
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start Google auth');
            setStatus('error');
        }
    }, []);

    const handleFetch = useCallback(async () => {
        setStatus('fetching');
        setError('');
        try {
            const data = await contactsAPI.googleFetch();
            setContacts((data.contacts || []) as GoogleContact[]);
            setSelected(new Set(data.contacts.map((_: any, i: number) => i)));
            setStatus('preview');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch Google contacts');
            setStatus('error');
        }
    }, []);

    const toggleSelected = useCallback((idx: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }

            return next;
        });
    }, []);

    const handleImport = useCallback(async () => {
        if (selected.size === 0) return;
        setStatus('importing');
        try {
            const toImport = contacts.filter((_, i) => selected.has(i));
            const res = await contactsAPI.googleImport(toImport);
            setResult(`Imported ${res.imported} contact${res.imported !== 1 ? 's' : ''}${res.skipped ? `, skipped ${res.skipped} duplicate${res.skipped !== 1 ? 's' : ''}` : ''}`);
            setStatus('done');
            onImported();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
            setStatus('error');
        }
    }, [contacts, selected, onImported]);

    const selectAll = useCallback(() => {
        setSelected(new Set(contacts.map((_, i) => i)));
    }, [contacts]);

    const selectNone = useCallback(() => {
        setSelected(new Set());
    }, []);

    return (
        <div className = { classes.container }>
            {status === 'idle' && (
                <>
                    <button
                        className = { classes.connectBtn }
                        onClick = { handleConnect }
                        type = 'button'>Connect Google Account</button>
                    <button
                        className = { classes.importBtn }
                        onClick = { handleFetch }
                        style = {{ backgroundColor: 'transparent', color: 'var(--text-color, #fff)', border: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}
                        type = 'button'>Fetch Contacts</button>
                </>
            )}

            {status === 'connecting' && (
                <div className = { classes.statusText }>Opening Google authorization...</div>
            )}

            {status === 'fetching' && (
                <div className = { classes.statusText }>Fetching contacts from Google...</div>
            )}

            {error && <div className = { classes.errorText }>{error}</div>}

            {status === 'preview' && (
                <>
                    <div style = {{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className = { classes.statusText }>
                            {contacts.length} contacts found ({selected.size} selected)
                        </span>
                        <div style = {{ display: 'flex', gap: '6px' }}>
                            <button
                                className = { classes.importBtn }
                                onClick = { selectAll }
                                style = {{ fontSize: '12px', padding: '4px 10px' }}
                                type = 'button'>All</button>
                            <button
                                className = { classes.importBtn }
                                onClick = { selectNone }
                                style = {{

                                    fontSize: '12px',
                                    padding: '4px 10px',
                                    backgroundColor: 'transparent',
                                    color: 'var(--text-color, #fff)',
                                    border: '1px solid var(--border-color, rgba(255,255,255,0.1))'
                                }}
                                type = 'button'>None</button>
                        </div>
                    </div>
                    <div className = { classes.previewList }>
                        {contacts.map((c, i) => (
                            <div className = { classes.previewRow } key = { i }>
                                <input
                                    checked = { selected.has(i) }
                                    className = { classes.previewCheck }
                                    onChange = { () => toggleSelected(i) }
                                    type = 'checkbox' />
                                <span className = { classes.previewName }>{c.name || 'Unnamed'}</span>
                                <span className = { classes.previewSub }>
                                    {c.phone_number || c.email || ''}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button
                        className = { classes.importBtn }
                        disabled = { selected.size === 0 }
                        onClick = { handleImport }
                        type = 'button'>
                        Import {selected.size} Contact{selected.size !== 1 ? 's' : ''}
                    </button>
                </>
            )}

            {status === 'importing' && (
                <div className = { classes.statusText }>Importing contacts...</div>
            )}

            {status === 'done' && (
                <div className = { classes.resultText }>{result}</div>
            )}
        </div>
    );
}
