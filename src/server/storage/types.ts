/**
 * Storage abstraction shared by both deployment targets. The Cloudflare
 * Workers binding (R2Bucket) satisfies this interface structurally; the
 * standalone Node server uses an S3-compatible implementation (RustFS, MinIO,
 * AWS S3, ...) via @aws-sdk/client-s3.
 */
export type StorageHttpMetadata = { contentType?: string };

export type StorageObject = {
  key: string;
  size: number;
  httpMetadata?: StorageHttpMetadata;
  body: ReadableStream;
};

export type StoragePutValue = ReadableStream | ArrayBuffer | string | Blob;

export type StorageUploadPart = { partNumber: number; etag: string };

export interface StorageMultipartUpload {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: StoragePutValue): Promise<StorageUploadPart>;
  complete(parts: StorageUploadPart[]): Promise<{ size: number }>;
  abort(): Promise<void>;
}

export interface Storage {
  get(key: string): Promise<StorageObject | null>;
  put(
    key: string,
    value: StoragePutValue,
    options?: { httpMetadata?: StorageHttpMetadata },
  ): Promise<StorageObject>;
  delete(keys: string | string[]): Promise<void>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: StorageHttpMetadata },
  ): Promise<StorageMultipartUpload>;
  resumeMultipartUpload(key: string, uploadId: string): StorageMultipartUpload;
}
