/**
 * ClientProfile — editable profile + account settings panel.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import { profileAPI, ClientProfile as ClientProfileData, ClientPreferences } from '../../profileAPI';
import DarkModeToggle from '../../../call-management/components/DarkModeToggle';
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
        '&:focus': { borderColor: theme.palette.action01 },
        '&:read-only': { opacity: 0.6, cursor: 'default' }
    },

    toggleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: `1px solid ${theme.palette.ui03}`,
        '&:last-child': { borderBottom: 'none' }
    },

    toggleLabel: {
        fontSize: '14px',
        color: theme.palette.text01
    },

    toggleDesc: {
        fontSize: '12px',
        color: theme.palette.text03,
        marginTop: '2px'
    },

    toggle: {
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '11px',
        backgroundColor: theme.palette.ui03,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        border: 'none',
        '&[aria-checked="true"]': {
            backgroundColor: theme.palette.action01
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
        width: '18px',
        height: '18px',
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

    statusSuccess: {
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        color: '#2ECC71'
    },

    statusError: {
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        color: '#E74C3C'
    }
}));

function pickAvatarColor(name: string): string {
    const colors = ['#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];
    let hash = 0;

    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function ClientProfile({ onClose }: Props) {
    const { classes, cx } = useStyles();

    const [profile, setProfile] = useState<ClientProfileData | null>(null);
    const [prefs, setPrefs] = useState<ClientPreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Editable fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [org, setOrg] = useState('');

    useEffect(() => {
        Promise.all([
            profileAPI.getClientProfile(),
            profileAPI.getPreferences()
        ]).then(([p, pr]) => {
            setProfile(p);
            setPrefs(pr);
            setName(p.name || '');
            setEmail(p.email || '');
            setOrg(p.organization || '');
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
            const [updatedProfile] = await Promise.all([
                profileAPI.updateClientProfile({ name, email, organization: org }),
                // Save prefs too if they changed
                prefs ? profileAPI.updatePreferences(prefs) : Promise.resolve()
            ]);
            setProfile(updatedProfile);
            setStatus({ type: 'success', msg: 'Profile saved' });
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        } finally {
            setSaving(false);
        }
    }, [name, email, org, prefs]);

    const togglePref = useCallback((key: keyof ClientPreferences) => {
        if (!prefs) return;
        setPrefs({ ...prefs, [key]: !prefs[key] });
    }, [prefs]);

    if (loading) {
        return (
            <div className = { classes.panel }>
                <div className = { classes.statusMsg } role = 'status'>Loading profile...</div>
            </div>
        );
    }

    return (
        <div className = { classes.panel } role = 'dialog' aria-label = 'Client Profile'>
            <div className = { classes.header }>
                <h2 className = { classes.title }>Profile & Settings</h2>
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

            {/* Avatar */}
            <div
                aria-hidden = 'true'
                className = { classes.avatar }
                style = {{ backgroundColor: pickAvatarColor(name || 'U') }}>
                {getInitials(name || 'User')}
            </div>

            {/* Profile fields */}
            <div className = { classes.section }>
                <div className = { classes.sectionTitle }>Profile</div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'profile-name'>Display Name</label>
                    <input
                        aria-label = 'Display name'
                        className = { classes.input }
                        id = 'profile-name'
                        onChange = { e => setName(e.target.value) }
                        type = 'text'
                        value = { name } />
                </div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'profile-email'>Email</label>
                    <input
                        aria-label = 'Email'
                        className = { classes.input }
                        id = 'profile-email'
                        onChange = { e => setEmail(e.target.value) }
                        type = 'email'
                        value = { email } />
                </div>
                <div className = { classes.field }>
                    <label className = { classes.label } htmlFor = 'profile-org'>Organization</label>
                    <input
                        aria-label = 'Organization'
                        className = { classes.input }
                        id = 'profile-org'
                        onChange = { e => setOrg(e.target.value) }
                        type = 'text'
                        value = { org } />
                </div>
                {profile?.primaryPhone && (
                    <div className = { classes.field }>
                        <label className = { classes.label } htmlFor = 'profile-phone'>VRS Phone Number</label>
                        <input
                            className = { classes.input }
                            id = 'profile-phone'
                            readOnly
                            type = 'tel'
                            value = { profile.primaryPhone } />
                    </div>
                )}
            </div>

            {/* Settings */}
            {prefs && (
                <div className = { classes.section }>
                    <div className = { classes.sectionTitle }>Settings</div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Do Not Disturb</div>
                            <div className = { classes.toggleDesc }>Route calls to voicemail</div>
                        </div>
                        <button
                            aria-checked = { prefs.dnd_enabled }
                            className = { classes.toggle }
                            onClick = { () => togglePref('dnd_enabled') }
                            role = 'switch'
                            type = 'button'>
                            <span
                                className = { classes.toggleKnob }
                                style = {{ transform: prefs.dnd_enabled ? 'translateX(18px)' : 'translateX(0)' }} />
                        </button>
                    </div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Theme</div>
                            <div className = { classes.toggleDesc }>Light, dark, or auto</div>
                        </div>
                        <DarkModeToggle />
                    </div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Camera Off by Default</div>
                        </div>
                        <button
                            aria-checked = { prefs.camera_default_off }
                            className = { classes.toggle }
                            onClick = { () => togglePref('camera_default_off') }
                            role = 'switch'
                            type = 'button'>
                            <span
                                className = { classes.toggleKnob }
                                style = {{ transform: prefs.camera_default_off ? 'translateX(18px)' : 'translateX(0)' }} />
                        </button>
                    </div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Microphone Off by Default</div>
                        </div>
                        <button
                            aria-checked = { prefs.mic_default_off }
                            className = { classes.toggle }
                            onClick = { () => togglePref('mic_default_off') }
                            role = 'switch'
                            type = 'button'>
                            <span
                                className = { classes.toggleKnob }
                                style = {{ transform: prefs.mic_default_off ? 'translateX(18px)' : 'translateX(0)' }} />
                        </button>
                    </div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Skip Waiting Room</div>
                        </div>
                        <button
                            aria-checked = { prefs.skip_waiting_room }
                            className = { classes.toggle }
                            onClick = { () => togglePref('skip_waiting_room') }
                            role = 'switch'
                            type = 'button'>
                            <span
                                className = { classes.toggleKnob }
                                style = {{ transform: prefs.skip_waiting_room ? 'translateX(18px)' : 'translateX(0)' }} />
                        </button>
                    </div>

                    <div className = { classes.toggleRow }>
                        <div>
                            <div className = { classes.toggleLabel }>Remember Media Permissions</div>
                            <div className = { classes.toggleDesc }>Keep camera/mic choices between calls</div>
                        </div>
                        <button
                            aria-checked = { prefs.remember_media_permissions }
                            className = { classes.toggle }
                            onClick = { () => togglePref('remember_media_permissions') }
                            role = 'switch'
                            type = 'button'>
                            <span
                                className = { classes.toggleKnob }
                                style = {{ transform: prefs.remember_media_permissions ? 'translateX(18px)' : 'translateX(0)' }} />
                        </button>
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

            {/* Password */}
            <div className = { classes.section } style = {{ marginTop: '16px' }}>
                <div className = { classes.sectionTitle }>Security</div>
                <PasswordChangeForm />
            </div>
        </div>
    );
}
