/**
 * VRS Authentication Service
 *
 * Handles role-based authentication for Video Relay Service.
 * Validates roles with backend server and manages session tokens.
 */

import { VRSRole, VRSUser, AuthResponse, LoginCredentials, ValidationResult, AuthToken } from './types';
import { STORAGE_KEYS, TOKEN_EXPIRY, ROLE_PERMISSIONS } from './constants';
import { clearPersistentItems, getPersistentItem, removePersistentItem, setPersistentItem } from './storage';

// Config will be loaded from Jitsi's config
declare var config: any;

/**
 * Get VRS configuration from Jitsi config
 */
function getVRSConfig() {
    const defaults = {
        authEndpoint: 'http://localhost:3003/api/auth',
        jwtSecret: ''
    };

    if (typeof config !== 'undefined' && config.vrs) {
        return { ...defaults, ...config.vrs };
    }

    return defaults;
}

/**
 * Encode an ArrayBuffer to a Base64URL string (no padding).
 */
function toBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encode a JS object to a Base64URL JSON string.
 */
function encodeBase64UrlJson(payload: object): string {
    return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)).buffer);
}

/**
 * Create an HMAC-SHA256 signature using the Web Crypto API.
 */
async function hmacSign(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        [ 'sign' ]
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

    return toBase64Url(signature);
}

class VRSSAuthService {
    private config: any;
    private currentUser: VRSUser | null = null;
    private validationCache: Map<string, { result: ValidationResult; timestamp: number }> = new Map();
    private cacheTimeout = 60000; // 1 minute cache

    constructor() {
        this.config = getVRSConfig();
        this.loadUserFromStorage();
    }

    /**
     * Get current user role
     */
    getRole(): VRSRole {
        return this.currentUser?.role || this.getStoredRole();
    }

    /**
     * Get stored role from sessionStorage (fallback)
     */
    private getStoredRole(): VRSRole {
        if (typeof sessionStorage === 'undefined') {
            return 'none';
        }

        const role = sessionStorage.getItem(STORAGE_KEYS.USER_ROLE);
        if (role && ['client', 'interpreter', 'admin', 'superadmin'].includes(role)) {
            return role as VRSRole;
        }
        return 'none';
    }

    /**
     * Get current user info
     */
    getUser(): VRSUser | null {
        return this.currentUser;
    }

    /**
     * Check if user has a specific role
     */
    hasRole(role: VRSRole | VRSRole[]): boolean {
        const currentRole = this.getRole();
        if (Array.isArray(role)) {
            return role.includes(currentRole);
        }
        return currentRole === role;
    }

    /**
     * Check if user has a specific permission
     */
    hasPermission(permission: keyof typeof ROLE_PERMISSIONS.client): boolean {
        const role = this.getRole();
        const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.none;
        return permissions[permission] === true;
    }

    /**
     * Check if current session is authenticated
     */
    isAuthenticated(): boolean {
        if (!this.currentUser) {
            return false;
        }

        // Check token expiry
        if (this.currentUser.expiresAt && Date.now() > this.currentUser.expiresAt) {
            this.logout();
            return false;
        }

        return this.currentUser.isAuthenticated;
    }

    /**
     * Login as a specific role
     * For clients: creates a temporary session
     * For interpreters: requires server validation
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            const { role, name, email, password, languages } = credentials;

            // For clients, we can create a local session
            if (role === 'client') {
                return await this.createClientSession(name);
            }

            // For interpreters/admins, validate with server
            if (role === 'interpreter' || role === 'admin' || role === 'superadmin') {
                if (!email || !password) {
                    return {
                        success: false,
                        error: 'Email and password are required'
                    };
                }

                return this.validateWithServer({
                    role,
                    email,
                    password,
                    name,
                    languages
                });
            }

            return {
                success: false,
                error: 'Invalid role'
            };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Login failed. Please try again.'
            };
        }
    }

    /**
     * Create a client session (no server validation needed for basic access)
     */
    private async createClientSession(name?: string): Promise<AuthResponse> {
        const userId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        const user: VRSUser = {
            id: userId,
            role: 'client',
            name: name || 'Guest',
            isAuthenticated: true,
            authenticatedAt: now,
            expiresAt: now + TOKEN_EXPIRY.CLIENT
        };

        const tokenString = await this.generateLocalToken(user);

        const token: AuthToken = {
            token: tokenString,
            role: 'client',
            userId,
            name: user.name,
            expiresAt: user.expiresAt!,
            issuedAt: now
        };

        this.setUser(user, token);

        return {
            success: true,
            token,
            user
        };
    }

    /**
     * Validate credentials with server
     */
    private async validateWithServer(credentials: LoginCredentials): Promise<AuthResponse> {
        try {
            const response = await fetch(this.getAuthUrl('login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const result = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: result.error || 'Authentication failed'
                };
            }

            // Store the user and token
            if (result.token && result.user) {
                const normalizedToken = this.normalizeServerToken(result.token, result.user);
                const normalizedUser: VRSUser = {
                    ...result.user,
                    isAuthenticated: true,
                    authenticatedAt: Date.now(),
                    expiresAt: normalizedToken.expiresAt
                };
                this.setUser(normalizedUser, normalizedToken);
                result.token = normalizedToken;
                result.user = normalizedUser;
            }

            return result;
        } catch (error) {
            console.error('Server validation error:', error);

            return {
                success: false,
                error: 'Unable to connect to authentication server'
            };
        }
    }

