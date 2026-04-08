/**
 * Utility functions for determining user role (interpreter vs client).
 *
 * VRS supports two user types:
 * - Client: Deaf/hard-of-hearing user who requests interpretation services
 * - Interpreter: Sign language interpreter who provides interpretation
 *
 * Note: Clients can use VRS meetings normally (up to 8 participants) without
 * requesting an interpreter. The interpreter can be requested at any time.
 */

/**
 * Determines if the current user is an interpreter based on URL, session, or other indicators.
 *
 * @returns {boolean} True if the user is an interpreter, false otherwise.
 */
export function isInterpreter(): boolean {
    // Check session storage for user role (set by welcome page)
    if (typeof sessionStorage !== 'undefined') {
        const userRole = sessionStorage.getItem('vrs_user_role');
        if (userRole === 'interpreter') {
            return true;
        }
    }

    // Check URL path for interpreter-specific pages
    if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname;
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
 * Determines if the current user is a client.
 *
 * @returns {boolean} True if the user is a client, false otherwise.
 */
export function isClient(): boolean {
    // Check session storage for user role (set by welcome page)
    if (typeof sessionStorage !== 'undefined') {
        const userRole = sessionStorage.getItem('vrs_user_role');
        if (userRole === 'client') {
            return true;
        }

        // If explicitly set to interpreter, not a client
        if (userRole === 'interpreter') {
            return false;
        }

        // Legacy check for backward compatibility
        const isClientAuth = sessionStorage.getItem('vrs_client_auth') === 'true';
        if (isClientAuth) {
            return true;
        }
    }

    // Check URL path for client-specific pages
    if (typeof window !== 'undefined' && window.location) {
        const path = window.location.pathname;
        if (path.includes('client-login') || path.includes('/client/')) {
            return true;
        }

        // Check URL parameters for role indication
        const urlParams = new URLSearchParams(window.location.search);
        const role = urlParams.get('role');
        if (role === 'client') {
            return true;
        }
    }

    // Default to client if no specific interpreter indicators are found
    return !isInterpreter();
}

/**
 * Gets the user role as a string.
 *
 * @returns {'interpreter' | 'client'} The user's role.
 */
export function getUserRole(): 'interpreter' | 'client' {
    return isInterpreter() ? 'interpreter' : 'client';
}

/**
 * Sets the user role in session storage.
 * This should be called when the user selects their role on the welcome page.
 *
 * @param {'interpreter' | 'client'} role - The user's role.
 */
export function setUserRole(role: 'interpreter' | 'client'): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('vrs_user_role', role);

        if (role === 'client') {
            sessionStorage.setItem('vrs_client_auth', 'true');
        }

        sessionStorage.removeItem('vrs_interpreter_auth');
        if (role !== 'client') {
            sessionStorage.removeItem('vrs_client_auth');
        }
    }
}

/**
 * Clears the user role from session storage.
 */
export function clearUserRole(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('vrs_user_role');
        sessionStorage.removeItem('vrs_interpreter_auth');
        sessionStorage.removeItem('vrs_client_auth');
    }
}
