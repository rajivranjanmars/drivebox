import { Context, Data, Effect, Layer } from "effect";
import type { Database } from "@/db";
import {
  buildObjectKey,
  deleteOwnedFile,
  deleteUploadSession,
  deleteUploadSessionsForFile,
  findOwnedFile,
  findOwnedFileByPath,
  findOwnedUpload,
  findUploadByFingerprint,
  insertUploadSession,
  listFilesForUser,
  listOtherUploadsForPath,
  listUploadParts,
  markUploadCompleted,
  MULTIPART_PART_SIZE,
  type MultipartUploadMetadata,
  type StoredFile,
  type StoredUploadPart,
  type StoredUploadSession,
  type UploadMetadata,
  UploadValidationError,
  upsertFile,
  upsertUploadPart,
} from "@/lib/files";
import type { ObjectStorage, StoredObjectBody } from "@/server/object-storage";
import type { FileType } from "@/typings";

export type FileStoreOperation =
  | "abort"
  | "complete"
  | "delete"
  | "download"
  | "list"
  | "part"
  | "start"
  | "status"
  | "upload";

export class FileStoreError extends Data.TaggedError("FileStoreError")<{
  readonly operation: FileStoreOperation;
  readonly cause: unknown;
}> {}

export class FileNotFoundError extends Error {
  public readonly _tag = "FileNotFoundError";
}

export interface FileDownload {
  readonly object: StoredObjectBody;
  readonly record: StoredFile;
}

export interface UploadRequest {
  readonly body: ReadableStream<Uint8Array>;
  readonly metadata: UploadMetadata;
  readonly userId: string;
}

export interface UploadPartRequest {
  readonly body: ReadableStream<Uint8Array>;
  readonly partNumber: number;
  readonly size: number;
  readonly uploadId: string;
  readonly userId: string;
}

export interface UploadState {
  readonly completed: boolean;
  readonly fileId: string | null;
  readonly partSize: number;
  readonly uploadId: string;
  readonly uploadedParts: readonly number[];
}

export interface FileServiceShape {
  readonly abortUpload: (userId: string, uploadId: string) => Effect.Effect<void, FileNotFoundError | FileStoreError>;
  readonly completeUpload: (
    userId: string,
    uploadId: string,
  ) => Effect.Effect<{ readonly fileId: string }, FileNotFoundError | UploadValidationError | FileStoreError>;
  readonly delete: (userId: string, fileId: string) => Effect.Effect<void, FileNotFoundError | FileStoreError>;
  readonly download: (userId: string, fileId: string) => Effect.Effect<FileDownload, FileNotFoundError | FileStoreError>;
  readonly getUpload: (userId: string, uploadId: string) => Effect.Effect<UploadState, FileNotFoundError | FileStoreError>;
  readonly list: (userId: string) => Effect.Effect<FileType[], FileStoreError>;
  readonly startUpload: (
    userId: string,
    metadata: MultipartUploadMetadata,
  ) => Effect.Effect<UploadState, UploadValidationError | FileStoreError>;
  readonly upload: (request: UploadRequest) => Effect.Effect<{ readonly id: string }, UploadValidationError | FileStoreError>;
  readonly uploadPart: (
    request: UploadPartRequest,
  ) => Effect.Effect<{ readonly etag: string; readonly partNumber: number }, FileNotFoundError | UploadValidationError | FileStoreError>;
}

export class FileService extends Context.Tag("DriveBox/FileService")<FileService, FileServiceShape>() {}

const ACTIVE_UPLOAD_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1_000;

function toUploadState(session: StoredUploadSession, parts: readonly StoredUploadPart[]): UploadState {
  return {
    completed: session.status === "completed",
    fileId: session.fileId,
    partSize: session.partSize,
    uploadId: session.id,
    uploadedParts: parts.map(({ partNumber }) => partNumber),
  };
}

function expectedPartSize(session: StoredUploadSession, partNumber: number): number {
  const partCount = Math.ceil(session.size / session.partSize);
  if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
    throw new UploadValidationError("The upload part number is invalid");
  }
  return partNumber === partCount
    ? session.size - session.partSize * (partCount - 1)
    : session.partSize;
}

