/**
 * PasswordChangeForm — current + new password + confirmation.
 */

import React, { useCallback, useState } from 'react';
import { makeStyles } from 'tss-react/mui';

import { profileAPI } from '../../profileAPI';

const useStyles = makeStyles()(theme => ({
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
    },

    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    },

    label: {
        fontSize: '12px',
        color: theme.palette.text03
    },

    input: {
        padding: '8px 10px',
        borderRadius: '6px',
        border: `1px solid ${theme.palette.ui03}`,
        backgroundColor: theme.palette.ui01,
        color: theme.palette.text01,
        fontSize: '14px',
        outline: 'none',
        '&:focus': { borderColor: theme.palette.action01 }
    },

    submitBtn: {
        padding: '8px 14px',
        borderRadius: '6px',
        border: 'none',
        backgroundColor: theme.palette.action01,
        color: theme.palette.text04,
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        '&:hover': { opacity: 0.9 },
        '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
        alignSelf: 'flex-start',
        marginTop: '4px'
    },

    msg: {
        fontSize: '13px',
        padding: '6px 10px',
        borderRadius: '4px'
    },

    msgSuccess: {
        backgroundColor: 'rgba(46, 204, 113, 0.1)',
        color: '#2ECC71'
    },

    msgError: {
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        color: '#E74C3C'
    }
}));

export default function PasswordChangeForm() {
    const { classes, cx } = useStyles();

    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) {
            setMsg({ type: 'error', text: 'Passwords do not match' });

            return;
        }
        if (newPw.length < 8) {
            setMsg({ type: 'error', text: 'Password must be at least 8 characters' });

            return;
        }

        setSaving(true);
        setMsg(null);
        try {
            await profileAPI.changePassword(currentPw, newPw);
            setMsg({ type: 'success', text: 'Password updated' });
            setCurrentPw('');
            setNewPw('');
            setConfirmPw('');
        } catch (err: any) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    }, [currentPw, newPw, confirmPw]);

    return (
        <form className = { classes.form } onSubmit = { handleSubmit }>
            <div className = { classes.field }>
                <label className = { classes.label } htmlFor = 'current-pw'>Current Password</label>
                <input
                    aria-label = 'Current password'
                    autoComplete = 'current-password'
                    className = { classes.input }
                    id = 'current-pw'
                    onChange = { e => setCurrentPw(e.target.value) }
                    required
                    type = 'password'
                    value = { currentPw } />
            </div>
            <div className = { classes.field }>
                <label className = { classes.label } htmlFor = 'new-pw'>New Password</label>
                <input
                    aria-label = 'New password'
                    autoComplete = 'new-password'
                    className = { classes.input }
                    id = 'new-pw'
                    minLength = { 8 }
                    onChange = { e => setNewPw(e.target.value) }
                    required
                    type = 'password'
                    value = { newPw } />
            </div>
            <div className = { classes.field }>
                <label className = { classes.label } htmlFor = 'confirm-pw'>Confirm New Password</label>
                <input
                    aria-label = 'Confirm new password'
                    autoComplete = 'new-password'
                    className = { classes.input }
                    id = 'confirm-pw'
                    minLength = { 8 }
                    onChange = { e => setConfirmPw(e.target.value) }
                    required
                    type = 'password'
                    value = { confirmPw } />
            </div>
            {msg && (
                <div
                    className = { cx(classes.msg, msg.type === 'success' ? classes.msgSuccess : classes.msgError) }
                    role = { msg.type === 'error' ? 'alert' : 'status' }>
                    {msg.text}
                </div>
            )}
            <button
                className = { classes.submitBtn }
                disabled = { saving || !currentPw || !newPw || !confirmPw }
                type = 'submit'>
                {saving ? 'Changing...' : 'Change Password'}
            </button>
        </form>
    );
}
