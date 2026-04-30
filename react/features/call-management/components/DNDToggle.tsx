/**
 * Do Not Disturb Toggle — suppresses incoming calls, routing them to voicemail.
 */

import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { toggleDND } from '../actions';

interface PreferencesState {
    'features/call-management': {
        preferences: {
            dnd_enabled: boolean;
            dnd_message: string | null;
        };
    };
}

const DNDToggle = () => {
    const dispatch = useDispatch();
    const dndEnabled = useSelector(
        (state: PreferencesState) => state['features/call-management']?.preferences?.dnd_enabled ?? false
    );
    const dndMessage = useSelector(
        (state: PreferencesState) => state['features/call-management']?.preferences?.dnd_message ?? ''
    );
    const [ showSettings, setShowSettings ] = useState(false);
    const [ message, setMessage ] = useState(dndMessage || '');

    const handleToggle = () => {
        dispatch(toggleDND(!dndEnabled, dndEnabled ? '' : message));
        if (!dndEnabled) {
            setShowSettings(false);
        }
    };

    const handleSaveMessage = () => {
        dispatch(toggleDND(dndEnabled, message));
        setShowSettings(false);
    };

    return (
        <div className = 'dnd-toggle'>
            <button
                className = { `dnd-btn ${dndEnabled ? 'active' : ''}` }
                onClick = { handleToggle }
                title = { dndEnabled ? 'Do Not Disturb is ON' : 'Enable Do Not Disturb' }>
                <i className = { `icon-moon ${dndEnabled ? 'active' : ''}` } />
                <span>{dndEnabled ? 'DND On' : 'DND'}</span>
            </button>
            {dndEnabled && (
                <button
                    className = 'dnd-settings-btn'
                    onClick = { () => setShowSettings(!showSettings) }
                    title = 'DND settings'>
                    <i className = 'icon-settings' />
                </button>
            )}
            {showSettings && (
                <div className = 'dnd-settings-popup'>
                    <label>
                        Auto-reply message:
                        <textarea
                            value = { message }
                            onChange = { e => setMessage(e.target.value ?? '') }
                            placeholder = 'e.g. I am unavailable, please leave a message.'
                            rows = { 3 } />
                    </label>
                    <button onClick = { handleSaveMessage }>Save</button>
                </div>
            )}
        </div>
    );
};

export default DNDToggle;
