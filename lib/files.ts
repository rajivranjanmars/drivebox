import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { files } from "@/db/schema";
import type { FileType } from "@/typings";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export interface UploadMetadata {
  filename: string;
  mimeType: string;
  size: number;
}

export interface NewFileRecord extends UploadMetadata {
  id: string;
  userId: string;
  objectKey: string;
}

export type StoredFile = typeof files.$inferSelect;

/** Represents invalid or unsafe file-upload metadata. */
export class UploadValidationError extends Error {
  /** Creates an upload validation error with a client-safe message. */
  public constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

/** Parses and validates bounded metadata for a streaming upload request. */
export function parseUploadMetadata(headers: Headers): UploadMetadata {
  const encodedFilename = headers.get("x-file-name");
  const declaredSize = headers.get("x-file-size");

  if (!encodedFilename || !declaredSize) {
    throw new UploadValidationError("File name and size are required");
  }

  let decodedFilename: string;
  try {
    decodedFilename = decodeURIComponent(encodedFilename);
  } catch {
    throw new UploadValidationError("The file name is not valid UTF-8");
  }

  const filename = decodedFilename.split(/[\\/]/).pop()?.trim() ?? "";
  const size = Number(declaredSize);

  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new UploadValidationError("The file name is invalid");
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) {
    throw new UploadValidationError(`Files must be between 1 byte and ${MAX_FILE_SIZE} bytes`);
  }

  return {
    filename,
    mimeType: headers.get("content-type") || "application/octet-stream",
    size,
  };
}

/** Builds a private, user-scoped R2 object key. */
export function buildObjectKey(userId: string, fileId: string): string {
  return `users/${userId}/files/${fileId}`;
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
    timestamp: record.createdAt.toISOString(),
    downloadURL: `/api/files/${record.id}`,
    type: record.mimeType,
    size: record.size,
  }));
}

/** Finds a file only when it belongs to the supplied user. */
export async function findOwnedFile(
  database: Database,
  userId: string,
  fileId: string,
): Promise<StoredFile | null> {
  const [record] = await database
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);

  return record ?? null;
}

/** Inserts metadata after an R2 object has been stored successfully. */
export async function insertFile(database: Database, record: NewFileRecord): Promise<void> {
  await database.insert(files).values(record);
}

/** Deletes metadata only for a file owned by the supplied user. */
export async function deleteOwnedFile(
  database: Database,
  userId: string,
  fileId: string,
): Promise<void> {
  await database
    .delete(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)));
}
