/**
 * Shared auth helpers used by both REST routes and WebSocket handlers.
 */

import jwt from 'jsonwebtoken';

let JWT_SECRET: string | null = null;

function init(secret: string): void {
    JWT_SECRET = secret;
}

function verifyJwtToken(token: string): string | jwt.JwtPayload {
    return jwt.verify(token, JWT_SECRET!);
}

interface AuthClaims {
    email?: string;
    id?: string;
    userId?: string;
    name?: string;
    role?: string;
    username?: string;
}

interface NormalizedClaims {
    email: string | undefined;
    id: string | undefined;
    name: string;
    role: string | undefined;
    username: string;
}

function normalizeAuthClaims(decoded: AuthClaims): NormalizedClaims {
    return {
        email: decoded.email,
        id: decoded.id || decoded.userId,
        name: decoded.name || decoded.username || '',
        role: decoded.role,
        username: decoded.username || decoded.email || decoded.name || decoded.userId || ''
    };
}

function tokenMatchesRequestedRole(requestedRole: string, actualRole: string | undefined): boolean {
    if (requestedRole === actualRole) {
        return true;
    }
    return requestedRole === 'admin' && actualRole === 'superadmin';
}

function signToken(payload: object, expiresIn: string = '7d'): string {
    return jwt.sign(payload, JWT_SECRET!, { expiresIn: expiresIn as any });
}

function getSecret(): string | null {
    return JWT_SECRET;
}

export {
    init,
    verifyJwtToken,
    normalizeAuthClaims,
    tokenMatchesRequestedRole,
    signToken,
    getSecret
};