async function abortQuietly(storage: ObjectStorage, key: string, uploadId: string): Promise<void> {
  try {
    await storage.abortMultipart(key, uploadId);
  } catch (error) {
    console.error(JSON.stringify({
      message: "multipart upload cleanup failed",
      objectKey: key,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function deleteObjectQuietly(storage: ObjectStorage, objectKey: string): Promise<void> {
  try {
    await storage.delete(objectKey);
  } catch (error) {
    console.error(JSON.stringify({
      message: "object upload cleanup failed",
      objectKey,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/** Creates the file workflow implementation from database and object-storage ports. */
export function makeFileService(database: Database, storage: ObjectStorage): FileServiceShape {
  return {
    list: (userId) => Effect.tryPromise({
      try: () => listFilesForUser(database, userId),
      catch: (cause) => new FileStoreError({ operation: "list", cause }),
    }),

    download: (userId, fileId) => Effect.gen(function* () {
      const record = yield* Effect.tryPromise({
        try: () => findOwnedFile(database, userId, fileId),
        catch: (cause) => new FileStoreError({ operation: "download", cause }),
      });
      if (!record) return yield* Effect.fail(new FileNotFoundError());

      const object = yield* Effect.tryPromise({
        try: () => storage.get(record.objectKey),
        catch: (cause) => new FileStoreError({ operation: "download", cause }),
      });
      if (!object) return yield* Effect.fail(new FileNotFoundError());
      return { object, record };
    }),

    upload: (request) => Effect.gen(function* () {
      const existing = yield* Effect.tryPromise({
        try: () => findOwnedFileByPath(database, request.userId, request.metadata.relativePath),
        catch: (cause) => new FileStoreError({ operation: "upload", cause }),
      });
      const id = existing?.id ?? crypto.randomUUID();
      const objectKey = buildObjectKey(request.userId, request.metadata.relativePath);

      const stored = yield* Effect.tryPromise({
        try: () => storage.put(objectKey, request.body, request.metadata.size, {
          contentType: request.metadata.mimeType,
        }),
        catch: (cause) => new FileStoreError({ operation: "upload", cause }),
      });
      if (stored.size !== null && stored.size !== request.metadata.size) {
        yield* Effect.promise(() => deleteObjectQuietly(storage, objectKey));
        return yield* Effect.fail(new UploadValidationError("The uploaded byte count did not match the declared size"));
      }

      yield* Effect.tryPromise({
        try: () => upsertFile(database, { id, userId: request.userId, objectKey, ...request.metadata }),
        catch: (cause) => new FileStoreError({ operation: "upload", cause }),
      }).pipe(Effect.tapError(() => Effect.promise(() => deleteObjectQuietly(storage, objectKey))));
      return { id };
    }),

    startUpload: (userId, metadata) => Effect.tryPromise({
      try: async () => {
        const existing = await findUploadByFingerprint(database, userId, metadata.fingerprint);
        if (existing) {
          const metadataMatches = existing.relativePath === metadata.relativePath
            && existing.size === metadata.size
            && existing.mimeType === metadata.mimeType;
          if (!metadataMatches) throw new UploadValidationError("The resumable upload details do not match");
          const isStale = existing.status === "active"
            && Date.now() - existing.updatedAt.getTime() > ACTIVE_UPLOAD_MAX_AGE_MS;
          if (!isStale) return toUploadState(existing, await listUploadParts(database, existing.id));

          await abortQuietly(storage, existing.objectKey, existing.providerUploadId);
          await deleteUploadSession(database, existing.id);
        }

        const id = crypto.randomUUID();
        const objectKey = buildObjectKey(userId, metadata.relativePath);
        const providerUpload = await storage.createMultipart(objectKey, { contentType: metadata.mimeType });
        try {
          await insertUploadSession(database, {
            id,
            userId,
            objectKey,
            providerUploadId: providerUpload.uploadId,
            partSize: MULTIPART_PART_SIZE,
            ...metadata,
          });
        } catch (error) {
          await abortQuietly(storage, objectKey, providerUpload.uploadId);
          throw error;
        }

        return {
          completed: false,
          fileId: null,
          partSize: MULTIPART_PART_SIZE,
          uploadId: id,
          uploadedParts: [],
        };
      },
      catch: (cause) => cause instanceof UploadValidationError
        ? cause
        : new FileStoreError({ operation: "start", cause }),
    }),

    getUpload: (userId, uploadId) => Effect.gen(function* () {
      const session = yield* Effect.tryPromise({
        try: () => findOwnedUpload(database, userId, uploadId),
        catch: (cause) => new FileStoreError({ operation: "status", cause }),
      });
      if (!session) return yield* Effect.fail(new FileNotFoundError());
      const parts = yield* Effect.tryPromise({
        try: () => listUploadParts(database, uploadId),
        catch: (cause) => new FileStoreError({ operation: "status", cause }),
      });
      return toUploadState(session, parts);
    }),

    uploadPart: (request) => Effect.tryPromise({
      try: async () => {
        const session = await findOwnedUpload(database, request.userId, request.uploadId);
        if (!session) throw new FileNotFoundError();
        if (session.status !== "active") throw new UploadValidationError("This upload is no longer active");

        const expectedSize = expectedPartSize(session, request.partNumber);
        if (request.size !== expectedSize) {
          throw new UploadValidationError(`Upload part ${request.partNumber} must contain ${expectedSize} bytes`);
        }

        const part = await storage.uploadPart(
          session.objectKey,
          session.providerUploadId,
          request.partNumber,
          request.body,
          request.size,
        );
        await upsertUploadPart(database, {
          uploadId: session.id,
          partNumber: part.partNumber,
          etag: part.etag,
          size: request.size,
        });
        return part;
      },
      catch: (cause) => cause instanceof FileNotFoundError || cause instanceof UploadValidationError
        ? cause
        : new FileStoreError({ operation: "part", cause }),
    }),

    completeUpload: (userId, uploadId) => Effect.tryPromise({
      try: async () => {
        const session = await findOwnedUpload(database, userId, uploadId);
        if (!session) throw new FileNotFoundError();
        if (session.status === "completed" && session.fileId) return { fileId: session.fileId };
        if (session.status !== "active") throw new UploadValidationError("This upload cannot be completed");

        const parts = await listUploadParts(database, uploadId);
        const expectedCount = Math.ceil(session.size / session.partSize);
        if (parts.length !== expectedCount) throw new UploadValidationError("Some upload parts are still missing");
        for (let index = 0; index < expectedCount; index += 1) {
          const part = parts[index];
          if (!part || part.partNumber !== index + 1 || part.size !== expectedPartSize(session, index + 1)) {
            throw new UploadValidationError("The uploaded parts are incomplete or inconsistent");
          }
        }

        try {
          const completedObject = await storage.completeMultipart(session.objectKey, session.providerUploadId, parts);
          if (completedObject.size !== null && completedObject.size !== session.size) {
            await deleteObjectQuietly(storage, session.objectKey);
            throw new UploadValidationError("The completed object size did not match the upload");
          }
        } catch (completionError) {
          // A response can be lost after the provider commits. Recover only from an exact-size object.
          const committedObject = await storage.get(session.objectKey).catch(() => null);
          if (!committedObject || committedObject.size !== session.size) throw completionError;
          void committedObject.body.cancel().catch(() => undefined);
        }

        const existingFile = await findOwnedFileByPath(database, userId, session.relativePath);
        const fileId = existingFile?.id ?? crypto.randomUUID();
        await upsertFile(database, {
          id: fileId,
          userId,
          objectKey: session.objectKey,
          filename: session.filename,
          relativePath: session.relativePath,
          mimeType: session.mimeType,
          size: session.size,
        });
        await markUploadCompleted(database, uploadId, fileId);

        // A newer completion at the same mirrored path supersedes old resume fingerprints.
        const supersededUploads = await listOtherUploadsForPath(database, userId, session.relativePath, uploadId);
        for (const superseded of supersededUploads) {
          if (superseded.status === "active") {
            await abortQuietly(storage, superseded.objectKey, superseded.providerUploadId);
          }
          await deleteUploadSession(database, superseded.id);
        }
        return { fileId };
      },
      catch: (cause) => cause instanceof FileNotFoundError || cause instanceof UploadValidationError
        ? cause
        : new FileStoreError({ operation: "complete", cause }),
    }),

    abortUpload: (userId, uploadId) => Effect.tryPromise({
      try: async () => {
        const session = await findOwnedUpload(database, userId, uploadId);
        if (!session) throw new FileNotFoundError();
        if (session.status === "completed") return;
        try {
          await storage.abortMultipart(session.objectKey, session.providerUploadId);
        } finally {
          await deleteUploadSession(database, session.id);
        }
      },
      catch: (cause) => cause instanceof FileNotFoundError
        ? cause
        : new FileStoreError({ operation: "abort", cause }),
    }),

    delete: (userId, fileId) => Effect.gen(function* () {
      const record = yield* Effect.tryPromise({
        try: () => findOwnedFile(database, userId, fileId),
        catch: (cause) => new FileStoreError({ operation: "delete", cause }),
      });
      if (!record) return yield* Effect.fail(new FileNotFoundError());

      yield* Effect.tryPromise({
        try: async () => {
          await storage.delete(record.objectKey);
          await deleteOwnedFile(database, userId, fileId);
          await deleteUploadSessionsForFile(database, userId, fileId);
        },
        catch: (cause) => new FileStoreError({ operation: "delete", cause }),
      });
    }),
  };
}

export function fileServiceLayer(database: Database, storage: ObjectStorage): Layer.Layer<FileService> {
  return Layer.succeed(FileService, makeFileService(database, storage));
}

export const listUserFiles = (userId: string): Effect.Effect<FileType[], FileStoreError, FileService> =>
  Effect.flatMap(FileService, (service) => service.list(userId));

export const uploadUserFile = (request: UploadRequest) =>
  Effect.flatMap(FileService, (service) => service.upload(request));

export const downloadUserFile = (userId: string, fileId: string) =>
  Effect.flatMap(FileService, (service) => service.download(userId, fileId));

export const deleteUserFile = (userId: string, fileId: string) =>
  Effect.flatMap(FileService, (service) => service.delete(userId, fileId));

export const startUserUpload = (userId: string, metadata: MultipartUploadMetadata) =>
  Effect.flatMap(FileService, (service) => service.startUpload(userId, metadata));

export const getUserUpload = (userId: string, uploadId: string) =>
  Effect.flatMap(FileService, (service) => service.getUpload(userId, uploadId));

export const uploadUserPart = (request: UploadPartRequest) =>
  Effect.flatMap(FileService, (service) => service.uploadPart(request));

export const completeUserUpload = (userId: string, uploadId: string) =>
  Effect.flatMap(FileService, (service) => service.completeUpload(userId, uploadId));

export const abortUserUpload = (userId: string, uploadId: string) =>
  Effect.flatMap(FileService, (service) => service.abortUpload(userId, uploadId));
