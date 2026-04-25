"use strict";
/**
 * Storage Service — MinIO (S3-compatible) wrapper for voicemail file storage
 *
 * Handles upload, download (via presigned URLs), and deletion of video
 * recordings and thumbnails in MinIO object storage.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
exports.configureStorageService = configureStorageService;
exports.getStorageService = getStorageService;
const fs = __importStar(require("fs"));
const uuid_1 = require("uuid");
// MinIO client — imported dynamically so the module loads even without MinIO
// in development (tests, local dev without Docker).
let MinioClient;
class StorageService {
    constructor(config) {
        this.initialized = false;
        this.config = {
            ...config,
            useSSL: config.useSSL ?? false,
            region: config.region || 'us-east-1'
        };
    }
    async initialize() {
        try {
            // Dynamic import so the module works without minio installed
            const minio = await Promise.resolve().then(() => __importStar(require('minio')));
            MinioClient = minio.Client || minio.default;
            const endpoint = this.config.endpoint;
            const [host, portStr] = endpoint.split(':');
            const port = parseInt(portStr || '9000', 10);
            this.client = new MinioClient({
                endPoint: host,
                port,
                useSSL: this.config.useSSL || false,
                accessKey: this.config.accessKey,
                secretKey: this.config.secretKey,
                region: this.config.region
            });
            // Ensure bucket exists
            const bucketExists = await this.client.bucketExists(this.config.bucket);
            if (!bucketExists) {
                await this.client.makeBucket(this.config.bucket, this.config.region || 'us-east-1');
                console.log(`[Storage] Created bucket: ${this.config.bucket}`);
            }
            this.initialized = true;
            console.log(`[Storage] Initialized — endpoint: ${endpoint}, bucket: ${this.config.bucket}`);
        }
        catch (err) {
            console.error('[Storage] Initialization failed:', err);
            throw err;
        }
    }
    isInitialized() {
        return this.initialized;
    }
    /**
     * Upload a local file to MinIO.
     */
    async uploadFile(localPath, key, contentType) {
        this.ensureInitialized();
        const stat = fs.statSync(localPath);
        const metaData = {
            'Content-Type': contentType || 'video/mp4'
        };
        const result = await this.client.fPutObject(this.config.bucket, key, localPath, metaData);
        return {
            key,
            etag: result.etag || result,
            size: stat.size
        };
    }
    /**
     * Upload a Buffer directly to MinIO.
     */
    async uploadBuffer(buffer, key, contentType) {
        this.ensureInitialized();
        const metaData = {
            'Content-Type': contentType || 'application/octet-stream'
        };
        const result = await this.client.putObject(this.config.bucket, key, buffer, buffer.length, metaData);
        return {
            key,
            etag: result.etag || result,
            size: buffer.length
        };
    }
    /**
     * Delete a file from MinIO.
     */
    async deleteFile(key) {
        this.ensureInitialized();
        await this.client.removeObject(this.config.bucket, key);
    }
    /**
     * Delete multiple files from MinIO.
     */
    async deleteFiles(keys) {
        this.ensureInitialized();
        if (keys.length === 0)
            return;
        await this.client.removeObjects(this.config.bucket, keys);
    }
    /**
     * Generate a presigned URL for temporary read access.
     */
    async getPresignedUrl(key, options) {
        this.ensureInitialized();
        const expiry = options?.expiresIn || 3600; // 1 hour default
        const reqParams = {};
        if (options?.responseContentType) {
            reqParams['response-content-type'] = options.responseContentType;
        }
        return await this.client.presignedGetObject(this.config.bucket, key, expiry, reqParams);
    }
    /**
     * Check if a file exists in MinIO.
     */
    async fileExists(key) {
        this.ensureInitialized();
        try {
            await this.client.statObject(this.config.bucket, key);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get file metadata from MinIO.
     */
    async getFileStats(key) {
        this.ensureInitialized();
        const stat = await this.client.statObject(this.config.bucket, key);
        return {
            size: stat.size,
            lastModified: stat.lastModified,
            contentType: stat.metaData?.['Content-Type']
        };
    }
    /**
     * Build a storage key for a voicemail recording.
     */
    buildRecordingKey(messageId) {
        return `recordings/${messageId}.mp4`;
    }
    /**
     * Build a storage key for a voicemail thumbnail.
     */
    buildThumbnailKey(messageId) {
        return `thumbnails/${messageId}.jpg`;
    }
    /**
     * Generate a unique storage key for temporary uploads.
     */
    generateTempKey(prefix, extension) {
        return `temp/${prefix}/${(0, uuid_1.v4)()}.${extension}`;
    }
    ensureInitialized() {
        if (!this.initialized || !this.client) {
            throw new Error('StorageService not initialized. Call initialize() first.');
        }
    }
}
exports.StorageService = StorageService;
// Singleton instance — configured via configureStorageService()
let instance = null;
function configureStorageService(config) {
    instance = new StorageService(config);
    return instance;
}
function getStorageService() {
    return instance;
}
//# sourceMappingURL=storage-service.js.map