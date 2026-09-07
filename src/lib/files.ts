import { and, asc, desc, eq, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Database } from "@/db";
import { files, folders, uploadParts, uploadSessions } from "@/db/schema";
import type { FileType, FolderType } from "@/typings";

export const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
export const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024;

export interface UploadMetadata {
  readonly filename: string;
  readonly mimeType: string;
  readonly relativePath: string;
  readonly size: number;
}

export interface MultipartUploadMetadata extends UploadMetadata {
  readonly fingerprint: string;
}

export interface NewFileRecord extends UploadMetadata {
  readonly id: string;
  readonly objectKey: string;
  readonly userId: string;
}

export interface NewUploadSession extends MultipartUploadMetadata {
  readonly id: string;
  readonly objectKey: string;
  readonly partSize: number;
  readonly providerUploadId: string;
  readonly userId: string;
}

export type StoredFile = typeof files.$inferSelect;
export type StoredFolder = typeof folders.$inferSelect;
export type StoredUploadSession = typeof uploadSessions.$inferSelect;
export type StoredUploadPart = typeof uploadParts.$inferSelect;

export interface NewFolderRecord {
  readonly id: string;
  readonly path: string;
  readonly userId: string;
}

/** Represents invalid or unsafe upload input. */
export class UploadValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function normalizeFilename(value: unknown): string {
  if (typeof value !== "string") throw new UploadValidationError("A file name is required");
  const filename = value.split(/[\\/]/).pop()?.trim().normalize("NFC") ?? "";
  if (!filename || filename === "." || filename === ".." || filename.length > 255 || hasControlCharacter(filename)) {
    throw new UploadValidationError("The file name is invalid");
  }
  return filename;
}

/** Normalizes a browser folder path without allowing it to escape the user's prefix. */
export function normalizeRelativePath(value: unknown, filename: string): string {
  const rawPath = typeof value === "string" && value.trim() ? value : filename;
  const normalized = rawPath
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^(\.\/)+/, "")
    .normalize("NFC");
  const segments = normalized.split("/");

  if (
    normalized.length > 1_024
    || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.length > 255 || hasControlCharacter(segment))
    || segments.at(-1) !== filename
  ) {
    throw new UploadValidationError("The folder path is invalid");
  }

  return segments.join("/");
}

/** Normalizes and validates a standalone folder path supplied by clients. */
export function normalizeFolderPath(value: unknown): string {
  if (typeof value !== "string") throw new UploadValidationError("The folder path is invalid");
  const normalized = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/")
    .normalize("NFC");
  if (!normalized) return "";
  const segments = normalized.split("/");

  if (
    normalized.length > 1_024
    || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.length > 255 || hasControlCharacter(segment))
  ) {
    throw new UploadValidationError("The folder path is invalid");
  }

  return segments.join("/");
}

/** Sanitizes an untrusted directory parameter without throwing, for URLs. */
export function sanitizeFolderPathParam(value: unknown): string {
  try {
    return normalizeFolderPath(value);
  } catch {
    return "";
  }
}

function parseSize(value: unknown, maximum: number): number {
  const size = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maximum) {
    throw new UploadValidationError(`Files must be between 1 byte and ${maximum} bytes`);
  }
  return size;
}

function parseMimeType(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "application/octet-stream";
  const mimeType = value.trim();
  if (mimeType.length > 255 || hasControlCharacter(mimeType)) {
    throw new UploadValidationError("The file type is invalid");
  }
  return mimeType;
}

/** Parses the JSON contract used to create or resume a multipart upload. */
export function parseMultipartUploadMetadata(value: unknown): MultipartUploadMetadata {
  if (!value || typeof value !== "object") throw new UploadValidationError("Upload details are required");
  const input = value as Record<string, unknown>;
  const filename = normalizeFilename(input.filename);
  const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint.trim() : "";
  if (!fingerprint || fingerprint.length > 512 || hasControlCharacter(fingerprint)) {
    throw new UploadValidationError("The upload fingerprint is invalid");
  }

  return {
    filename,
    relativePath: normalizeRelativePath(input.relativePath, filename),
    mimeType: parseMimeType(input.mimeType),
    size: parseSize(input.size, MAX_FILE_SIZE),
    fingerprint,
  };
}

/** Builds a provider-neutral key whose root is the stable Better Auth user ID. */
export function buildObjectKey(userId: string, relativePath: string): string {
  if (!userId || hasControlCharacter(userId) || userId.includes("/")) {
    throw new UploadValidationError("The account storage prefix is invalid");
  }
  return `${encodeURIComponent(userId)}/${relativePath}`;
}

/** Builds a safe attachment header while retaining a UTF-8 file name. */
export function buildContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Lists one user's file metadata newest-first. */
export async function listFilesForUser(database: Database, userId: string): Promise<FileType[]> {
  const records = await database
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt));

  return records.map((record) => ({
    id: record.id,
    filename: record.filename,
    relativePath: record.relativePath,
    timestamp: record.createdAt.toISOString(),
    downloadURL: `/api/files/${record.id}`,
    type: record.mimeType,
    size: record.size,
  }));
}

/** Finds a file only when it belongs to the supplied user. */
export async function findOwnedFile(database: Database, userId: string, fileId: string): Promise<StoredFile | null> {
  const [record] = await database
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);
  return record ?? null;
}

export async function findOwnedFileByPath(
  database: Database,
  userId: string,
  relativePath: string,
): Promise<StoredFile | null> {
  const [record] = await database
    .select()
    .from(files)
    .where(and(eq(files.userId, userId), eq(files.relativePath, relativePath)))
    .limit(1);
  return record ?? null;
}

