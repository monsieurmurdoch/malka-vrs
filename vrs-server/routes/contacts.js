/**
 * Contacts & Address Book API — CRUD, groups, block list, merge/dedup, import.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const state = require('../lib/state');
const log = require('../lib/logger').module('contacts');

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
        log.error({ err: error }, 'contacts_list_error');
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

/**
 * GET /api/contacts/sync — delta sync (must be before /:id)
 * Query: since (ISO-8601 timestamp)
 */
router.get('/sync', authenticateClient, async (req, res) => {
    try {
        const { since } = req.query;
        const sinceTimestamp = since ? new Date(since) : new Date(0);

        if (isNaN(sinceTimestamp.getTime())) {
            return res.status(400).json({ error: 'Invalid "since" timestamp' });
        }

        const changes = await db.getContactChangesSince(req.user.id, sinceTimestamp);
        res.json({
            changes,
            serverTimestamp: new Date().toISOString()
        });
    } catch (error) {
        log.error({ err: error }, 'contacts_sync_error');
        res.status(500).json({ error: 'Failed to sync contacts' });
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

        // Attach timeline + notes
        const [timeline, notes] = await Promise.all([
            db.getContactTimeline(req.user.id, req.params.id).catch(() => []),
            db.getContactNotes(req.params.id).catch(() => [])
        ]);
        contact.callHistory = timeline.filter(t => t.type === 'call');
        contact.timeline = timeline;
        contact.notesList = notes;

        res.json({ contact });
    } catch (error) {
        log.error({ err: error }, 'contact_detail_error');
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

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'contact',
                entityId: contact.id,
                action: 'create',
                snapshot: contact
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'create', entityType: 'contact', entityId: contact.id }
            });
        } catch (e) {
            log.error({ err: e }, 'contact_create_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'contact_create_error');
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

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'contact',
                entityId: req.params.id,
                action: 'update',
                snapshot: updates
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'update', entityType: 'contact', entityId: req.params.id }
            });
        } catch (e) {
            log.error({ err: e }, 'contact_update_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'contact_update_error');
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

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'contact',
                entityId: req.params.id,
                action: 'delete'
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'delete', entityType: 'contact', entityId: req.params.id }
            });
        } catch (e) {
            log.error({ err: e }, 'contact_delete_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'contact_delete_error');
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
        log.error({ err: error }, 'contact_groups_list_error');
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
        log.error({ err: error }, 'contact_group_create_error');
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
        log.error({ err: error }, 'contact_group_update_error');
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
        log.error({ err: error }, 'contact_group_delete_error');
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
        log.error({ err: error }, 'contact_group_assign_error');
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
        log.error({ err: error }, 'blocked_list_error');
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
        log.error({ err: error }, 'block_contact_error');
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
        log.error({ err: error }, 'unblock_contact_error');
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
        log.error({ err: error }, 'find_duplicates_error');
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
        log.error({ err: error }, 'merge_contacts_error');
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

        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'contact',
                entityId: 'bulk-import',
                action: 'import',
                snapshot: result
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'import', entityType: 'contact', result }
            });
        } catch (e) {
            log.error({ err: e }, 'contact_import_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'import_contacts_error');
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

        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'contact',
                entityId: 'speed-dial-migration',
                action: 'import',
                snapshot: { migrated }
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'import', entityType: 'contact', migrated }
            });
        } catch (e) {
            log.error({ err: e }, 'speed_dial_migration_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'migrate_speed_dial_error');
        res.status(500).json({ error: 'Failed to migrate speed dial' });
    }
});

// ============================================
// TIMELINE & NOTES
// ============================================

/**
 * GET /api/contacts/:id/timeline — unified timeline for a contact
 */
router.get('/:id/timeline', authenticateClient, async (req, res) => {
    try {
        const timeline = await db.getContactTimeline(req.user.id, req.params.id);
        res.json({ timeline });
    } catch (error) {
        log.error({ err: error }, 'contact_timeline_error');
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

/**
 * GET /api/contacts/:id/notes — list notes for a contact
 */
router.get('/:id/notes', authenticateClient, async (req, res) => {
    try {
        const notes = await db.getContactNotes(req.params.id);
        res.json({ notes });
    } catch (error) {
        log.error({ err: error }, 'contact_notes_list_error');
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

/**
 * POST /api/contacts/:id/notes — add a note
 */
router.post('/:id/notes', authenticateClient, async (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Note content is required' });
    }

    try {
        const note = await db.createContactNote({
            contactId: req.params.id,
            authorId: req.user.id,
            content: content.trim()
        });
        res.status(201).json({ note });

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'note',
                entityId: note.id,
                action: 'create',
                snapshot: { contactId: req.params.id, content: content.trim() }
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'create', entityType: 'note', entityId: note.id, contactId: req.params.id }
            });
        } catch (e) {
            log.error({ err: e }, 'note_create_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'note_create_error');
        res.status(500).json({ error: 'Failed to create note' });
    }
});

/**
 * PUT /api/contacts/:id/notes/:noteId — update a note
 */
router.put('/:id/notes/:noteId', authenticateClient, async (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Note content is required' });
    }

    try {
        await db.updateContactNote(req.params.noteId, content.trim());
        res.json({ success: true });

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'note',
                entityId: req.params.noteId,
                action: 'update',
                snapshot: { contactId: req.params.id, content: content.trim() }
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'update', entityType: 'note', entityId: req.params.noteId, contactId: req.params.id }
            });
        } catch (e) {
            log.error({ err: e }, 'note_update_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'note_update_error');
        res.status(500).json({ error: 'Failed to update note' });
    }
});

/**
 * DELETE /api/contacts/:id/notes/:noteId — delete a note
 */
router.delete('/:id/notes/:noteId', authenticateClient, async (req, res) => {
    try {
        await db.deleteContactNote(req.params.noteId);
        res.json({ success: true });

        // Sync logging + WS broadcast
        try {
            await db.logContactChange({
                clientId: req.user.id,
                entityType: 'note',
                entityId: req.params.noteId,
                action: 'delete',
                snapshot: { contactId: req.params.id }
            });
            state.broadcastToUserDevices(req.user.id, {
                type: 'contacts_changed',
                data: { action: 'delete', entityType: 'note', entityId: req.params.noteId, contactId: req.params.id }
            });
        } catch (e) {
            log.error({ err: e }, 'note_delete_sync_log_error');
        }
    } catch (error) {
        log.error({ err: error }, 'note_delete_error');
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

module.exports = router;
