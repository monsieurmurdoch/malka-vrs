/**
 * Voicemail Service Tests
 */

// Mock the compiled database module BEFORE requiring the compiled service.
jest.mock('../dist/database', () => ({
    createVoicemailMessage: jest.fn(),
    getVoicemailMessage: jest.fn(),
    updateVoicemailMessage: jest.fn(),
    deleteVoicemailMessage: jest.fn(),
    getVoicemailInbox: jest.fn(),
    getVoicemailInboxCount: jest.fn(),
    getVoicemailUnreadCount: jest.fn(),
    markVoicemailSeen: jest.fn(),
    getVoicemailStorageUsage: jest.fn(),
    getVoicemailMessageCount: jest.fn(),
    getExpiredVoicemailMessages: jest.fn(),
    getActiveVoicemailRecordings: jest.fn(),
    getVoicemailSetting: jest.fn(),
    getAllVoicemailSettings: jest.fn(),
    setVoicemailSetting: jest.fn(),
    getAllVoicemailMessages: jest.fn(),
    getVoicemailStorageStats: jest.fn(),
    logActivity: jest.fn()
}));

const mockStorage = {
    isInitialized: jest.fn(() => false),
    getPresignedUrl: jest.fn(),
    deleteFiles: jest.fn(),
    deleteFile: jest.fn(),
    uploadBuffer: jest.fn(),
    uploadFile: jest.fn(),
    fileExists: jest.fn(),
    getFileStats: jest.fn()
};

// Mock storage service
jest.mock('../dist/lib/storage-service', () => ({
    getStorageService: jest.fn(() => mockStorage),
    configureStorageService: jest.fn()
}));

const {
    initialize, startRecording, completeRecording, failRecording,
    cancelRecording, getInbox, deleteMessage,
    getUnreadCount, expireOldMessages, getSettings,
    updateSetting, getStats, verifyObjectStoragePath, shutdown
} = require('../dist/lib/voicemail-service');
const db = require('../dist/database');

