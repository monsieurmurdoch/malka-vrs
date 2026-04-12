/**
 * Shared auth helpers used by both REST routes and WebSocket handlers.
 */

const jwt = require('jsonwebtoken');

let JWT_SECRET = null;

function init(secret) {
    JWT_SECRET = secret;
}

function verifyJwtToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

function normalizeAuthClaims(decoded) {
    return {
        email: decoded.email,
        id: decoded.id || decoded.userId,
        name: decoded.name || decoded.username,
        role: decoded.role,
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
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function getSecret() {
    return JWT_SECRET;
}

module.exports = {
    init,
    verifyJwtToken,
    normalizeAuthClaims,
    tokenMatchesRequestedRole,
    signToken,
    getSecret
};