    /**
     * Validate current session with server
     */
    async validateSession(): Promise<ValidationResult> {
        const token = this.getStoredToken();
        if (!token) {
            return { valid: false, error: 'No authentication token found' };
        }

        // Check cache
        const cached = this.validationCache.get(token.token);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.result;
        }

        try {
            const response = await fetch(this.getAuthUrl('validate'), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token.token}`
                }
            });

            const result = await response.json();

            const validationResult: ValidationResult = response.ok
                ? { valid: true, user: result.user }
                : { valid: false, error: result.error || 'Invalid session' };

            // Cache the result
            this.validationCache.set(token.token, {
                result: validationResult,
                timestamp: Date.now()
            });

            if (!validationResult.valid) {
                this.logout();
            }

            return validationResult;
        } catch (error) {
            console.error('Session validation error:', error);

            return { valid: false, error: 'Validation failed' };
        }
    }

    /**
     * Logout and clear session
     */
    logout(): void {
        this.currentUser = null;

        clearPersistentItems([
            STORAGE_KEYS.USER_ROLE,
            STORAGE_KEYS.AUTH_TOKEN,
            STORAGE_KEYS.USER_INFO,
            STORAGE_KEYS.CLIENT_AUTH,
            'vrs_interpreter_auth'
        ]);

        this.validationCache.clear();
    }

    /**
     * Quick role set for client flow (backward compatibility)
     */
    setClientRole(name?: string): void {
        const userId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = Date.now();

        const user: VRSUser = {
            id: userId,
            role: 'client',
            name: name || 'Guest',
            isAuthenticated: true,
            authenticatedAt: now,
            expiresAt: now + TOKEN_EXPIRY.CLIENT
        };

        setPersistentItem(STORAGE_KEYS.USER_ROLE, 'client');
        setPersistentItem(STORAGE_KEYS.CLIENT_AUTH, 'true');
        setPersistentItem(STORAGE_KEYS.USER_INFO, JSON.stringify(user));

        this.currentUser = user;
    }

    /**
     * Quick role set for interpreter flow (backward compatibility)
     */
    setInterpreterRole(name?: string, languages?: string[]): void {
        console.warn('Interpreter shortcut auth is disabled. Use server-backed login instead.', {
            name,
            languages
        });
        this.logout();
    }

    // Private helper methods

    private setUser(user: VRSUser, token: AuthToken): void {
        this.currentUser = user;

        setPersistentItem(STORAGE_KEYS.USER_ROLE, user.role);
        setPersistentItem(STORAGE_KEYS.AUTH_TOKEN, JSON.stringify(token));
        setPersistentItem(STORAGE_KEYS.USER_INFO, JSON.stringify(user));
    }

    private loadUserFromStorage(): void {
        try {
            const userInfo = getPersistentItem(STORAGE_KEYS.USER_INFO);
            if (userInfo) {
                const user = JSON.parse(userInfo) as VRSUser;

                // Check if expired
                if (user.expiresAt && Date.now() > user.expiresAt) {
                    this.logout();
                    return;
                }

                this.currentUser = user;
            }
        } catch (error) {
            console.error('Error loading user from storage:', error);
        }
    }

    private getStoredToken(): AuthToken | null {
        try {
            const tokenStr = getPersistentItem(STORAGE_KEYS.AUTH_TOKEN);
            if (tokenStr) {
                return JSON.parse(tokenStr) as AuthToken;
            }
        } catch (error) {
            console.error('Error loading token from storage:', error);
        }

        return null;
    }

    private async generateLocalToken(user: VRSUser): Promise<string> {
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            userId: user.id,
            role: user.role,
            iat: Math.floor(Date.now() / 1000),
            exp: user.expiresAt ? Math.floor(user.expiresAt / 1000) : undefined
        };

        const headerB64 = encodeBase64UrlJson(header);
        const payloadB64 = encodeBase64UrlJson(payload);
        const signingInput = `${headerB64}.${payloadB64}`;

        const secret = this.config.jwtSecret;

        if (!secret) {
            console.warn('[VRS Auth] No jwtSecret configured — client tokens will be unsigned.');
        }

        const signature = secret
            ? await hmacSign(signingInput, secret)
            : '';

        return `${signingInput}.${signature}`;
    }

    private getAuthUrl(path: 'login' | 'validate'): string {
        const baseEndpoint = this.config.authEndpoint.replace(/\/$/, '');

        if (baseEndpoint.endsWith('/login') || baseEndpoint.endsWith('/validate')) {
            return baseEndpoint;
        }

        return `${baseEndpoint}/${path}`;
    }

    private normalizeServerToken(serverToken: string | AuthToken, user: VRSUser): AuthToken {
        if (typeof serverToken !== 'string') {
            return serverToken;
        }

        const issuedAt = Date.now();
        let expiresAt = issuedAt + TOKEN_EXPIRY.INTERPRETER;

        try {
            const payload = JSON.parse(atob(serverToken.split('.')[1]));
            if (payload?.exp) {
                expiresAt = payload.exp * 1000;
            }
        } catch (error) {
            // Fall back to default interpreter expiry if the token is opaque.
        }

        return {
            token: serverToken,
            role: user.role,
            userId: user.id,
            name: user.name,
            expiresAt,
            issuedAt
        };
    }

}

// Singleton instance
export const vrsAuthService = new VRSSAuthService();

export default vrsAuthService;
