/**
 * Contacts & Address Book API — CRUD, groups, block list, merge/dedup, import.
 */

const express = require('express');
const db = require('../database');
const { verifyJwtToken, normalizeAuthClaims } = require('../lib/auth');
const state = require('../lib/state');
const {
    validate,
    z,
    idSchema,
    nameSchema,
    emailSchema,
    phoneNumberSchema,
    sanitizedStringSchema,
    optionalSanitizedStringSchema,
    emptyBodySchema
} = require('../lib/validation');

const router = express.Router();

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional();
const contactHandleSchema = z.string()
    .min(3)
    .max(31)
    .transform(value => value.trim().replace(/^@+/, '').toLowerCase())
    .refine(value => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(value), 'Invalid handle')
    .optional()
    .nullable();
const importPhoneSchema = z.string()
    .max(60)
    .transform(value => value.replace(/[^\d+]/g, ''))
    .refine(value => !value || /^\+?\d{7,16}$/.test(value), 'Invalid phone number format')
    .optional()
    .nullable();
const contactBaseSchema = {
    name: nameSchema,
    email: emailSchema.optional().nullable(),
    phoneNumber: phoneNumberSchema.optional().nullable(),
    contactHandle: contactHandleSchema,
    organization: optionalSanitizedStringSchema.nullable(),
    notes: optionalSanitizedStringSchema.nullable(),
    avatarColor: colorSchema,
    isFavorite: z.boolean().optional(),
    linkedClientId: idSchema.optional().nullable(),
    groupIds: z.array(idSchema).max(50).optional()
};
const createContactSchema = z.object(contactBaseSchema);
const updateContactSchema = z.object({
    ...Object.fromEntries(Object.entries(contactBaseSchema).map(([key, schema]) => [key, schema.optional()])),
    groupIds: z.array(idSchema).max(50).optional()
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
const createGroupSchema = z.object({
    name: nameSchema,
    color: colorSchema,
    sortOrder: z.coerce.number().int().nonnegative().optional()
});
const updateGroupSchema = z.object({
    name: nameSchema.optional(),
    color: colorSchema,
    sortOrder: z.coerce.number().int().nonnegative().optional()
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
const groupAssignmentSchema = z.object({ groupIds: z.array(idSchema).max(50) });
const blockContactSchema = z.object({
    blockedPhone: phoneNumberSchema.optional(),
    blockedEmail: emailSchema.optional(),
    blockedClientId: idSchema.optional(),
    reason: optionalSanitizedStringSchema
}).refine(data => data.blockedPhone || data.blockedEmail || data.blockedClientId, {
    message: 'Must specify phone, email, or client ID to block'
});
const mergeContactsSchema = z.object({
    primaryId: idSchema,
    secondaryIds: z.array(idSchema).min(1).max(50)
});
const importContactSchema = z.object({
    ...contactBaseSchema,
    name: nameSchema.optional(),
    phoneNumber: importPhoneSchema
}).refine(contact => contact.name || contact.email || contact.phoneNumber, {
    message: 'Imported contact must include name, email, or phone number'
});
const importContactsSchema = z.object({
    contacts: z.array(importContactSchema).min(1).max(500)
});
const noteSchema = z.object({
    content: sanitizedStringSchema.refine(value => value.trim().length > 0, 'Note content is required')
});

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
        console.error('[Contacts Sync] Error:', error);
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
        console.error('[Contact Detail] Error:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

/**
 * POST /api/contacts — create a contact
 */
router.post('/', authenticateClient, validate(createContactSchema), async (req, res) => {
    const { name, email, phoneNumber, contactHandle, organization, notes, avatarColor, isFavorite, linkedClientId, groupIds } = req.body;

    try {
        const contact = await db.createContact({
            clientId: req.user.id,
            name,
            email,
            phoneNumber,
            contactHandle,
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
            console.error('[Contact Create Sync Log] Error:', e);
        }
    } catch (error) {
        console.error('[Contact Create] Error:', error);
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

/**
 * PUT /api/contacts/:id — update a contact
 */
router.put('/:id', authenticateClient, validate(updateContactSchema), async (req, res) => {
    const { name, email, phoneNumber, contactHandle, organization, notes, avatarColor, isFavorite, linkedClientId, groupIds } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
        if (contactHandle !== undefined) updates.contact_handle = contactHandle;
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
            console.error('[Contact Update Sync Log] Error:', e);
        }
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
            console.error('[Contact Delete Sync Log] Error:', e);
        }
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
router.post('/groups', authenticateClient, validate(createGroupSchema), async (req, res) => {
    const { name, color, sortOrder } = req.body;

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
router.put('/groups/:groupId', authenticateClient, validate(updateGroupSchema), async (req, res) => {
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
router.put('/:id/groups', authenticateClient, validate(groupAssignmentSchema), async (req, res) => {
    const { groupIds } = req.body;

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
router.post('/blocked', authenticateClient, validate(blockContactSchema), async (req, res) => {
    const { blockedPhone, blockedEmail, blockedClientId, reason } = req.body;

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
router.post('/merge', authenticateClient, validate(mergeContactsSchema), async (req, res) => {
    const { primaryId, secondaryIds } = req.body;

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
router.post('/import', authenticateClient, validate(importContactsSchema), async (req, res) => {
    const { contacts } = req.body;

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
            console.error('[Contact Import Sync Log] Error:', e);
        }
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
router.post('/migrate-speed-dial', authenticateClient, validate(emptyBodySchema), async (req, res) => {
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
            console.error('[Speed Dial Migration Sync Log] Error:', e);
        }
    } catch (error) {
        console.error('[Migrate Speed Dial] Error:', error);
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
        console.error('[Contact Timeline] Error:', error);
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
        console.error('[Contact Notes List] Error:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

/**
 * POST /api/contacts/:id/notes — add a note
 */
router.post('/:id/notes', authenticateClient, validate(noteSchema), async (req, res) => {
    const { content } = req.body;

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
            console.error('[Note Create Sync Log] Error:', e);
        }
    } catch (error) {
        console.error('[Note Create] Error:', error);
        res.status(500).json({ error: 'Failed to create note' });
    }
});

/**
 * PUT /api/contacts/:id/notes/:noteId — update a note
 */
router.put('/:id/notes/:noteId', authenticateClient, validate(noteSchema), async (req, res) => {
    const { content } = req.body;

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
            console.error('[Note Update Sync Log] Error:', e);
        }
    } catch (error) {
        console.error('[Note Update] Error:', error);
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
            console.error('[Note Delete Sync Log] Error:', e);
        }
    } catch (error) {
        console.error('[Note Delete] Error:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

module.exports = router;
