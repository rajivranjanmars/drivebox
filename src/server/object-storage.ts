/** Provider-neutral metadata supplied when an object upload begins. */
export interface ObjectMetadata {
  readonly contentType: string;
}

/** One uploaded multipart chunk. */
export interface UploadedPart {
  readonly etag: string;
  readonly partNumber: number;
}

/** A private object returned by a storage provider. */
export interface StoredObjectBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string | null;
  readonly etag: string | null;
  readonly size: number | null;
}

/** Minimal object-storage port implemented by R2 and generic S3 adapters. */
export interface ObjectStorage {
  readonly abortMultipart: (key: string, uploadId: string) => Promise<void>;
  readonly completeMultipart: (
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[],
  ) => Promise<{ readonly etag: string | null; readonly size: number | null }>;
  readonly createMultipart: (key: string, metadata: ObjectMetadata) => Promise<{ readonly uploadId: string }>;
  readonly delete: (key: string) => Promise<void>;
  readonly get: (key: string) => Promise<StoredObjectBody | null>;
  readonly put: (
    key: string,
    body: ReadableStream<Uint8Array>,
    size: number,
    metadata: ObjectMetadata,
  ) => Promise<{ readonly etag: string | null; readonly size: number | null }>;
  readonly uploadPart: (
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array>,
    size: number,
  ) => Promise<UploadedPart>;
}
