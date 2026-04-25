"use strict";
/**
 * Voicemail Service — Business logic for video messaging
 *
 * Manages voicemail recording sessions, message CRUD, storage quota,
 * automatic expiry, and real-time notifications.
 *
 * Follows the pattern of handoff-service.ts and queue-service.ts:
 * in-memory Map for active recording state + PostgreSQL for persistence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialize = initialize;
exports.shutdown = shutdown;
exports.startRecording = startRecording;
exports.completeRecording = completeRecording;
exports.failRecording = failRecording;
exports.cancelRecording = cancelRecording;
exports.getInbox = getInbox;
exports.getMessageWithPlayback = getMessageWithPlayback;
exports.deleteMessage = deleteMessage;
exports.markMessageSeen = markMessageSeen;
exports.getUnreadCount = getUnreadCount;
exports.expireOldMessages = expireOldMessages;
exports.getSettings = getSettings;
exports.updateSetting = updateSetting;
exports.getAllMessagesForAdmin = getAllMessagesForAdmin;
exports.getStats = getStats;
exports.adminDeleteMessage = adminDeleteMessage;
const uuid_1 = require("uuid");
const database_1 = require("../database");
const storage_service_1 = require("./storage-service");
// ============================================
// IN-MEMORY STATE
// ============================================
const activeRecordings = new Map();
// Broadcast function — set during initialization
let broadcastToClient = null;
// Expiry cleanup interval handle
let expiryInterval = null;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RECORDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max recording time
// ============================================
// INITIALIZATION
// ============================================
async function initialize(broadcastFn) {
    if (broadcastFn) {
        broadcastToClient = broadcastFn;
    }
    // Rehydrate active recordings from DB (in case of server restart)
    try {
        const recordings = await (0, database_1.getActiveVoicemailRecordings)();
        for (const rec of recordings) {
            activeRecordings.set(rec.id, {
                messageId: rec.id,
                roomName: rec.room_name,
                callerId: rec.caller_id,
                calleeId: rec.callee_id,
                calleePhone: rec.callee_phone,
                startedAt: new Date(rec.created_at)
            });
            // Mark stale recordings as failed (server restarted during recording)
            const elapsed = Date.now() - new Date(rec.created_at).getTime();
            if (elapsed > RECORDING_TIMEOUT_MS) {
                await failRecording(rec.id, 'Server restarted during recording');
                activeRecordings.delete(rec.id);
            }
        }
    }
    catch (err) {
        console.error('[Voicemail] Failed to rehydrate recordings:', err);
    }
    // Start periodic expiry cleanup
    expiryInterval = setInterval(async () => {
        try {
            const count = await expireOldMessages();
            if (count > 0) {
                console.log(`[Voicemail] Expired ${count} old message(s)`);
            }
        }
        catch (err) {
            console.error('[Voicemail] Expiry cleanup failed:', err);
        }
    }, CLEANUP_INTERVAL_MS);
    console.log('[Voicemail] Service initialized');
}
// ============================================
// RECORDING SESSION MANAGEMENT
// ============================================
async function startRecording(callerId, calleeId, calleePhone) {
    // Check if voicemail is enabled
    const enabled = await (0, database_1.getVoicemailSetting)('vm-enabled');
    if (enabled !== 'true') {
        throw new Error('Voicemail is currently disabled');
    }
    // Get max duration setting
    const maxLengthStr = await (0, database_1.getVoicemailSetting)('vm-max-length');
    const maxDurationSeconds = parseInt(maxLengthStr || '180', 10);
    // Check callee quota if callee is known
    if (calleeId) {
        const maxMessagesStr = await (0, database_1.getVoicemailSetting)('vm-max-messages');
        const maxMessages = parseInt(maxMessagesStr || '100', 10);
        const currentCount = await (0, database_1.getVoicemailMessageCount)(calleeId);
        if (currentCount >= maxMessages) {
            throw new Error('Recipient voicemail inbox is full');
        }
        const quotaMbStr = await (0, database_1.getVoicemailSetting)('vm-storage-quota-mb');
        const quotaBytes = parseInt(quotaMbStr || '500', 10) * 1024 * 1024;
        const currentUsage = await (0, database_1.getVoicemailStorageUsage)(calleeId);
        if (currentUsage >= quotaBytes) {
            throw new Error('Recipient storage quota exceeded');
        }
    }
    // Generate unique ID and room name
    const messageId = (0, uuid_1.v4)();
    const roomName = `voicemail-${messageId.substring(0, 8)}`;
    const recordingFilename = `${messageId}.mp4`;
    const storageKey = `recordings/${messageId}.mp4`;
    // Calculate expiry date
    const retentionDaysStr = await (0, database_1.getVoicemailSetting)('vm-retention-days');
    const retentionDays = parseInt(retentionDaysStr || '30', 10);
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    // Create DB record
    await (0, database_1.createVoicemailMessage)({
        id: messageId,
        callerId,
        calleeId,
        calleePhone,
        roomName,
        recordingFilename,
        storageKey,
        expiresAt
    });
    // Track in memory
    activeRecordings.set(messageId, {
        messageId,
        roomName,
        callerId,
        calleeId,
        calleePhone,
        startedAt: new Date()
    });
    // Auto-timeout the recording after max duration + buffer
    setTimeout(async () => {
        const active = activeRecordings.get(messageId);
        if (active) {
            // Recording is still active after timeout — Jibri should stop it
            // The actual completion comes via the Jibri callback
            console.log(`[Voicemail] Recording ${messageId} reached max duration`);
        }
    }, (maxDurationSeconds + 30) * 1000);
    await (0, database_1.logActivity)('voicemail_recording_started', `Voicemail recording started for room ${roomName}`, { messageId, callerId, calleeId }, callerId);
    return { messageId, roomName, maxDurationSeconds };
}
async function completeRecording(messageId, storageKey, durationSeconds, fileSizeBytes) {
    const active = activeRecordings.get(messageId);
    // Update DB record
    await (0, database_1.updateVoicemailMessage)(messageId, {
        status: 'available',
        storage_key: storageKey,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        content_type: 'video/mp4'
    });
    // Remove from active recordings
    activeRecordings.delete(messageId);
    // Notify the caller that recording is complete
    if (active && broadcastToClient) {
        broadcastToClient(active.callerId, {
            type: 'voicemail_recording_complete',
            data: { messageId, durationSeconds }
        });
        // Notify the callee if they're online
        if (active.calleeId && broadcastToClient) {
            const count = await (0, database_1.getVoicemailUnreadCount)(active.calleeId);
            broadcastToClient(active.calleeId, {
                type: 'voicemail_new_message',
                data: { messageId, calleeId: active.calleeId }
            });
            broadcastToClient(active.calleeId, {
                type: 'voicemail_unread_count',
                data: { count }
            });
        }
    }
    await (0, database_1.logActivity)('voicemail_recording_complete', `Voicemail ${messageId} is now available`, { messageId, durationSeconds, fileSizeBytes }, null);
}
async function failRecording(messageId, reason) {
    await (0, database_1.updateVoicemailMessage)(messageId, {
        status: 'failed'
    });
    activeRecordings.delete(messageId);
    const active = activeRecordings.get(messageId);
    if (active && broadcastToClient) {
        broadcastToClient(active.callerId, {
            type: 'voicemail_error',
            data: { message: `Recording failed: ${reason}` }
        });
    }
    await (0, database_1.logActivity)('voicemail_recording_failed', `Voicemail ${messageId} failed: ${reason}`, { messageId, reason }, null);
}
async function cancelRecording(messageId, callerId) {
    const active = activeRecordings.get(messageId);
    if (!active || active.callerId !== callerId) {
        throw new Error('Recording not found or not owned by caller');
    }
    await (0, database_1.deleteVoicemailMessage)(messageId);
    activeRecordings.delete(messageId);
    await (0, database_1.logActivity)('voicemail_recording_cancelled', `Voicemail ${messageId} cancelled by caller`, { messageId }, callerId);
}
// ============================================
// MESSAGE OPERATIONS
// ============================================
async function getInbox(calleeId, limit = 20, offset = 0) {
    const [messages, total, unreadCount] = await Promise.all([
        (0, database_1.getVoicemailInbox)(calleeId, limit, offset),
        (0, database_1.getVoicemailInboxCount)(calleeId),
        (0, database_1.getVoicemailUnreadCount)(calleeId)
    ]);
    // Generate thumbnail presigned URLs
    const storage = (0, storage_service_1.getStorageService)();
    const messagesWithThumbnails = await Promise.all(messages.map(async (msg) => {
        const result = { ...msg };
        if (storage?.isInitialized() && msg.thumbnail_key) {
            try {
                result.thumbnailUrl = await storage.getPresignedUrl(msg.thumbnail_key, { expiresIn: 3600, responseContentType: 'image/jpeg' });
            }
            catch {
                // Thumbnail URL generation failed — skip it
            }
        }
        return result;
    }));
    return {
        messages: messagesWithThumbnails,
        total: total,
        unreadCount: unreadCount
    };
}
async function getMessageWithPlayback(messageId, requesterId) {
    const message = await (0, database_1.getVoicemailMessage)(messageId);
    if (!message) {
        throw new Error('Message not found');
    }
    const msg = message;
    // Verify requester is caller or callee
    if (msg.caller_id !== requesterId && msg.callee_id !== requesterId) {
        throw new Error('Not authorized to view this message');
    }
    // Generate presigned playback URL
    const storage = (0, storage_service_1.getStorageService)();
    let playbackUrl = '';
    if (storage?.isInitialized()) {
        playbackUrl = await storage.getPresignedUrl(msg.storage_key, { expiresIn: 3600, responseContentType: 'video/mp4' });
    }
    // Mark as seen if requester is callee
    if (msg.callee_id === requesterId && !msg.seen) {
        await (0, database_1.markVoicemailSeen)(messageId, requesterId);
        msg.seen = true;
    }
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    return {
        ...msg,
        playbackUrl,
        playbackUrlExpiresAt: expiresAt
    };
}
async function deleteMessage(messageId, requesterId) {
    const message = await (0, database_1.getVoicemailMessage)(messageId);
    if (!message) {
        throw new Error('Message not found');
    }
    const msg = message;
    // Verify requester is caller or callee
    if (msg.caller_id !== requesterId && msg.callee_id !== requesterId) {
        throw new Error('Not authorized to delete this message');
    }
    // Delete files from MinIO
    const storage = (0, storage_service_1.getStorageService)();
    if (storage?.isInitialized()) {
        const keysToDelete = [msg.storage_key];
        if (msg.thumbnail_key) {
            keysToDelete.push(msg.thumbnail_key);
        }
        try {
            await storage.deleteFiles(keysToDelete);
        }
        catch (err) {
            console.error('[Voicemail] Failed to delete files from storage:', err);
            // Continue with DB deletion even if storage deletion fails
        }
    }
    await (0, database_1.deleteVoicemailMessage)(messageId);
    await (0, database_1.logActivity)('voicemail_deleted', `Voicemail ${messageId} deleted`, { messageId }, requesterId);
}
async function markMessageSeen(messageId, calleeId) {
    await (0, database_1.markVoicemailSeen)(messageId, calleeId);
}
async function getUnreadCount(calleeId) {
    return (0, database_1.getVoicemailUnreadCount)(calleeId);
}
// ============================================
// MESSAGE EXPIRY
// ============================================
async function expireOldMessages() {
    const expired = await (0, database_1.getExpiredVoicemailMessages)();
    const storage = (0, storage_service_1.getStorageService)();
    for (const msg of expired) {
        const m = msg;
        // Delete files from MinIO
        if (storage?.isInitialized()) {
            const keysToDelete = [m.storage_key];
            if (m.thumbnail_key) {
                keysToDelete.push(m.thumbnail_key);
            }
            try {
                await storage.deleteFiles(keysToDelete);
            }
            catch (err) {
                console.error(`[Voicemail] Failed to delete expired files for ${m.id}:`, err);
            }
        }
        await (0, database_1.deleteVoicemailMessage)(m.id);
    }
    if (expired.length > 0) {
        await (0, database_1.logActivity)('voicemail_expired', `Expired ${expired.length} voicemail message(s)`, { count: expired.length }, null);
    }
    return expired.length;
}
// ============================================
// ADMIN OPERATIONS
// ============================================
async function getSettings() {
    return (0, database_1.getAllVoicemailSettings)();
}
async function updateSetting(key, value, adminId) {
    await (0, database_1.setVoicemailSetting)(key, value, adminId);
    await (0, database_1.logActivity)('voicemail_setting_updated', `Voicemail setting ${key} updated`, { key, value }, adminId);
}
async function getAllMessagesForAdmin(filters) {
    return (0, database_1.getVoicemailStorageStats)();
}
async function getStats() {
    const stats = await (0, database_1.getVoicemailStorageStats)();
    return {
        totalMessages: stats.total_messages || 0,
        totalSizeBytes: stats.total_size_bytes || 0,
        activeRecordings: stats.active_recordings || 0
    };
}
async function adminDeleteMessage(messageId) {
    const message = await (0, database_1.getVoicemailMessage)(messageId);
    if (!message) {
        throw new Error('Message not found');
    }
    const msg = message;
    const storage = (0, storage_service_1.getStorageService)();
    if (storage?.isInitialized()) {
        const keysToDelete = [msg.storage_key];
        if (msg.thumbnail_key) {
            keysToDelete.push(msg.thumbnail_key);
        }
        try {
            await storage.deleteFiles(keysToDelete);
        }
        catch (err) {
            console.error('[Voicemail] Failed to delete files:', err);
        }
    }
    await (0, database_1.deleteVoicemailMessage)(messageId);
    await (0, database_1.logActivity)('voicemail_admin_deleted', `Admin deleted voicemail ${messageId}`, { messageId }, null);
}
// ============================================
// SHUTDOWN
// ============================================
function shutdown() {
    if (expiryInterval) {
        clearInterval(expiryInterval);
        expiryInterval = null;
    }
    activeRecordings.clear();
    console.log('[Voicemail] Service shut down');
}
//# sourceMappingURL=voicemail-service.js.map