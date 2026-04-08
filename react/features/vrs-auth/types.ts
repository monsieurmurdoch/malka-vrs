/**
 * VRS Authentication Types
 */

export type VRSRole = 'client' | 'interpreter' | 'admin' | 'superadmin' | 'none';

export interface VRSUser {
    id: string;
    role: VRSRole;
    name?: string;
    email?: string;
    languages?: string[];  // For interpreters
    isAuthenticated: boolean;
    authenticatedAt?: number;
    expiresAt?: number;
}

export interface AuthToken {
    token: string;
    role: VRSRole;
    userId: string;
    name?: string;
    expiresAt: number;
    issuedAt: number;
}

export interface AuthResponse {
    success: boolean;
    token?: AuthToken;
    user?: VRSUser;
    error?: string;
}

export interface LoginCredentials {
    role: 'client' | 'interpreter' | 'admin' | 'superadmin';
    name?: string;
    email?: string;
    password?: string;  // Required for interpreter
    languages?: string[];  // For interpreters
}

export interface ValidationResult {
    valid: boolean;
    user?: VRSUser;
    error?: string;
}
