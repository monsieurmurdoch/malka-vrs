/**
 * Google Contacts OAuth + People API integration.
 *
 * Env vars required:
 *   GOOGLE_CONTACTS_CLIENT_ID
 *   GOOGLE_CONTACTS_CLIENT_SECRET
 *   GOOGLE_CONTACTS_REDIRECT_URI  (e.g. https://yourdomain/api/google-contacts/callback)
 */

const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');

const router = express.Router();

const CLIENT_ID = process.env.GOOGLE_CONTACTS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CONTACTS_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_CONTACTS_REDIRECT_URI || '';
const SCOPES = 'https://www.googleapis.com/auth/contacts.readonly';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getOAuthStateSecret() {
    return process.env.GOOGLE_CONTACTS_STATE_SECRET
        || process.env.VRS_SHARED_JWT_SECRET
        || process.env.JWT_SECRET
        || process.env.SESSION_SECRET
        || CLIENT_SECRET;
}

function signOAuthState(encodedPayload) {
    return crypto
        .createHmac('sha256', getOAuthStateSecret())
        .update(encodedPayload)
        .digest('base64url');
}

function createOAuthState(payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = signOAuthState(encodedPayload);

    return `${encodedPayload}.${signature}`;
}

function parseOAuthState(stateParam) {
    if (typeof stateParam !== 'string' || !stateParam.includes('.')) {
        return null;
    }

    const [ encodedPayload, providedSignature ] = stateParam.split('.', 2);
    const expectedSignature = signOAuthState(encodedPayload);

    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
        if (!payload?.userId || !payload?.ts) {
            return null;
        }
        if (Date.now() - Number(payload.ts) > OAUTH_STATE_TTL_MS) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}

// ============================================
// MIDDLEWARE
// ============================================

function authenticateClient(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = normalizeAuthClaims(verifyJwtToken(token));
        if (req.user.role !== 'client') {
            return res.status(403).json({ error: 'Client access required' });
        }
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// ============================================
// OAUTH FLOW
// ============================================

/**
 * GET /api/google-contacts/auth-url — returns Google OAuth authorization URL
 */
router.get('/auth-url', authenticateClient, async (req, res) => {
    if (!CLIENT_ID) {
        return res.status(501).json({ error: 'Google Contacts integration not configured' });
    }

    const stateParam = createOAuthState({
        userId: req.user.id,
        ts: Date.now()
    });

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state: stateParam
    }).toString();

    res.json({ url });
});

/**
 * GET /api/google-contacts/callback — OAuth callback
 */
router.get('/callback', async (req, res) => {
    const { code, state: stateParam, error: oauthError } = req.query;

    if (oauthError) {
        return res.status(400).send(`<html><body><script>window.close();</script><p>Authorization denied: ${oauthError}</p></body></html>`);
    }

    if (!code) {
        return res.status(400).send('<html><body><script>window.close();</script><p>Missing authorization code.</p></body></html>');
    }

    const decodedState = parseOAuthState(stateParam);
    if (!decodedState) {
        return res.status(400).send('<html><body><script>window.close();</script><p>Invalid state parameter.</p></body></html>');
    }
    const userId = decodedState.userId;

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            }).toString()
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('[Google OAuth] Token exchange failed:', tokenData.error);
            return res.status(400).send(`<html><body><script>window.close();</script><p>Token exchange failed.</p></body></html>`);
        }

        await db.upsertGoogleOAuthToken({
            clientId: userId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            tokenType: tokenData.token_type || 'Bearer',
            expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
            scope: tokenData.scope || SCOPES
        });

        res.send(`<html><body><script>window.close();</script><p>Google Contacts connected! You can close this tab.</p></body></html>`);
    } catch (error) {
        console.error('[Google OAuth Callback] Error:', error);
        res.status(500).send('<html><body><script>window.close();</script><p>Internal error.</p></body></html>');
    }
});

// ============================================
// PEOPLE API
// ============================================

async function getValidToken(clientId) {
    const token = await db.getGoogleOAuthToken(clientId);
    if (!token) return null;

    // Check if token needs refresh
    if (token.expires_at && new Date(token.expires_at) <= new Date()) {
        if (!token.refresh_token) return null;

        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                refresh_token: token.refresh_token,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'refresh_token'
            }).toString()
        });

        const refreshData = await refreshResponse.json();
        if (refreshData.error) {
            console.error('[Google OAuth] Refresh failed:', refreshData.error);
            return null;
        }

        await db.upsertGoogleOAuthToken({
            clientId,
            accessToken: refreshData.access_token,
            refreshToken: token.refresh_token,
            tokenType: refreshData.token_type || 'Bearer',
            expiresAt: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
            scope: refreshData.scope || token.scope
        });

        return refreshData.access_token;
    }

    return token.access_token;
}

/**
 * POST /api/google-contacts/fetch — fetch contacts from Google People API
 */
router.post('/fetch', authenticateClient, async (req, res) => {
    try {
        const accessToken = await getValidToken(req.user.id);
        if (!accessToken) {
            return res.status(401).json({ error: 'Google account not connected. Please re-authorize.' });
        }

        const contacts = [];
        let pageToken = null;

        // Paginate through all contacts
        do {
            const params = new URLSearchParams({
                personFields: 'names,emailAddresses,phoneNumbers,organizations',
                pageSize: '200'
            });
            if (pageToken) params.set('pageToken', pageToken);

            const response = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const data = await response.json();
            if (data.error) {
                console.error('[Google People API] Error:', data.error.message);
                return res.status(502).json({ error: 'Failed to fetch Google contacts', details: data.error.message });
            }

            for (const person of (data.connections || [])) {
                const contact = {
                    name: person.names?.[0]?.displayName || '',
                    email: person.emailAddresses?.[0]?.value || null,
                    phone_number: person.phoneNumbers?.[0]?.value || null,
                    organization: person.organizations?.[0]?.name || null,
                    _googleResourceName: person.resourceName
                };
                if (contact.name || contact.phone_number || contact.email) {
                    contacts.push(contact);
                }
            }

            pageToken = data.nextPageToken || null;
        } while (pageToken);

        res.json({ contacts });
    } catch (error) {
        console.error('[Google Contacts Fetch] Error:', error);
        res.status(500).json({ error: 'Failed to fetch Google contacts' });
    }
});

/**
 * POST /api/google-contacts/import — import selected Google contacts
 */
router.post('/import', authenticateClient, async (req, res) => {
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'contacts array is required' });
    }

    if (contacts.length > 500) {
        return res.status(400).json({ error: 'Maximum 500 contacts per import' });
    }

    try {
        const result = await db.importContacts(req.user.id, contacts);
        res.json(result);
    } catch (error) {
        console.error('[Google Contacts Import] Error:', error);
        res.status(500).json({ error: 'Failed to import Google contacts' });
    }
});

/**
 * DELETE /api/google-contacts/disconnect — remove Google OAuth tokens
 */
router.delete('/disconnect', authenticateClient, async (req, res) => {
    try {
        await db.deleteGoogleOAuthToken(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('[Google Disconnect] Error:', error);
        res.status(500).json({ error: 'Failed to disconnect Google account' });
    }
});

module.exports = router;
