/**
 * VRS Authentication Constants
 */

export const STORAGE_KEYS = {
    USER_ROLE: 'vrs_user_role',
    AUTH_TOKEN: 'vrs_auth_token',
    USER_INFO: 'vrs_user_info',
    CLIENT_AUTH: 'vrs_client_auth'
};

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
    client: 'Client',
    interpreter: 'Interpreter',
    admin: 'Administrator',
    superadmin: 'Super Administrator',
    none: 'Guest'
};

export const ROLE_PERMISSIONS = {
    client: {
        canRequestInterpreter: true,
        canJoinCall: true,
        canViewQueue: false,
        canManageInterpreters: false
    },
    interpreter: {
        canRequestInterpreter: false,
        canJoinCall: true,
        canViewQueue: true,
        canManageInterpreters: false,
        canAcceptRequests: true,
        canUpdateStatus: true
    },
    admin: {
        canRequestInterpreter: false,
        canJoinCall: true,
        canViewQueue: true,
        canManageInterpreters: true,
        canAcceptRequests: true,
        canUpdateStatus: true,
        canViewLogs: true,
        canManageUsers: true
    },
    superadmin: {
        canRequestInterpreter: false,
        canJoinCall: true,
        canViewQueue: true,
        canManageInterpreters: true,
        canAcceptRequests: true,
        canUpdateStatus: true,
        canViewLogs: true,
        canManageUsers: true
    },
    none: {
        canRequestInterpreter: false,
        canJoinCall: false,
        canViewQueue: false,
        canManageInterpreters: false
    }
};

// Token expiry times (in milliseconds)
export const TOKEN_EXPIRY = {
    CLIENT: 4 * 60 * 60 * 1000,  // 4 hours for clients
    INTERPRETER: 8 * 60 * 60 * 1000,  // 8 hours for interpreters
    ADMIN: 12 * 60 * 60 * 1000  // 12 hours for admins
};
