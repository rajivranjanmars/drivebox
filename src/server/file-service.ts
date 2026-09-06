import { Context, Data, Effect, Layer } from "effect";
import type { Database } from "@/db";
import {
  buildObjectKey,
  deleteFolderSubtree,
  deleteOwnedFile,
  deleteUploadSession,
  deleteUploadSessionsForFile,
  findOwnedFile,
  findOwnedFileByPath,
  findOwnedFolder,
  findOwnedUpload,
  findUploadByFingerprint,
  insertFolderIgnoreConflict,
  insertUploadSession,
  listFilesForUser,
  listFoldersForUser,
  listOtherUploadsForPath,
  listOwnedFilesUnderPath,
  listUploadParts,
  listUploadSessionsUnderPath,
  markUploadCompleted,
  MULTIPART_PART_SIZE,
  type MultipartUploadMetadata,
  normalizeFolderPath,
  type StoredFile,
  type StoredFolder,
  type StoredUploadPart,
  type StoredUploadSession,
  UploadValidationError,
  upsertFile,
  upsertUploadPart,
} from "@/lib/files";
import type { ObjectStorage, StoredObjectBody } from "@/server/object-storage";
import type { FileType, FolderType } from "@/typings";

export type FileStoreOperation =
  | "abort"
  | "complete"
  | "delete"
  | "delete-folder"
  | "download"
  | "list"
  | "list-folders"
  | "new-folder"
  | "part"
  | "start"
  | "status";

export class FileStoreError extends Data.TaggedError("FileStoreError")<{
  readonly operation: FileStoreOperation;
  readonly cause: unknown;
}> {}

export class FolderConflictError extends Data.TaggedError("FolderConflictError")<{
  readonly reason: string;
}> {}

export class FileNotFoundError extends Error {
  public readonly _tag = "FileNotFoundError";
}

export interface FileDownload {
  readonly object: StoredObjectBody;
  readonly record: StoredFile;
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
  readonly createFolder: (
    userId: string,
    rawPath: string,
  ) => Effect.Effect<FolderType, FolderConflictError | UploadValidationError | FileStoreError>;
  readonly delete: (userId: string, fileId: string) => Effect.Effect<void, FileNotFoundError | FileStoreError>;
  readonly deleteFolder: (
    userId: string,
    rawPath: string,
  ) => Effect.Effect<{ readonly deletedFiles: number }, FileNotFoundError | UploadValidationError | FileStoreError>;
  readonly download: (userId: string, fileId: string) => Effect.Effect<FileDownload, FileNotFoundError | FileStoreError>;
  readonly getUpload: (userId: string, uploadId: string) => Effect.Effect<UploadState, FileNotFoundError | FileStoreError>;
  readonly list: (userId: string) => Effect.Effect<FileType[], FileStoreError>;
  readonly listFolders: (userId: string) => Effect.Effect<FolderType[], FileStoreError>;
  readonly startUpload: (
    userId: string,
    metadata: MultipartUploadMetadata,
  ) => Effect.Effect<UploadState, UploadValidationError | FileStoreError>;
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

function toFolderType(record: StoredFolder): FolderType {
  return { id: record.id, path: record.path };
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

    listFolders: (userId) => Effect.tryPromise({
      try: () => listFoldersForUser(database, userId),
      catch: (cause) => new FileStoreError({ operation: "list-folders", cause }),
    }),

    createFolder: (userId, rawPath) => Effect.gen(function* () {
      const path = normalizeFolderPath(rawPath);
      if (!path) return yield* Effect.fail(new UploadValidationError("The folder name is required"));

      const existingFolder = yield* Effect.tryPromise({
        try: () => findOwnedFolder(database, userId, path),
        catch: (cause) => new FileStoreError({ operation: "new-folder", cause }),
      });
      if (existingFolder) {
        return yield* Effect.fail(new FolderConflictError({ reason: "A folder with this name already exists" }));
      }

      // Files and folders share one namespace per user path.
      const clashingFile = yield* Effect.tryPromise({
        try: () => findOwnedFileByPath(database, userId, path),
        catch: (cause) => new FileStoreError({ operation: "new-folder", cause }),
      });
      if (clashingFile) {
        return yield* Effect.fail(new FolderConflictError({ reason: "A file with this name already exists" }));
      }

      const record: StoredFolder = {
        id: crypto.randomUUID(),
        userId,
        path,
        createdAt: new Date(),
      };
      yield* Effect.tryPromise({
        try: () => insertFolderIgnoreConflict(database, record),
        catch: (cause) => new FileStoreError({ operation: "new-folder", cause }),
      });
      return toFolderType(record);
    }),

    deleteFolder: (userId, rawPath) => Effect.gen(function* () {
      const path = normalizeFolderPath(rawPath);
      if (!path) return yield* Effect.fail(new FileNotFoundError());
      const prefix = `${path}/`;

      const [descendantFiles, descendantUploads] = yield* Effect.tryPromise({
        try: () => Promise.all([
          listOwnedFilesUnderPath(database, userId, prefix),
          listUploadSessionsUnderPath(database, userId, prefix),
        ]),
        catch: (cause) => new FileStoreError({ operation: "delete-folder", cause }),
      });

      for (const upload of descendantUploads) {
        if (upload.status === "active") {
          yield* Effect.tryPromise({
            try: () => abortQuietly(storage, upload.objectKey, upload.providerUploadId),
            catch: (cause) => new FileStoreError({ operation: "delete-folder", cause }),
          });
        }
      }
      for (const file of descendantFiles) {
        yield* Effect.tryPromise({
          try: () => deleteObjectQuietly(storage, file.objectKey),
          catch: (cause) => new FileStoreError({ operation: "delete-folder", cause }),
        });
      }

      yield* Effect.tryPromise({
        try: async () => {
          for (const file of descendantFiles) {
            await deleteOwnedFile(database, userId, file.id);
            await deleteUploadSessionsForFile(database, userId, file.id);
          }
          await deleteFolderSubtree(database, userId, path);
        },
        catch: (cause) => new FileStoreError({ operation: "delete-folder", cause }),
      });

      const removedFolder = yield* Effect.tryPromise({
        try: () => findOwnedFolder(database, userId, path),
        catch: (cause) => new FileStoreError({ operation: "delete-folder", cause }),
      });
      // A visible folder must be either an explicit row or backed by stored
      // files; otherwise it never existed for this user.
      if (!removedFolder && descendantFiles.length === 0) {
        return yield* Effect.fail(new FileNotFoundError());
      }
      return { deletedFiles: descendantFiles.length };
    }),
  };
}

export function fileServiceLayer(database: Database, storage: ObjectStorage): Layer.Layer<FileService> {
  return Layer.succeed(FileService, makeFileService(database, storage));
}

export const listUserFiles = (userId: string): Effect.Effect<FileType[], FileStoreError, FileService> =>
  Effect.flatMap(FileService, (service) => service.list(userId));

export const downloadUserFile = (userId: string, fileId: string) =>
  Effect.flatMap(FileService, (service) => service.download(userId, fileId));

export const deleteUserFile = (userId: string, fileId: string) =>
  Effect.flatMap(FileService, (service) => service.delete(userId, fileId));

export const listUserFolders = (userId: string) =>
  Effect.flatMap(FileService, (service) => service.listFolders(userId));

export const createUserFolder = (userId: string, rawPath: string) =>
  Effect.flatMap(FileService, (service) => service.createFolder(userId, rawPath));

export const deleteUserFolder = (userId: string, rawPath: string) =>
  Effect.flatMap(FileService, (service) => service.deleteFolder(userId, rawPath));

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
