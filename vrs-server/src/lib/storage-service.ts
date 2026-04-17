/**
 * Storage Service — MinIO (S3-compatible) wrapper for voicemail file storage
 *
 * Handles upload, download (via presigned URLs), and deletion of video
 * recordings and thumbnails in MinIO object storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// MinIO client — imported dynamically so the module loads even without MinIO
// in development (tests, local dev without Docker).
let MinioClient: any;

export interface StorageConfig {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    region?: string;
    useSSL?: boolean;
}

export interface UploadResult {
    key: string;
    etag?: string;
    size: number;
}

export interface PresignedUrlOptions {
    expiresIn?: number; // seconds, default 3600
    responseContentType?: string;
}

class StorageService {
    private config: StorageConfig;
    private client: any;
    private initialized: boolean = false;

    constructor(config: StorageConfig) {
        this.config = {
            ...config,
            useSSL: config.useSSL ?? false,
            region: config.region || 'us-east-1'
        };
    }

    async initialize(): Promise<void> {
        try {
            // Dynamic import so the module works without minio installed
            const minio = await import('minio');
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
        } catch (err) {
            console.error('[Storage] Initialization failed:', err);
            throw err;
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Upload a local file to MinIO.
     */
    async uploadFile(localPath: string, key: string, contentType?: string): Promise<UploadResult> {
        this.ensureInitialized();

        const stat = fs.statSync(localPath);
        const metaData: Record<string, string> = {
            'Content-Type': contentType || 'video/mp4'
        };

        const result = await this.client.fPutObject(
            this.config.bucket,
            key,
            localPath,
            metaData
        );

        return {
            key,
            etag: result.etag || result,
            size: stat.size
        };
    }

    /**
     * Upload a Buffer directly to MinIO.
     */
    async uploadBuffer(buffer: Buffer, key: string, contentType?: string): Promise<UploadResult> {
        this.ensureInitialized();

        const metaData: Record<string, string> = {
            'Content-Type': contentType || 'application/octet-stream'
        };

        const result = await this.client.putObject(
            this.config.bucket,
            key,
            buffer,
            buffer.length,
            metaData
        );

        return {
            key,
            etag: result.etag || result,
            size: buffer.length
        };
    }

    /**
     * Delete a file from MinIO.
     */
    async deleteFile(key: string): Promise<void> {
        this.ensureInitialized();
        await this.client.removeObject(this.config.bucket, key);
    }

    /**
     * Delete multiple files from MinIO.
     */
    async deleteFiles(keys: string[]): Promise<void> {
        this.ensureInitialized();
        if (keys.length === 0) return;
        await this.client.removeObjects(this.config.bucket, keys);
    }

    /**
     * Generate a presigned URL for temporary read access.
     */
    async getPresignedUrl(key: string, options?: PresignedUrlOptions): Promise<string> {
        this.ensureInitialized();

        const expiry = options?.expiresIn || 3600; // 1 hour default

        const reqParams: Record<string, string> = {};
        if (options?.responseContentType) {
            reqParams['response-content-type'] = options.responseContentType;
        }

        return await this.client.presignedGetObject(
            this.config.bucket,
            key,
            expiry,
            reqParams
        );
    }

    /**
     * Check if a file exists in MinIO.
     */
    async fileExists(key: string): Promise<boolean> {
        this.ensureInitialized();
        try {
            await this.client.statObject(this.config.bucket, key);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file metadata from MinIO.
     */
    async getFileStats(key: string): Promise<{ size: number; lastModified: Date; contentType?: string }> {
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
    buildRecordingKey(messageId: string): string {
        return `recordings/${messageId}.mp4`;
    }

    /**
     * Build a storage key for a voicemail thumbnail.
     */
    buildThumbnailKey(messageId: string): string {
        return `thumbnails/${messageId}.jpg`;
    }

    /**
     * Generate a unique storage key for temporary uploads.
     */
    generateTempKey(prefix: string, extension: string): string {
        return `temp/${prefix}/${uuidv4()}.${extension}`;
    }

    private ensureInitialized(): void {
        if (!this.initialized || !this.client) {
            throw new Error('StorageService not initialized. Call initialize() first.');
        }
    }
}

// Singleton instance — configured via configureStorageService()
let instance: StorageService | null = null;

export function configureStorageService(config: StorageConfig): StorageService {
    instance = new StorageService(config);
    return instance;
}

export function getStorageService(): StorageService | null {
    return instance;
}

export { StorageService };