describe('VoicemailService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Set default settings
        db.getVoicemailSetting.mockImplementation(async (key) => {
            const defaults = {
                'vm-enabled': 'true',
                'vm-max-length': '180',
                'vm-retention-days': '30',
                'vm-max-messages': '100',
                'vm-storage-quota-mb': '500'
            };
            return defaults[key] || null;
        });
        db.getActiveVoicemailRecordings.mockResolvedValue([]);
        db.getVoicemailMessageCount.mockResolvedValue(0);
        db.getVoicemailStorageUsage.mockResolvedValue(0);
        db.getVoicemailInboxCount.mockResolvedValue(0);
        db.getVoicemailUnreadCount.mockResolvedValue(0);
        mockStorage.isInitialized.mockReturnValue(false);
        mockStorage.getPresignedUrl.mockReset();
        mockStorage.deleteFiles.mockReset();
        mockStorage.deleteFile.mockReset();
        mockStorage.uploadBuffer.mockReset();
        mockStorage.fileExists.mockReset();
        mockStorage.getFileStats.mockReset();
    });

    afterAll(() => {
        shutdown();
    });

    describe('initialize()', () => {
        it('should initialize without errors', async () => {
            await expect(initialize()).resolves.not.toThrow();
        });
    });

    describe('startRecording()', () => {
        it('should create a recording session', async () => {
            db.createVoicemailMessage.mockResolvedValue();
            const result = await startRecording('caller-1', 'callee-1', '+15551234567');

            expect(result).toHaveProperty('messageId');
            expect(result).toHaveProperty('roomName');
            expect(result).toHaveProperty('maxDurationSeconds', 180);
            expect(result.roomName).toMatch(/^voicemail-/);
            expect(db.createVoicemailMessage).toHaveBeenCalled();
        });

        it('should reject if voicemail is disabled', async () => {
            db.getVoicemailSetting.mockImplementation(async (key) => {
                if (key === 'vm-enabled') return 'false';
                return null;
            });

            await expect(startRecording('caller-1', null, null))
                .rejects.toThrow('disabled');
        });

        it('should reject if callee inbox is full', async () => {
            db.getVoicemailMessageCount.mockResolvedValue(100);

            await expect(startRecording('caller-1', 'callee-1', '+15551234567'))
                .rejects.toThrow('full');
        });

        it('should reject if callee storage quota exceeded', async () => {
            db.getVoicemailStorageUsage.mockResolvedValue(500 * 1024 * 1024);

            await expect(startRecording('caller-1', 'callee-1', '+15551234567'))
                .rejects.toThrow('quota');
        });
    });

    describe('completeRecording()', () => {
        it('should update message status and notify', async () => {
            db.updateVoicemailMessage.mockResolvedValue();
            db.getVoicemailUnreadCount.mockResolvedValue(1);

            await expect(
                completeRecording('msg-1', 'recordings/msg-1.mp4', 45, 5242880)
            ).resolves.not.toThrow();

            expect(db.updateVoicemailMessage).toHaveBeenCalledWith('msg-1', expect.objectContaining({
                status: 'available',
                duration_seconds: 45,
                file_size_bytes: 5242880,
                content_type: 'video/mp4'
            }));
        });

        it('should persist thumbnail and content type metadata from the recorder', async () => {
            db.updateVoicemailMessage.mockResolvedValue();

            await completeRecording('msg-1', 'recordings/msg-1.webm', 45, 5242880, {
                contentType: 'video/webm',
                thumbnailKey: 'thumbnails/msg-1.jpg',
                compressed: false
            });

            expect(db.updateVoicemailMessage).toHaveBeenCalledWith('msg-1', expect.objectContaining({
                storage_key: 'recordings/msg-1.webm',
                thumbnail_key: 'thumbnails/msg-1.jpg',
                content_type: 'video/webm'
            }));
        });
    });

    describe('getInbox()', () => {
        it('should return messages with total and unread count', async () => {
            const mockMessages = [
                { id: 'm1', caller_name: 'Alice', duration_seconds: 30, seen: 0, created_at: '2026-04-15' },
                { id: 'm2', caller_name: 'Bob', duration_seconds: 60, seen: 1, created_at: '2026-04-14' }
            ];
            db.getVoicemailInbox.mockResolvedValue(mockMessages);
            db.getVoicemailInboxCount.mockResolvedValue(2);
            db.getVoicemailUnreadCount.mockResolvedValue(1);

            const result = await getInbox('callee-1');

            expect(result.messages).toHaveLength(2);
            expect(result.total).toBe(2);
            expect(result.unreadCount).toBe(1);
        });
    });

    describe('deleteMessage()', () => {
        it('should delete from DB', async () => {
            db.getVoicemailMessage.mockResolvedValue({
                id: 'm1', caller_id: 'c1', callee_id: 'c2',
                storage_key: 'rec/m1.mp4', thumbnail_key: null
            });
            db.deleteVoicemailMessage.mockResolvedValue();

            await deleteMessage('m1', 'c1');

            expect(db.deleteVoicemailMessage).toHaveBeenCalledWith('m1');
        });

        it('should reject if not owner', async () => {
            db.getVoicemailMessage.mockResolvedValue({
                id: 'm1', caller_id: 'c1', callee_id: 'c2'
            });

            await expect(deleteMessage('m1', 'c3'))
                .rejects.toThrow('Not authorized');
        });
    });

    describe('expireOldMessages()', () => {
        it('should delete expired messages', async () => {
            db.getExpiredVoicemailMessages.mockResolvedValue([
                { id: 'm1', storage_key: 'rec/m1.mp4', thumbnail_key: null }
            ]);
            db.deleteVoicemailMessage.mockResolvedValue();

            const count = await expireOldMessages();

            expect(count).toBe(1);
            expect(db.deleteVoicemailMessage).toHaveBeenCalledWith('m1');
        });

        it('should return 0 when no expired messages', async () => {
            db.getExpiredVoicemailMessages.mockResolvedValue([]);

            const count = await expireOldMessages();

            expect(count).toBe(0);
        });
    });

    describe('verifyObjectStoragePath()', () => {
        it('should report unavailable when object storage is not initialized', async () => {
            mockStorage.isInitialized.mockReturnValue(false);

            const result = await verifyObjectStoragePath();

            expect(result.ok).toBe(false);
            expect(result.reason).toBe('storage_unavailable');
        });

        it('should perform a write/stat/presign/delete probe when storage is initialized', async () => {
            mockStorage.isInitialized.mockReturnValue(true);
            mockStorage.uploadBuffer.mockResolvedValue({ key: 'health/test.txt', size: 42 });
            mockStorage.fileExists.mockResolvedValue(true);
            mockStorage.getFileStats.mockImplementation(async () => ({
                size: mockStorage.uploadBuffer.mock.calls[0][0].length
            }));
            mockStorage.getPresignedUrl.mockResolvedValue('https://storage.example/test');
            mockStorage.deleteFile.mockResolvedValue();

            const result = await verifyObjectStoragePath();

            expect(mockStorage.uploadBuffer).toHaveBeenCalled();
            expect(mockStorage.fileExists).toHaveBeenCalled();
            expect(mockStorage.getPresignedUrl).toHaveBeenCalled();
            expect(mockStorage.deleteFile).toHaveBeenCalled();
            expect(result.ok).toBe(true);
        });
    });

    describe('getSettings()', () => {
        it('should return all settings', async () => {
            const mockSettings = [
                { setting_key: 'vm-enabled', setting_value: 'true' },
                { setting_key: 'vm-max-length', setting_value: '180' }
            ];
            db.getAllVoicemailSettings.mockResolvedValue(mockSettings);

            const result = await getSettings();

            expect(result).toHaveLength(2);
        });
    });

    describe('updateSetting()', () => {
        it('should persist updated setting', async () => {
            db.setVoicemailSetting.mockResolvedValue();

            await updateSetting('vm-enabled', 'false', 'admin-1');

            expect(db.setVoicemailSetting).toHaveBeenCalledWith('vm-enabled', 'false', 'admin-1');
        });
    });

    describe('getStats()', () => {
        it('should return storage stats', async () => {
            db.getVoicemailStorageStats.mockResolvedValue({
                total_messages: 42,
                total_size_bytes: 104857600,
                active_recordings: 2
            });

            const stats = await getStats();

            expect(stats.totalMessages).toBe(42);
            expect(stats.totalSizeBytes).toBe(104857600);
            expect(stats.activeRecordings).toBe(2);
        });
    });
});
