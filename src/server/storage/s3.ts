import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";
import type {
  StorageHttpMetadata,
  StorageMultipartUpload,
  StorageObject,
  StoragePutValue,
  StorageUploadPart,
} from "./types";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

async function toNodeStream(value: StoragePutValue): Promise<Readable> {
  if (value instanceof ReadableStream) {
    return Readable.fromWeb(value as unknown as Parameters<typeof Readable.fromWeb>[0]);
  }
  if (value instanceof ArrayBuffer) return Readable.from([Buffer.from(value)]);
  if (typeof value === "string") return Readable.from([value]);
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return Readable.from([Buffer.from(await value.arrayBuffer())]);
  }
  return value as never;
}

async function streamToBuffer(value: StoragePutValue): Promise<Buffer> {
  const node = await toNodeStream(value);
  const chunks: Buffer[] = [];
  for await (const chunk of node) {
    chunks.push(Buffer.from(chunk as unknown as Uint8Array));
  }
  return Buffer.concat(chunks);
}

/**
 * S3-compatible object storage for standalone deployment (works with RustFS,
 * MinIO, AWS S3, and other S3-API providers).
 */
export class S3Storage {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async get(key: string): Promise<StorageObject | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      const body = Readable.toWeb(res.Body as Readable) as unknown as ReadableStream;
      return {
        key,
        size: res.ContentLength ?? 0,
        httpMetadata: { contentType: res.ContentType },
        body,
      };
    } catch (err) {
      const name = (err as { name?: string; Code?: string }).name;
      const code = (err as { Code?: string; code?: string }).Code ?? (err as { code?: string }).code;
      if (name === "NoSuchKey" || name === "NotFound" || code === "NoSuchKey" || code === "NotFound") {
        return null;
      }
      throw err;
    }
  }

  async put(
    key: string,
    value: StoragePutValue,
    options?: { httpMetadata?: StorageHttpMetadata },
  ): Promise<StorageObject> {
    const body = await toNodeStream(value);
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options?.httpMetadata?.contentType,
      },
    });
    await upload.done();
    return { key, size: 0, httpMetadata: options?.httpMetadata, body: new ReadableStream() };
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (let i = 0; i < list.length; i += 1000) {
      const chunk = list.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        }),
      );
    }
  }

  async createMultipartUpload(
    key: string,
    options?: { httpMetadata?: StorageHttpMetadata },
  ): Promise<StorageMultipartUpload> {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: options?.httpMetadata?.contentType,
      }),
    );
    return this.multipart(key, res.UploadId!);
  }

  resumeMultipartUpload(key: string, uploadId: string): StorageMultipartUpload {
    return this.multipart(key, uploadId);
  }

  private multipart(key: string, uploadId: string): StorageMultipartUpload {
    return {
      key,
      uploadId,
      uploadPart: async (
        partNumber: number,
        value: StoragePutValue,
      ): Promise<StorageUploadPart> => {
        const body = await streamToBuffer(value);
        const res = await this.client.send(
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: body,
          }),
        );
        return { partNumber, etag: (res.ETag ?? "").replace(/"/g, "") };
      },
      complete: async (parts): Promise<{ size: number }> => {
        await this.client.send(
          new CompleteMultipartUploadCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
              Parts: parts.map((p) => ({
                ETag: p.etag,
                PartNumber: p.partNumber,
              })),
            },
          }),
        );
        const head = await this.client.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        return { size: head.ContentLength ?? 0 };
      },
      abort: async () => {
        try {
          await this.client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucket,
              Key: key,
              UploadId: uploadId,
            }),
          );
        } catch (err) {
          if ((err as { name?: string }).name !== "NoSuchUpload") throw err;
        }
      },
    };
  }
}
