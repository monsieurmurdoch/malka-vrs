/**
 * Shared auth helpers used by both REST routes and WebSocket handlers.
 */

const jwt = require('jsonwebtoken');

let JWT_SECRET = null;
let TENANT_SECRETS = {};

function init(config) {
    if (typeof config === 'string') {
        JWT_SECRET = config;
        TENANT_SECRETS = {};
        return;
    }

    JWT_SECRET = config.defaultSecret;
    TENANT_SECRETS = Object.fromEntries(
        Object.entries(config.tenantSecrets || {}).filter(([, secret]) => Boolean(secret))
    );
}

function getSecretForTenant(tenantId) {
    if (tenantId && TENANT_SECRETS[tenantId]) {
        return TENANT_SECRETS[tenantId];
    }
    return JWT_SECRET;
}

function verifyJwtToken(token) {
    const decoded = jwt.decode(token);
    const tenantId = typeof decoded?.tenantId === 'string' ? decoded.tenantId : undefined;
    const secrets = [
        getSecretForTenant(tenantId),
        ...Object.values(TENANT_SECRETS),
        JWT_SECRET
    ].filter((secret, index, list) => secret && list.indexOf(secret) === index);

    let lastError;
    for (const secret of secrets) {
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

function normalizeAuthClaims(decoded) {
    return {
        email: decoded.email,
        id: decoded.id || decoded.userId,
        name: decoded.name || decoded.username,
        role: decoded.role,
        tenantId: decoded.tenantId,
        username: decoded.username || decoded.email || decoded.name || decoded.userId
    };
}

function tokenMatchesRequestedRole(requestedRole, actualRole) {
    if (requestedRole === actualRole) {
        return true;
    }
    return requestedRole === 'admin' && actualRole === 'superadmin';
}

function signToken(payload, expiresIn = '7d') {
    return jwt.sign(payload, getSecretForTenant(payload.tenantId), { expiresIn });
}

function getSecret() {
    return JWT_SECRET;
}

function getTenantSecretStatus() {
    return Object.fromEntries(
        ['malka', 'maple'].map(tenantId => [tenantId, Boolean(TENANT_SECRETS[tenantId])])
    );
}

module.exports = {
    init,
    verifyJwtToken,
    normalizeAuthClaims,
    tokenMatchesRequestedRole,
    signToken,
    getSecret,
    getTenantSecretStatus
};
