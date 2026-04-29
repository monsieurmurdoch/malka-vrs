/**
 * Shared auth helpers used by both REST routes and WebSocket handlers.
 */

import jwt from 'jsonwebtoken';

interface AuthConfig {
    defaultSecret: string;
    tenantSecrets?: Record<string, string | undefined>;
}

let JWT_SECRET: string | null = null;
let TENANT_SECRETS: Record<string, string> = {};

function init(config: string | AuthConfig): void {
    if (typeof config === 'string') {
        JWT_SECRET = config;
        TENANT_SECRETS = {};
        return;
    }

    JWT_SECRET = config.defaultSecret;
    TENANT_SECRETS = Object.fromEntries(
        Object.entries(config.tenantSecrets || {})
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
    );
}

function getSecretForTenant(tenantId?: string): string {
    if (tenantId && TENANT_SECRETS[tenantId]) {
        return TENANT_SECRETS[tenantId];
    }
    return JWT_SECRET!;
}

function verifyJwtToken(token: string): string | jwt.JwtPayload {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    const tenantId = typeof decoded?.tenantId === 'string' ? decoded.tenantId : undefined;
    const secrets = [
        getSecretForTenant(tenantId),
        ...Object.values(TENANT_SECRETS),
        JWT_SECRET!
    ].filter((secret, index, list) => secret && list.indexOf(secret) === index);

    let lastError: unknown;
    for (const secret of secrets) {
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

interface AuthClaims {
    email?: string;
    id?: string;
    userId?: string;
    name?: string;
    role?: string;
    tenantId?: string;
    username?: string;
}

interface NormalizedClaims {
    email: string | undefined;
    id: string | undefined;
    name: string;
    role: string | undefined;
    tenantId: string | undefined;
    username: string;
}

function normalizeAuthClaims(decoded: AuthClaims): NormalizedClaims {
    return {
        email: decoded.email,
        id: decoded.id || decoded.userId,
        name: decoded.name || decoded.username || '',
        role: decoded.role,
        tenantId: decoded.tenantId,
        username: decoded.username || decoded.email || decoded.name || decoded.userId || ''
    };
}

function tokenMatchesRequestedRole(requestedRole: string, actualRole: string | undefined): boolean {
    if (requestedRole === actualRole) {
        return true;
    }
    return requestedRole === 'admin' && actualRole === 'superadmin';
}

function signToken(payload: AuthClaims, expiresIn: string = '7d'): string {
    return jwt.sign(payload, getSecretForTenant(payload.tenantId), { expiresIn: expiresIn as any });
}

function getSecret(): string | null {
    return JWT_SECRET;
}

function getTenantSecretStatus(): Record<string, boolean> {
    return Object.fromEntries(
        ['malka', 'maple'].map(tenantId => [tenantId, Boolean(TENANT_SECRETS[tenantId])])
    );
}

export {
    init,
    verifyJwtToken,
    normalizeAuthClaims,
    tokenMatchesRequestedRole,
    signToken,
    getSecret,
    getTenantSecretStatus
};
