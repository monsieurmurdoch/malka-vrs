/**
 * Contacts & Address Book API — CRUD, groups, block list, merge/dedup, import.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');

const router = express.Router();

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
// CONTACT CRUD
// ============================================

/**
 * GET /api/contacts — list contacts (with search & filter)
 * Query: search, groupId, favorites (bool)
 */
router.get('/', authenticateClient, async (req, res) => {
    try {
        const { search, groupId, favorites } = req.query;
        const contacts = await db.getContacts(req.user.id, {
            search: search || undefined,
            groupId: groupId || undefined,
            favoritesOnly: favorites === 'true' || favorites === '1'
        });
        res.json({ contacts });
    } catch (error) {
        console.error('[Contacts List] Error:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

/**
 * GET /api/contacts/:id — single contact detail
 */
router.get('/:id', authenticateClient, async (req, res) => {
    try {
        const contact = await db.getContact(req.user.id, req.params.id);
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        // Attach call history
        const calls = await db.getContactCallHistory(req.user.id, req.params.id);
        contact.callHistory = calls;

        res.json({ contact });
    } catch (error) {
        console.error('[Contact Detail] Error:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

/**
 * POST /api/contacts — create a contact
 */
router.post('/', authenticateClient, async (req, res) => {
    const { name, email, phoneNumber, organization, notes, avatarColor, isFavorite, linkedClientId, groupIds } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Contact name is required' });
    }

    try {
        const contact = await db.createContact({
            clientId: req.user.id,
            name,
            email,
            phoneNumber,
            organization,
            notes,
            avatarColor,
            isFavorite,
            linkedClientId
        });

        // Assign to groups
        if (Array.isArray(groupIds) && groupIds.length) {
            await db.setContactGroups(req.user.id, contact.id, groupIds);
        }

        // Ensure default groups exist
        await db.ensureDefaultGroups(req.user.id);

        res.status(201).json({ contact });
    } catch (error) {
        console.error('[Contact Create] Error:', error);
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

/**
 * PUT /api/contacts/:id — update a contact
 */
router.put('/:id', authenticateClient, async (req, res) => {
    const { name, email, phoneNumber, organization, notes, avatarColor, isFavorite, linkedClientId, groupIds } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
        if (organization !== undefined) updates.organization = organization;
        if (notes !== undefined) updates.notes = notes;
        if (avatarColor !== undefined) updates.avatar_color = avatarColor;
        if (isFavorite !== undefined) updates.is_favorite = isFavorite ? 1 : 0;
        if (linkedClientId !== undefined) updates.linked_client_id = linkedClientId;

        const changes = await db.updateContact(req.user.id, req.params.id, updates);
        if (changes === 0) {
            return res.status(404).json({ error: 'Contact not found or no changes' });
        }

        // Update groups if provided
        if (Array.isArray(groupIds)) {
            await db.setContactGroups(req.user.id, req.params.id, groupIds);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[Contact Update] Error:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

/**
 * DELETE /api/contacts/:id — delete a contact
 */
router.delete('/:id', authenticateClient, async (req, res) => {
    try {
        const changes = await db.deleteContact(req.user.id, req.params.id);
        if (changes === 0) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Contact Delete] Error:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

// ============================================
// CONTACT GROUPS
// ============================================

/**
 * GET /api/contacts/groups — list all groups
 */
router.get('/groups/list', authenticateClient, async (req, res) => {
    try {
        const groups = await db.getContactGroups(req.user.id);
        res.json({ groups });
    } catch (error) {
        console.error('[Contact Groups List] Error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

/**
 * POST /api/contacts/groups — create a group
 */
router.post('/groups', authenticateClient, async (req, res) => {
    const { name, color, sortOrder } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
    }

    try {
        const group = await db.createContactGroup({
            clientId: req.user.id,
            name,
            color,
            sortOrder
        });
        res.status(201).json({ group });
    } catch (error) {
        if (error.message?.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Group already exists' });
        }
        console.error('[Contact Group Create] Error:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

/**
 * PUT /api/contacts/groups/:groupId — update a group
 */
router.put('/groups/:groupId', authenticateClient, async (req, res) => {
    const { name, color, sortOrder } = req.body;

    try {
        const changes = await db.updateContactGroup(req.user.id, req.params.groupId, { name, color, sortOrder });
        if (changes === 0) {
            return res.status(404).json({ error: 'Group not found or no changes' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Contact Group Update] Error:', error);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

/**
 * DELETE /api/contacts/groups/:groupId — delete a group
 */
router.delete('/groups/:groupId', authenticateClient, async (req, res) => {
    try {
        const changes = await db.deleteContactGroup(req.user.id, req.params.groupId);
        if (changes === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Contact Group Delete] Error:', error);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

/**
 * PUT /api/contacts/:id/groups — set group membership for a contact
 */
router.put('/:id/groups', authenticateClient, async (req, res) => {
    const { groupIds } = req.body;
    if (!Array.isArray(groupIds)) {
        return res.status(400).json({ error: 'groupIds must be an array' });
    }

    try {
        await db.setContactGroups(req.user.id, req.params.id, groupIds);
        res.json({ success: true });
    } catch (error) {
        console.error('[Contact Group Assign] Error:', error);
        res.status(500).json({ error: 'Failed to set groups' });
    }
});

// ============================================
// BLOCK LIST
// ============================================

/**
 * GET /api/contacts/blocked — list blocked contacts
 */
router.get('/blocked/list', authenticateClient, async (req, res) => {
    try {
        const blocked = await db.getBlockedContacts(req.user.id);
        res.json({ blocked });
    } catch (error) {
        console.error('[Blocked List] Error:', error);
        res.status(500).json({ error: 'Failed to fetch blocked contacts' });
    }
});

/**
 * POST /api/contacts/blocked — block a contact
 */
router.post('/blocked', authenticateClient, async (req, res) => {
    const { blockedPhone, blockedEmail, blockedClientId, reason } = req.body;

    if (!blockedPhone && !blockedEmail && !blockedClientId) {
        return res.status(400).json({ error: 'Must specify phone, email, or client ID to block' });
    }

    try {
        const result = await db.blockContact({
            clientId: req.user.id,
            blockedPhone,
            blockedEmail,
            blockedClientId,
            reason
        });
        res.status(201).json({ block: result });
    } catch (error) {
        console.error('[Block Contact] Error:', error);
        res.status(500).json({ error: 'Failed to block contact' });
    }
});

/**
 * DELETE /api/contacts/blocked/:blockId — unblock
 */
router.delete('/blocked/:blockId', authenticateClient, async (req, res) => {
    try {
        const changes = await db.unblockContact(req.user.id, req.params.blockId);
        if (changes === 0) {
            return res.status(404).json({ error: 'Block entry not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[Unblock Contact] Error:', error);
        res.status(500).json({ error: 'Failed to unblock contact' });
    }
});

// ============================================
// MERGE / DEDUP
// ============================================

/**
 * GET /api/contacts/duplicates — find duplicate contacts
 */
router.get('/duplicates/list', authenticateClient, async (req, res) => {
    try {
        const duplicates = await db.findDuplicateContacts(req.user.id);
        res.json({ duplicates });
    } catch (error) {
        console.error('[Find Duplicates] Error:', error);
        res.status(500).json({ error: 'Failed to find duplicates' });
    }
});

/**
 * POST /api/contacts/merge — merge duplicate contacts
 */
router.post('/merge', authenticateClient, async (req, res) => {
    const { primaryId, secondaryIds } = req.body;

    if (!primaryId || !Array.isArray(secondaryIds) || !secondaryIds.length) {
        return res.status(400).json({ error: 'primaryId and secondaryIds[] are required' });
    }

    try {
        const merged = await db.mergeContacts(req.user.id, { primaryId, secondaryIds });
        res.json({ success: true, merged });
    } catch (error) {
        console.error('[Merge Contacts] Error:', error);
        res.status(500).json({ error: 'Failed to merge contacts' });
    }
});

// ============================================
// IMPORT
// ============================================

/**
 * POST /api/contacts/import — import contacts from JSON (CSV parsed client-side)
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
        console.error('[Import Contacts] Error:', error);
        res.status(500).json({ error: 'Failed to import contacts' });
    }
});

// ============================================
// MIGRATE SPEED DIAL → CONTACTS
// ============================================

/**
 * POST /api/contacts/migrate-speed-dial — one-time migration
 */
router.post('/migrate-speed-dial', authenticateClient, async (req, res) => {
    try {
        const migrated = await db.migrateSpeedDialToContacts(req.user.id);
        await db.ensureDefaultGroups(req.user.id);
        res.json({ success: true, migrated });
    } catch (error) {
        console.error('[Migrate Speed Dial] Error:', error);
        res.status(500).json({ error: 'Failed to migrate speed dial' });
    }
});

module.exports = router;