/** Inserts file metadata after an object has been stored successfully. */
export async function insertFile(database: Database, record: NewFileRecord): Promise<void> {
  await database.insert(files).values(record);
}

/** Inserts or replaces the metadata at one mirrored user path. */
export async function upsertFile(database: Database, record: NewFileRecord): Promise<void> {
  await database.insert(files).values(record).onConflictDoUpdate({
    target: [files.userId, files.relativePath],
    set: {
      filename: record.filename,
      mimeType: record.mimeType,
      objectKey: record.objectKey,
      size: record.size,
      createdAt: new Date(),
    },
  });
}

/** Deletes metadata only for a file owned by the supplied user. */
export async function deleteOwnedFile(database: Database, userId: string, fileId: string): Promise<void> {
  await database.delete(files).where(and(eq(files.id, fileId), eq(files.userId, userId)));
}

export async function findOwnedUpload(
  database: Database,
  userId: string,
  uploadId: string,
): Promise<StoredUploadSession | null> {
  const [record] = await database
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, uploadId), eq(uploadSessions.userId, userId)))
    .limit(1);
  return record ?? null;
}

export async function findUploadByFingerprint(
  database: Database,
  userId: string,
  fingerprint: string,
): Promise<StoredUploadSession | null> {
  const [record] = await database
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.userId, userId), eq(uploadSessions.fingerprint, fingerprint)))
    .limit(1);
  return record ?? null;
}

export async function listOtherUploadsForPath(
  database: Database,
  userId: string,
  relativePath: string,
  uploadId: string,
): Promise<StoredUploadSession[]> {
  return database
    .select()
    .from(uploadSessions)
    .where(and(
      eq(uploadSessions.userId, userId),
      eq(uploadSessions.relativePath, relativePath),
      ne(uploadSessions.id, uploadId),
    ));
}

export async function insertUploadSession(database: Database, record: NewUploadSession): Promise<void> {
  await database.insert(uploadSessions).values(record);
}

export async function listUploadParts(database: Database, uploadId: string): Promise<StoredUploadPart[]> {
  return database
    .select()
    .from(uploadParts)
    .where(eq(uploadParts.uploadId, uploadId))
    .orderBy(asc(uploadParts.partNumber));
}

export async function upsertUploadPart(
  database: Database,
  record: Pick<StoredUploadPart, "etag" | "partNumber" | "size" | "uploadId">,
): Promise<void> {
  await database.insert(uploadParts).values(record).onConflictDoUpdate({
    target: [uploadParts.uploadId, uploadParts.partNumber],
    set: { etag: record.etag, size: record.size },
  });
  await database
    .update(uploadSessions)
    .set({ updatedAt: new Date() })
    .where(eq(uploadSessions.id, record.uploadId));
}

export async function markUploadCompleted(database: Database, uploadId: string, fileId: string): Promise<void> {
  await database
    .update(uploadSessions)
    .set({ status: "completed", fileId, updatedAt: new Date() })
    .where(eq(uploadSessions.id, uploadId));
}

export async function deleteUploadSession(database: Database, uploadId: string): Promise<void> {
  await database.delete(uploadSessions).where(eq(uploadSessions.id, uploadId));
}

export async function deleteUploadSessionsForFile(database: Database, userId: string, fileId: string): Promise<void> {
  await database
    .delete(uploadSessions)
    .where(and(eq(uploadSessions.userId, userId), eq(uploadSessions.fileId, fileId)));
}

/** Lists every explicit folder row for a user ordered by path. */
export async function listFoldersForUser(database: Database, userId: string): Promise<FolderType[]> {
  const records = await database
    .select({ id: folders.id, path: folders.path })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(asc(folders.path));
  return records;
}

export async function findOwnedFolder(
  database: Database,
  userId: string,
  path: string,
): Promise<StoredFolder | null> {
  const [record] = await database
    .select()
    .from(folders)
    .where(and(eq(folders.userId, userId), eq(folders.path, path)))
    .limit(1);
  return record ?? null;
}

/** Inserts folder metadata; existing rows at the same path are left untouched. */
export async function insertFolderIgnoreConflict(database: Database, record: NewFolderRecord): Promise<void> {
  await database.insert(folders).values(record).onConflictDoNothing({
    target: [folders.userId, folders.path],
  });
}

/** Escapes SQL LIKE wildcards so folder names match literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Builds an escaped LIKE condition matching every descendant of a path. */
function matchesSubtree(column: AnyColumn, path: string): SQL {
  return sql`${column} LIKE ${`${escapeLikePattern(path)}/%`} ESCAPE ${"\\"}`;
}

/** Lists every owned file stored inside a folder subtree (`path` excluded). */
export async function listOwnedFilesUnderPath(
  database: Database,
  userId: string,
  prefix: string,
): Promise<StoredFile[]> {
  return database
    .select()
    .from(files)
    .where(and(eq(files.userId, userId), matchesSubtree(files.relativePath, prefix)));
}

/** Lists every active or completed upload session under a folder subtree. */
export async function listUploadSessionsUnderPath(
  database: Database,
  userId: string,
  prefix: string,
): Promise<StoredUploadSession[]> {
  return database
    .select()
    .from(uploadSessions)
    .where(and(eq(uploadSessions.userId, userId), matchesSubtree(uploadSessions.relativePath, prefix)));
}

/** Removes explicit folder rows for a subtree, including the folder itself. */
export async function deleteFolderSubtree(database: Database, userId: string, path: string): Promise<void> {
  await database.delete(folders).where(and(
    eq(folders.userId, userId),
    or(eq(folders.path, path), matchesSubtree(folders.path, path)),
  ));
}
