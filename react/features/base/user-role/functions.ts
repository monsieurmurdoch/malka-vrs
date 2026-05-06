/**
 * Utility functions for determining user role.
 *
 * VRS supports three primary user types:
 * - Client: Deaf/hard-of-hearing user who requests interpretation services
 * - Interpreter: Sign language interpreter who provides interpretation
 * - Captioner: Human live captioner who can publish in-room captions
 *
 * Note: Clients can use VRS meetings normally (up to 8 participants) without
 * requesting an interpreter. The interpreter can be requested at any time.
 */

import { clearPersistentItems, getPersistentItem, setPersistentItem } from '../../vrs-auth/storage';

/**
 * Determines if the current user is an interpreter based on URL, session, or other indicators.
 *
 * @returns {boolean} True if the user is an interpreter, false otherwise.
 */
export function isInterpreter(): boolean {
    const userRole = getPersistentItem('vrs_user_role');
    if (userRole === 'interpreter') {
        return true;
    }

    // Check URL path for interpreter-specific pages
    if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname || '';
        if (path.includes('interpreter-dashboard') ||
            path.includes('interpreter-login') ||
            path.includes('/interpreter/')) {
            return true;
        }

        // Check URL parameters for role indication
        const urlParams = new URLSearchParams(window.location.search);
        const role = urlParams.get('role');
        if (role === 'interpreter') {
            return true;
        }
    }

    return false;
}

/**
 * Determines if the current user is a captioner.
 *
 * @returns {boolean} True if the user is a captioner, false otherwise.
 */
export function isCaptioner(): boolean {
    const userRole = getPersistentItem('vrs_user_role');

    if (userRole === 'captioner') {
        return true;
    }

    if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname || '';
        if (path.includes('captioner-profile') || path.includes('/captioner/')) {
            return true;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const role = urlParams.get('role');
        if (role === 'captioner') {
            return true;
        }
    }

    return false;
}

/**
 * Determines if the current user is a client.
 *
 * @returns {boolean} True if the user is a client, false otherwise.
 */
export function isClient(): boolean {
    const userRole = getPersistentItem('vrs_user_role');
    if (userRole === 'client') {
        return true;
    }

    if (userRole === 'interpreter') {
        return false;
    }

    if (userRole === 'captioner') {
        return false;
    }

    const isClientAuth = getPersistentItem('vrs_client_auth') === 'true';
    if (isClientAuth) {
        return true;
    }

    // Check URL path for client-specific pages
    if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname || '';
        if (path.includes('client-login') || path.includes('/client/')) {
            return true;
        }

        // Check URL parameters for role indication
        const urlParams = new URLSearchParams(window.location.search);
        const role = urlParams.get('role');
        if (role === 'client') {
            return true;
        }

        if (role === 'captioner') {
            return false;
        }
    }

    // Default to client if no specific interpreter indicators are found
    return !isInterpreter() && !isCaptioner();
}

/**
 * Gets the user role as a string.
 *
 * @returns {'interpreter' | 'client' | 'captioner'} The user's role.
 */
export function getUserRole(): 'interpreter' | 'client' | 'captioner' {
    if (isInterpreter()) {
        return 'interpreter';
    }

    if (isCaptioner()) {
        return 'captioner';
    }

    return 'client';
}

/**
 * Sets the user role in session storage.
 * This should be called when the user selects their role on the welcome page.
 *
 * @param {'interpreter' | 'client' | 'captioner'} role - The user's role.
 */
export function setUserRole(role: 'interpreter' | 'client' | 'captioner'): void {
    setPersistentItem('vrs_user_role', role);

    if (role === 'client') {
        setPersistentItem('vrs_client_auth', 'true');
    }

    clearPersistentItems([ 'vrs_interpreter_auth' ]);
    if (role !== 'client') {
        clearPersistentItems([ 'vrs_client_auth' ]);
    }
}

/**
 * Clears the user role from session storage.
 */
export function clearUserRole(): void {
    clearPersistentItems([ 'vrs_user_role', 'vrs_interpreter_auth', 'vrs_client_auth' ]);
}
