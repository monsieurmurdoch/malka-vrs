/**
 * Voicemail Service — Business logic for video messaging
 *
 * Manages voicemail recording sessions, message CRUD, storage quota,
 * automatic expiry, and real-time notifications.
 *
 * Follows the pattern of handoff-service.ts and queue-service.ts:
 * in-memory Map for active recording state + PostgreSQL for persistence.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    createVoicemailMessage,
    getVoicemailMessage,
    updateVoicemailMessage,
    deleteVoicemailMessage,
    getVoicemailInbox,
    getVoicemailInboxCount,
    getVoicemailUnreadCount,
    markVoicemailSeen,
    getVoicemailStorageUsage,
    getVoicemailMessageCount,
    getExpiredVoicemailMessages,
    getActiveVoicemailRecordings,
    getVoicemailSetting,
    getAllVoicemailSettings,
    setVoicemailSetting,
    getVoicemailStorageStats,
    logActivity
} from '../database';
import { getStorageService } from './storage-service';
import { createModuleLogger } from './logger';

const log = createModuleLogger('voicemail');

// ============================================
// TYPES
// ============================================

interface ActiveRecording {
    messageId: string;
    roomName: string;
    callerId: string;
    calleeId: string | null;
    calleePhone: string | null;
    startedAt: Date;
}

export interface VoicemailSettings {
    maxMessageLengthSeconds: number;
    retentionDays: number;
    maxMessagesPerUser: number;
    storageQuotaMbPerUser: number;
    enabled: boolean;
}

export interface StartRecordingResult {
    messageId: string;
    roomName: string;
    maxDurationSeconds: number;
}

export interface InboxResult {
    messages: Record<string, unknown>[];
    total: number;
    unreadCount: number;
}

export interface MessageWithPlayback extends Record<string, unknown> {
    playbackUrl: string;
    playbackUrlExpiresAt: string;
}

export interface StorageStats {
    totalMessages: number;
    totalSizeBytes: number;
    activeRecordings: number;
}

export interface CompleteRecordingOptions {
    contentType?: string;
    thumbnailKey?: string | null;
    originalStorageKey?: string | null;
    compressed?: boolean;
}

export interface StorageVerificationResult {
    ok: boolean;
    reason?: string;
    key?: string;
    size?: number;
    presignedUrlCreated?: boolean;
    checkedAt: string;
}

export interface ExpiryJobStatus {
    lastRunAt: string | null;
    lastExpiredCount: number;
    lastError: string | null;
}

// ============================================
// IN-MEMORY STATE
// ============================================

const activeRecordings = new Map<string, ActiveRecording>();

// Broadcast function — set during initialization
let broadcastToClient: ((userId: string, message: object) => void) | null = null;

// Expiry cleanup interval handle
let expiryInterval: ReturnType<typeof setInterval> | null = null;
let lastExpiryRunAt: string | null = null;
let lastExpiryExpiredCount = 0;
let lastExpiryError: string | null = null;

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RECORDING_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes max recording time

// ============================================
// INITIALIZATION
// ============================================

async function initialize(broadcastFn?: (userId: string, message: object) => void): Promise<void> {
    if (broadcastFn) {
        broadcastToClient = broadcastFn;
    }

    // Rehydrate active recordings from DB (in case of server restart)
    try {
        const recordings = await getActiveVoicemailRecordings();
        for (const rec of recordings) {
            activeRecordings.set((rec as Record<string, unknown>).id as string, {
                messageId: (rec as Record<string, unknown>).id as string,
                roomName: (rec as Record<string, unknown>).room_name as string,
                callerId: (rec as Record<string, unknown>).caller_id as string,
                calleeId: (rec as Record<string, unknown>).callee_id as string | null,
                calleePhone: (rec as Record<string, unknown>).callee_phone as string | null,
                startedAt: new Date((rec as Record<string, unknown>).created_at as string)
            });

            // Mark stale recordings as failed (server restarted during recording)
            const elapsed = Date.now() - new Date((rec as Record<string, unknown>).created_at as string).getTime();
            if (elapsed > RECORDING_TIMEOUT_MS) {
                await failRecording((rec as Record<string, unknown>).id as string, 'Server restarted during recording');
                activeRecordings.delete((rec as Record<string, unknown>).id as string);
            }
        }
    } catch (err) {
        log.error({ err }, 'Failed to rehydrate voicemail recordings');
    }

    // Start periodic expiry cleanup
    expiryInterval = setInterval(async () => {
        try {
            const count = await expireOldMessages();
            if (count > 0) {
                log.info({ count }, 'Expired old voicemail messages');
            }
        } catch (err) {
            log.error({ err }, 'Voicemail expiry cleanup failed');
        }
    }, CLEANUP_INTERVAL_MS);

    log.info('Voicemail service initialized');
}

// ============================================
// RECORDING SESSION MANAGEMENT
// ============================================

async function startRecording(callerId: string, calleeId: string | null, calleePhone: string | null): Promise<StartRecordingResult> {
    // Check if voicemail is enabled
    const enabled = await getVoicemailSetting('vm-enabled');
    if (enabled !== 'true') {
        throw new Error('Voicemail is currently disabled');
    }

    // Get max duration setting
    const maxLengthStr = await getVoicemailSetting('vm-max-length');
    const maxDurationSeconds = parseInt(maxLengthStr || '180', 10);

    // Check callee quota if callee is known
    if (calleeId) {
        const maxMessagesStr = await getVoicemailSetting('vm-max-messages');
        const maxMessages = parseInt(maxMessagesStr || '100', 10);
        const currentCount = await getVoicemailMessageCount(calleeId);
        if (currentCount >= maxMessages) {
            throw new Error('Recipient voicemail inbox is full');
        }

        const quotaMbStr = await getVoicemailSetting('vm-storage-quota-mb');
        const quotaBytes = parseInt(quotaMbStr || '500', 10) * 1024 * 1024;
        const currentUsage = await getVoicemailStorageUsage(calleeId);
        if (currentUsage >= quotaBytes) {
            throw new Error('Recipient storage quota exceeded');
        }
    }

    // Generate unique ID and room name
    const messageId = uuidv4();
    const roomName = `voicemail-${messageId.substring(0, 8)}`;
    const recordingFilename = `${messageId}.mp4`;
    const storageKey = `recordings/${messageId}.mp4`;

    // Calculate expiry date
    const retentionDaysStr = await getVoicemailSetting('vm-retention-days');
    const retentionDays = parseInt(retentionDaysStr || '30', 10);
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    // Create DB record
    await createVoicemailMessage({
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
    const timeout = setTimeout(async () => {
        const active = activeRecordings.get(messageId);
        if (active) {
            // Recording is still active after timeout — Jibri should stop it
            // The actual completion comes via the Jibri callback
            log.warn({ messageId }, 'Voicemail recording reached max duration');
        }
    }, (maxDurationSeconds + 30) * 1000);
    timeout.unref?.();

    await logActivity('voicemail_recording_started', `Voicemail recording started for room ${roomName}`, { messageId, callerId, calleeId }, callerId);

    return { messageId, roomName, maxDurationSeconds };
}

function getContentTypeForStorageKey(storageKey: string, contentType?: string): string {
    if (contentType) {
        return contentType;
    }

    const lower = storageKey.toLowerCase();

    if (lower.endsWith('.webm')) {
        return 'video/webm';
    }

    if (lower.endsWith('.mkv')) {
        return 'video/x-matroska';
    }

    return 'video/mp4';
}

async function deliverVoicemailNotification(
        active: ActiveRecording | undefined,
        messageId: string,
        unreadCount: number
): Promise<void> {
    if (!active?.calleeId) {
        return;
    }

    const webhookUrl = process.env.VOICEMAIL_NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl || typeof fetch !== 'function') {
        return;
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'voicemail_new_message',
                messageId,
                callerId: active.callerId,
                calleeId: active.calleeId,
                calleePhone: active.calleePhone,
                unreadCount,
                createdAt: new Date().toISOString()
            })
        });
    } catch (err) {
        log.error({ err, messageId }, 'External voicemail notification delivery failed');
    }
}

async function completeRecording(
        messageId: string,
        storageKey: string,
        durationSeconds: number,
        fileSizeBytes: number,
        options: CompleteRecordingOptions = {}
): Promise<void> {
    const active = activeRecordings.get(messageId);
    const contentType = getContentTypeForStorageKey(storageKey, options.contentType);
    const updates: Record<string, unknown> = {
        status: 'available',
        storage_key: storageKey,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        content_type: contentType
    };

    if (options.thumbnailKey) {
        updates.thumbnail_key = options.thumbnailKey;
    }

    // Update DB record
    await updateVoicemailMessage(messageId, updates);

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
            const count = await getVoicemailUnreadCount(active.calleeId);
            broadcastToClient(active.calleeId, {
                type: 'voicemail_new_message',
                data: { messageId, calleeId: active.calleeId }
            });
            broadcastToClient(active.calleeId, {
                type: 'voicemail_unread_count',
                data: { count }
            });
            await deliverVoicemailNotification(active, messageId, count);
        }
    }

    await logActivity(
        'voicemail_recording_complete',
        `Voicemail ${messageId} is now available`,
        {
            messageId,
            durationSeconds,
            fileSizeBytes,
            contentType,
            thumbnailKey: options.thumbnailKey || null,
            compressed: Boolean(options.compressed),
            originalStorageKey: options.originalStorageKey || null
        },
        null
    );
}

async function failRecording(messageId: string, reason: string): Promise<void> {
    await updateVoicemailMessage(messageId, {
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

    await logActivity('voicemail_recording_failed', `Voicemail ${messageId} failed: ${reason}`, { messageId, reason }, null);
}

async function cancelRecording(messageId: string, callerId: string): Promise<void> {
    const active = activeRecordings.get(messageId);
    if (!active || active.callerId !== callerId) {
        throw new Error('Recording not found or not owned by caller');
    }

    await deleteVoicemailMessage(messageId);
    activeRecordings.delete(messageId);

    await logActivity('voicemail_recording_cancelled', `Voicemail ${messageId} cancelled by caller`, { messageId }, callerId);
}

// ============================================
// MESSAGE OPERATIONS
// ============================================

async function getInbox(calleeId: string, limit: number = 20, offset: number = 0): Promise<InboxResult> {
    const [messages, total, unreadCount] = await Promise.all([
        getVoicemailInbox(calleeId, limit, offset),
        getVoicemailInboxCount(calleeId),
        getVoicemailUnreadCount(calleeId)
    ]);

    // Generate thumbnail presigned URLs
    const storage = getStorageService();
    const messagesWithThumbnails = await Promise.all(
        messages.map(async (msg: Record<string, unknown>) => {
            const result = { ...msg };
            if (storage?.isInitialized() && (msg as Record<string, unknown>).thumbnail_key) {
                try {
                    (result as Record<string, unknown>).thumbnailUrl = await storage.getPresignedUrl(
                        (msg as Record<string, unknown>).thumbnail_key as string,
                        { expiresIn: 3600, responseContentType: 'image/jpeg' }
                    );
                } catch {
                    // Thumbnail URL generation failed — skip it
                }
            }
            return result;
        })
    );

    return {
        messages: messagesWithThumbnails,
        total: total as number,
        unreadCount: unreadCount as number
    };
}

async function getMessageWithPlayback(messageId: string, requesterId: string): Promise<MessageWithPlayback> {
    const message = await getVoicemailMessage(messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    const msg = message as Record<string, unknown>;

    // Verify requester is caller or callee
    if (msg.caller_id !== requesterId && msg.callee_id !== requesterId) {
        throw new Error('Not authorized to view this message');
    }

    // Generate presigned playback URL
    const storage = getStorageService();
    let playbackUrl = '';
    if (storage?.isInitialized()) {
        playbackUrl = await storage.getPresignedUrl(
            msg.storage_key as string,
            { expiresIn: 3600, responseContentType: getContentTypeForStorageKey(msg.storage_key as string, msg.content_type as string) }
        );
    }

    // Mark as seen if requester is callee
    if (msg.callee_id === requesterId && !msg.seen) {
        await markVoicemailSeen(messageId, requesterId);
        msg.seen = true;
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
        ...msg,
        playbackUrl,
        playbackUrlExpiresAt: expiresAt
    } as MessageWithPlayback;
}

async function deleteMessage(messageId: string, requesterId: string): Promise<void> {
    const message = await getVoicemailMessage(messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    const msg = message as Record<string, unknown>;

    // Verify requester is caller or callee
    if (msg.caller_id !== requesterId && msg.callee_id !== requesterId) {
        throw new Error('Not authorized to delete this message');
    }

    // Delete files from MinIO
    const storage = getStorageService();
    if (storage?.isInitialized()) {
        const keysToDelete: string[] = [msg.storage_key as string];
        if (msg.thumbnail_key) {
            keysToDelete.push(msg.thumbnail_key as string);
        }
        try {
            await storage.deleteFiles(keysToDelete);
        } catch (err) {
            log.error({ err, messageId }, 'Failed to delete voicemail files from storage');
            // Continue with DB deletion even if storage deletion fails
        }
    }

    await deleteVoicemailMessage(messageId);
    await logActivity('voicemail_deleted', `Voicemail ${messageId} deleted`, { messageId }, requesterId);
}

async function markMessageSeen(messageId: string, calleeId: string): Promise<void> {
    await markVoicemailSeen(messageId, calleeId);
}

async function getUnreadCount(calleeId: string): Promise<number> {
    return getVoicemailUnreadCount(calleeId);
}

// ============================================
// MESSAGE EXPIRY
// ============================================

async function expireOldMessages(): Promise<number> {
    lastExpiryRunAt = new Date().toISOString();
    lastExpiryError = null;

    const expired = await getExpiredVoicemailMessages();
    const storage = getStorageService();

    for (const msg of expired) {
        const m = msg as Record<string, unknown>;

        // Delete files from MinIO
        if (storage?.isInitialized()) {
            const keysToDelete: string[] = [m.storage_key as string];
            if (m.thumbnail_key) {
                keysToDelete.push(m.thumbnail_key as string);
            }
            try {
                await storage.deleteFiles(keysToDelete);
            } catch (err) {
                log.error({ err, messageId: m.id }, 'Failed to delete expired voicemail files');
            }
        }

        await deleteVoicemailMessage(m.id as string);
    }

    if (expired.length > 0) {
        await logActivity('voicemail_expired', `Expired ${expired.length} voicemail message(s)`, { count: expired.length }, null);
    }

    lastExpiryExpiredCount = expired.length;

    return expired.length;
}

function getExpiryJobStatus(): ExpiryJobStatus {
    return {
        lastRunAt: lastExpiryRunAt,
        lastExpiredCount: lastExpiryExpiredCount,
        lastError: lastExpiryError
    };
}

async function runExpiryJobNow(): Promise<ExpiryJobStatus> {
    try {
        await expireOldMessages();
    } catch (err: any) {
        lastExpiryRunAt = new Date().toISOString();
        lastExpiryError = err?.message || 'Expiry job failed';
        throw err;
    }

    return getExpiryJobStatus();
}

async function verifyObjectStoragePath(): Promise<StorageVerificationResult> {
    const storage = getStorageService();
    const checkedAt = new Date().toISOString();

    if (!storage?.isInitialized()) {
        return {
            ok: false,
            reason: 'storage_unavailable',
            checkedAt
        };
    }

    const key = `health/voicemail-storage-check-${uuidv4()}.txt`;
    const body = Buffer.from(`voicemail-storage-check ${checkedAt}\n`, 'utf8');

    try {
        await storage.uploadBuffer(body, key, 'text/plain');
        const exists = await storage.fileExists(key);
        const stats = await storage.getFileStats(key);
        const presignedUrl = await storage.getPresignedUrl(key, {
            expiresIn: 60,
            responseContentType: 'text/plain'
        });

        return {
            ok: exists && stats.size === body.length && Boolean(presignedUrl),
            key,
            size: stats.size,
            presignedUrlCreated: Boolean(presignedUrl),
            checkedAt
        };
    } catch (err: any) {
        return {
            ok: false,
            reason: err?.message || 'storage_check_failed',
            key,
            checkedAt
        };
    } finally {
        try {
            await storage.deleteFile(key);
        } catch {
            // The storage check should report write/read health, not fail because
            // cleanup of the temporary probe object was already best-effort.
        }
    }
}

// ============================================
// ADMIN OPERATIONS
// ============================================

async function getSettings(): Promise<Record<string, unknown>[]> {
    return getAllVoicemailSettings();
}

async function updateSetting(key: string, value: string, adminId: string): Promise<void> {
    await setVoicemailSetting(key, value, adminId);
    await logActivity('voicemail_setting_updated', `Voicemail setting ${key} updated`, { key, value }, adminId);
}

async function getAllMessagesForAdmin(filters: { status?: string; callerId?: string; calleeId?: string; limit?: number; offset?: number }) {
    return getVoicemailStorageStats();
}

async function getStats(): Promise<StorageStats> {
    const stats = await getVoicemailStorageStats();
    return {
        totalMessages: (stats as Record<string, unknown>).total_messages as number || 0,
        totalSizeBytes: (stats as Record<string, unknown>).total_size_bytes as number || 0,
        activeRecordings: (stats as Record<string, unknown>).active_recordings as number || 0
    };
}

async function adminDeleteMessage(messageId: string): Promise<void> {
    const message = await getVoicemailMessage(messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    const msg = message as Record<string, unknown>;

    const storage = getStorageService();
    if (storage?.isInitialized()) {
        const keysToDelete: string[] = [msg.storage_key as string];
        if (msg.thumbnail_key) {
            keysToDelete.push(msg.thumbnail_key as string);
        }
        try {
            await storage.deleteFiles(keysToDelete);
        } catch (err) {
            log.error({ err, messageId }, 'Failed to delete voicemail files');
        }
    }

    await deleteVoicemailMessage(messageId);
    await logActivity('voicemail_admin_deleted', `Admin deleted voicemail ${messageId}`, { messageId }, null);
}

// ============================================
// SHUTDOWN
// ============================================

function shutdown(): void {
    if (expiryInterval) {
        clearInterval(expiryInterval);
        expiryInterval = null;
    }
    activeRecordings.clear();
    log.info('Voicemail service shut down');
}

// ============================================
// EXPORT
// ============================================

export {
    initialize,
    shutdown,
    startRecording,
    completeRecording,
    failRecording,
    cancelRecording,
    getInbox,
    getMessageWithPlayback,
    deleteMessage,
    markMessageSeen,
    getUnreadCount,
    expireOldMessages,
    getExpiryJobStatus,
    runExpiryJobNow,
    verifyObjectStoragePath,
    getSettings,
    updateSetting,
    getAllMessagesForAdmin,
    getStats,
    adminDeleteMessage
};
