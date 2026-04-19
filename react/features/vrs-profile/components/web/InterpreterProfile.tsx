/**
 * InterpreterProfile — editable profile + availability toggle + stats.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import { profileAPI, InterpreterProfileData, InterpreterStats } from '../../profileAPI';
import PasswordChangeForm from './PasswordChangeForm';

interface Props {
    onClose: () => void;
}

const useStyles = makeStyles()(theme => ({
    panel: {
        padding: '20px',
        maxWidth: '480px',
        width: '100%',
        overflowY: 'auto',
        height: '100%',

        '@media (max-width: 480px)': {
            padding: '16px 12px'
        }
    },

    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
    },

    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: theme.palette.text01,
        margin: 0
    },

    closeBtn: {
        background: 'none',
        border: 'none',
        color: theme.palette.text03,
        fontSize: '20px',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '4px',
        '&:hover': { backgroundColor: theme.palette.ui03 }
    },

    avatar: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        fontWeight: 700,
        color: '#fff',
        margin: '0 auto 16px'
    },

    statusBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: 600,
        margin: '0 auto 16px',
        textAlign: 'center' as const
    },

    statusOnline: {
        backgroundColor: 'rgba(46, 204, 113, 0.15)',
        color: '#2ECC71'
    },

    statusOffline: {
        backgroundColor: 'rgba(231, 76, 60, 0.15)',
        color: '#E74C3C'
    },

    section: {
        marginBottom: '20px',
        padding: '16px',
        borderRadius: '8px',
        backgroundColor: theme.palette.ui02,
        border: `1px solid ${theme.palette.ui03}`
    },

    sectionTitle: {
        fontSize: '13px',
        fontWeight: 600,
        color: theme.palette.text03,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '12px'
    },

    field: {
        marginBottom: '12px'
    },

    label: {
        display: 'block',
        fontSize: '12px',
        color: theme.palette.text03,
        marginBottom: '4px'
    },

    input: {
        width: '100%',
        padding: '8px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui01,
        color: theme.palette.text01,
        fontSize: '14px',
        outline: 'none',
        '&:focus': { borderColor: theme.palette.action01 }
    },

    langRow: {
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap' as const,
        marginBottom: '8px'
    },

    langTag: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '12px',
        backgroundColor: theme.palette.ui03,
        color: theme.palette.text01,
        fontSize: '13px'
    },

    langRemove: {
        background: 'none',
        border: 'none',
        color: theme.palette.text03,
        cursor: 'pointer',
        padding: '0 2px',
        fontSize: '14px',
        '&:hover': { color: '#E74C3C' }
    },

    langAdd: {
        display: 'flex',
        gap: '6px'
    },

    statsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',

        '@media (max-width: 360px)': {
            gridTemplateColumns: '1fr'
        }
    },

    statCard: {
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: theme.palette.ui01,
        textAlign: 'center' as const
    },

    statValue: {
        fontSize: '20px',
        fontWeight: 700,
        color: theme.palette.text01
    },

    statLabel: {
        fontSize: '11px',
        color: theme.palette.text03,
        marginTop: '2px'
    },

    availToggle: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0'
    },

    availLabel: {
        fontSize: '14px',
        color: theme.palette.text01
    },

    toggle: {
        position: 'relative',
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: theme.palette.ui03,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        border: 'none',
        '&[aria-checked="true"]': {
            backgroundColor: '#2ECC71'
        },
        '&:focus-visible': {
            outline: `2px solid ${theme.palette.action01}`,
            outlineOffset: '2px'
        }
    },

    toggleKnob: {
        position: 'absolute' as const,
        top: '2px',
        left: '2px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'transform 0.2s'
    },

    saveBtn: {
        width: '100%',
        padding: '10px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 },
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' }
    },

    statusMsg: {
        fontSize: '13px',
        padding: '8px 12px',
        borderRadius: '6px',
        marginBottom: '12px',
        textAlign: 'center' as const
    },

    statusSuccess: { backgroundColor: 'rgba(46, 204, 113, 0.1)', color: '#2ECC71' },
    statusError: { backgroundColor: 'rgba(231, 76, 60, 0.1)', color: '#E74C3C' }
}));

function pickAvatarColor(name: string): string {
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];
    let hash = 0;

    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
}

export default function InterpreterProfile({ onClose }: Props) {
    const { classes, cx } = useStyles();

    const [profile, setProfile] = useState<InterpreterProfileData | null>(null);
    const [stats, setStats] = useState<InterpreterStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [languages, setLanguages] = useState<string[]>([]);
    const [newLang, setNewLang] = useState('');
    const [active, setActive] = useState(false);

    useEffect(() => {
        Promise.all([
            profileAPI.getInterpreterProfile(),
            profileAPI.getInterpreterStats()
        ]).then(([p, s]) => {
            setProfile(p);
            setStats(s);
            setName(p.name || '');
            setEmail(p.email || '');
            setLanguages(p.languages || []);
            setActive(p.active || false);
            setLoading(false);
        }).catch(err => {
            setStatus({ type: 'error', msg: err.message });
            setLoading(false);
        });
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setStatus(null);
        try {
            const updated = await profileAPI.updateInterpreterProfile({ name, email, languages });
            setProfile(updated);
            setStatus({ type: 'success', msg: 'Profile saved' });
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        } finally {
            setSaving(false);
        }
    }, [name, email, languages]);

    const addLanguage = useCallback(() => {
        const lang = newLang.trim();
        if (lang && !languages.includes(lang)) {
            setLanguages([...languages, lang]);
            setNewLang('');
        }
    }, [newLang, languages]);

    const removeLanguage = useCallback((lang: string) => {
        setLanguages(languages.filter(l => l !== lang));
    }, [languages]);

    if (loading) {
        return (
            <div className = { classes.panel }>
                <div className = { classes.statusMsg } role = 'status'>Loading profile...</div>
            </div>
        );
    }

    return (
        <div className = { classes.panel } role = 'dialog' aria-label = 'Interpreter Profile'>
            <div className = { classes.header }>
                <h2 className = { classes.title }>Interpreter Profile</h2>
                <button
                    aria-label = 'Close profile'
                    className = { classes.closeBtn }
                    onClick = { onClose }
                    type = 'button'>&times;</button>
            </div>

            {status && (
                <div
                    aria-live = 'polite'
                    className = { cx(classes.statusMsg, status.type === 'success' ? classes.statusSuccess : classes.statusError) }
                    role = 'status'>
                    {status.msg}
                </div>
            )}

            {/* Avatar + Status */}
            <div
                aria-hidden = 'true'
                className = { classes.avatar }
                style = {{ backgroundColor: pickAvatarColor(name || 'I') }}>
                {(name || 'I').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div style = {{ textAlign: 'center', marginBottom: '16px' }}>
                <span
                    aria-label = { active ? 'Status: Available' : 'Status: Offline' }
                    className = { cx(classes.statusBadge, active ? classes.statusOnline : classes.statusOffline) }>
                    <span aria-hidden = 'true' style = {{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: active ? '#2ECC71' : '#E74C3C',
                        display: 'inline-block'
                    }} />
                    {active ? 'Available' : 'Offline'}
                </span>
            </div>

            {/* Availability */}
            <div className = { classes.section }>
                <div className = { classes.sectionTitle }>Availability</div>
                <div className = { classes.availToggle }>
                    <span className = { classes.availLabel }>
                        {active ? 'Accepting calls' : 'Not accepting calls'}
                    </span>
                    <button
                        aria-checked = { active }
                        aria-label = { active ? 'Go offline' : 'Go available' }
                        className = { classes.toggle }
                        onClick = { () => setActive(!active) }
                        role = 'switch'
                        type = 'button'>
                        <span
                            className = { classes.toggleKnob }
                            style = {{ transform: active ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                </div>
            </div>

            {/* Profile */}
            <div className = { classes.section }>
                <div className = { classes.sectionTitle }>Profile</div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'interp-name'>Name</label>
                    <input
                        aria-label = 'Name'
                        className = { classes.input }
                        id = 'interp-name'
                        onChange = { e => setName(e.target.value) }
                        type = 'text'
                        value = { name } />
                </div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'interp-email'>Email</label>
                    <input
                        aria-label = 'Email'
                        className = { classes.input }
                        id = 'interp-email'
                        onChange = { e => setEmail(e.target.value) }
                        type = 'email'
                        value = { email } />
                </div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'interp-lang'>Languages</label>
                    <div className = { classes.langRow }>
                        {languages.map(lang => (
                            <span className = { classes.langTag } key = { lang }>
                                {lang}
                                <button
                                    aria-label = { `Remove ${lang}` }
                                    className = { classes.langRemove }
                                    onClick = { () => removeLanguage(lang) }
                                    type = 'button'>&times;</button>
                            </span>
                        ))}
                    </div>
                    <div className = { classes.langAdd }>
                        <input
                            className = { classes.input }
                            id = 'interp-lang'
                            onChange = { e => setNewLang(e.target.value) }
                            onKeyDown = { e => { if (e.key === 'Enter') addLanguage(); } }
                            placeholder = 'ASL, Spanish...'
                            style = {{ flex: 1 }}
                            type = 'text'
                            value = { newLang } />
                        <button
                            className = { classes.saveBtn }
                            disabled = { !newLang.trim() }
                            onClick = { addLanguage }
                            style = {{ width: 'auto', padding: '8px 14px', fontSize: '13px' }}
                            type = 'button'>Add</button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            {stats && (
                <div className = { classes.section }>
                    <div className = { classes.sectionTitle }>Stats</div>
                    <div className = { classes.statsGrid }>
                        <div className = { classes.statCard }>
                            <div className = { classes.statValue }>{stats.totalCalls}</div>
                            <div className = { classes.statLabel }>Total Calls</div>
                        </div>
                        <div className = { classes.statCard }>
                            <div className = { classes.statValue }>{stats.totalMinutes}</div>
                            <div className = { classes.statLabel }>Total Minutes</div>
                        </div>
                        <div className = { classes.statCard }>
                            <div className = { classes.statValue }>{stats.avgDuration}m</div>
                            <div className = { classes.statLabel }>Avg Duration</div>
                        </div>
                        <div className = { classes.statCard }>
                            <div className = { classes.statValue }>${stats.totalEarnings}</div>
                            <div className = { classes.statLabel }>Earnings</div>
                        </div>
                    </div>
                </div>
            )}

            <button
                className = { classes.saveBtn }
                disabled = { saving }
                onClick = { handleSave }
                type = 'button'>
                {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div className = { classes.section } style = {{ marginTop: '16px' }}>
                <div className = { classes.sectionTitle }>Security</div>
                <PasswordChangeForm />
            </div>
        </div>
    );
}
