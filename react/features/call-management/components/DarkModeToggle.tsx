/**
 * Dark Mode Toggle — switches between light, dark, and system-detected themes.
 *
 * Persists preference through the server-side preferences system.
 */

import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { setDarkMode } from '../actions';
import { applyDarkMode } from '../middleware';

interface PreferencesState {
    'features/call-management': {
        preferences: {
            dark_mode: 'light' | 'dark' | 'system';
        };
    };
}

const DarkModeToggle = () => {
    const dispatch = useDispatch();
    const darkMode = useSelector(
        (state: PreferencesState) => state['features/call-management']?.preferences?.dark_mode ?? 'system'
    );

    // Apply on mount and when preference changes
    useEffect(() => {
        applyDarkMode(darkMode);
    }, [ darkMode ]);

    // Listen for system preference changes when in 'system' mode
    useEffect(() => {
        if (darkMode !== 'system') {
            return;
        }

        const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

        if (!mediaQuery) {
            return;
        }

        const handler = () => applyDarkMode('system');

        mediaQuery.addEventListener('change', handler);

        return () => mediaQuery.removeEventListener('change', handler);
    }, [ darkMode ]);

    const handleCycle = () => {
        const modes: Array<'light' | 'dark' | 'system'> = [ 'light', 'dark', 'system' ];
        const currentIndex = modes.indexOf(darkMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];

        dispatch(setDarkMode(nextMode));
    };

    const getIcon = () => {
        if (darkMode === 'dark') {
            return 'icon-moon';
        }
        if (darkMode === 'light') {
            return 'icon-sun';
        }

        return 'icon-monitor';
    };

    const getLabel = () => {
        if (darkMode === 'dark') {
            return 'Dark';
        }
        if (darkMode === 'light') {
            return 'Light';
        }

        return 'Auto';
    };

    return (
        <button
            className = 'dark-mode-toggle'
            onClick = { handleCycle }
            title = { `Theme: ${getLabel()} (click to change)` }>
            <i className = { getIcon() } />
            <span>{getLabel()}</span>
        </button>
    );
};

export default DarkModeToggle;
