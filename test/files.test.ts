import { env } from "cloudflare:test";
import { Effect, Either } from "effect";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "@/db";
import { user } from "@/db/schema";
import {
  buildContentDisposition,
  buildObjectKey,
  deleteOwnedFile,
  findOwnedFile,
  insertFile,
  listFilesForUser,
  MULTIPART_PART_SIZE,
  parseMultipartUploadMetadata,
  UploadValidationError,
} from "@/lib/files";
import { filterAndSortFiles, getFileCategory } from "@/lib/file-presentation";
import {
  deleteUserFile,
  deleteUserFolder,
  completeUserUpload,
  createUserFolder,
  downloadUserFile,
  fileServiceLayer,
  getUserUpload,
  listUserFiles,
  listUserFolders,
  startUserUpload,
  uploadUserPart,
} from "@/server/file-service";
import { makeMemoryObjectStorage } from "./memory-object-storage";

const ownerId = "test-owner";
const otherUserId = "test-other-user";

beforeAll(async (): Promise<void> => {
  const database = createDatabase(env.DB);
  await database.insert(user).values([
    {
      id: ownerId,
      name: "Owner",
      email: "owner@example.com",
    },
    {
      id: otherUserId,
      name: "Other user",
      email: "other@example.com",
    },
  ]);
});

describe("upload metadata validation", (): void => {
  it("accepts bounded UTF-8 file metadata", (): void => {
    expect(parseMultipartUploadMetadata({
      filename: "résumé.txt",
      relativePath: "résumé.txt",
      mimeType: "text/plain",
      size: 42,
      fingerprint: "resume-v1",
    })).toEqual({
      filename: "résumé.txt",
      relativePath: "résumé.txt",
      mimeType: "text/plain",
      size: 42,
      fingerprint: "resume-v1",
    });
  });

  it("rejects oversized and traversal-style names", (): void => {
    expect(() => parseMultipartUploadMetadata({
      filename: "notes.txt",
      relativePath: "../notes.txt",
      mimeType: "text/plain",
      size: 10,
      fingerprint: "traversal-v1",
    })).toThrow(UploadValidationError);
  });

  it("builds safe private object and download headers", (): void => {
    expect(buildObjectKey("user-1", "Projects/brief.pdf")).toBe("user-1/Projects/brief.pdf");
    expect(buildContentDisposition("résumé.txt")).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.txt");
  });
});

describe("file presentation", (): void => {
  it("classifies common files without a presentation dependency", (): void => {
    expect(getFileCategory("image/png", "asset.bin")).toBe("image");
    expect(getFileCategory("application/octet-stream", "archive.zip")).toBe("archive");
    expect(getFileCategory("application/octet-stream", "source.ts")).toBe("code");
    expect(getFileCategory("application/pdf", "brief.pdf")).toBe("document");
  });

  it("filters by name and sorts file metadata without mutating its input", (): void => {
    const files = [
      { id: "old", filename: "Project brief.pdf", relativePath: "Work/Project brief.pdf", timestamp: "2026-01-01T00:00:00.000Z", downloadURL: "/old", type: "application/pdf", size: 10 },
      { id: "new", filename: "Project artwork.png", relativePath: "Assets/Project artwork.png", timestamp: "2026-02-01T00:00:00.000Z", downloadURL: "/new", type: "image/png", size: 20 },
      { id: "other", filename: "Notes.txt", relativePath: "Personal/Notes.txt", timestamp: "2026-03-01T00:00:00.000Z", downloadURL: "/other", type: "text/plain", size: 30 },
    ];

    expect(filterAndSortFiles(files, "project", "desc").map(({ id }) => id)).toEqual(["new", "old"]);
    expect(files.map(({ id }) => id)).toEqual(["old", "new", "other"]);
  });
});

describe("D1 metadata and object-storage workflows", (): void => {
  it("stores, lists, authorizes, and deletes file metadata", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const id = crypto.randomUUID();
    const objectKey = buildObjectKey(ownerId, "hello.txt");

    await insertFile(database, {
      id,
      userId: ownerId,
      objectKey,
      filename: "hello.txt",
      relativePath: "hello.txt",
      mimeType: "text/plain",
      size: 14,
    });

    const listed = await listFilesForUser(database, ownerId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id, filename: "hello.txt", downloadURL: `/api/files/${id}` });
    expect(await findOwnedFile(database, otherUserId, id)).toBeNull();

    await deleteOwnedFile(database, ownerId, id);
    expect(await findOwnedFile(database, ownerId, id)).toBeNull();
  });

  it("enforces ownership for download, list, and delete through the Effect service", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const layer = fileServiceLayer(database, makeMemoryObjectStorage());
    const run = <A, E>(program: Effect.Effect<A, E, import("@/server/file-service").FileService>) =>
      Effect.runPromise(program.pipe(Effect.provide(layer)));

    const body = new TextEncoder().encode("effect storage");
    const uploaded = await run(startUserUpload(ownerId, {
      filename: "effect.txt",
      relativePath: "effect.txt",
      mimeType: "text/plain",
      size: body.byteLength,
      fingerprint: "effect-v1",
    }));
    await run(uploadUserPart({
      userId: ownerId,
      uploadId: uploaded.uploadId,
      partNumber: 1,
      size: body.byteLength,
      body: new Blob([body]).stream(),
    }));
    const completed = await run(completeUserUpload(ownerId, uploaded.uploadId));

    expect(await run(listUserFiles(ownerId))).toEqual([
      expect.objectContaining({ id: completed.fileId, filename: "effect.txt" }),
    ]);

    const unauthorized = await Effect.runPromise(
      downloadUserFile(otherUserId, completed.fileId).pipe(Effect.provide(layer), Effect.either),
    );
    expect(Either.isLeft(unauthorized) && unauthorized.left._tag).toBe("FileNotFoundError");

    const download = await run(downloadUserFile(ownerId, completed.fileId));
    expect(await new Response(download.object.body).text()).toBe("effect storage");

    await run(deleteUserFile(ownerId, completed.fileId));
    expect(await run(listUserFiles(ownerId))).toEqual([]);
  });

  it("resumes multipart chunks and mirrors a folder path under the user root", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const layer = fileServiceLayer(database, makeMemoryObjectStorage());
    const run = <A, E>(program: Effect.Effect<A, E, import("@/server/file-service").FileService>) =>
      Effect.runPromise(program.pipe(Effect.provide(layer)));

    const tail = new TextEncoder().encode("multipart tail");
    const totalSize = MULTIPART_PART_SIZE + tail.byteLength;
    const started = await run(startUserUpload(ownerId, {
      filename: "guide.txt",
      relativePath: "Documents/Guides/guide.txt",
      mimeType: "text/plain",
      size: totalSize,
      fingerprint: "multipart-guide-v1",
    }));

    await run(uploadUserPart({
      userId: ownerId,
      uploadId: started.uploadId,
      partNumber: 1,
      size: MULTIPART_PART_SIZE,
      body: new Blob([new Uint8Array(MULTIPART_PART_SIZE)]).stream(),
    }));
    expect(await run(getUserUpload(ownerId, started.uploadId))).toMatchObject({
      uploadedParts: [1],
      completed: false,
    });

    await run(uploadUserPart({
      userId: ownerId,
      uploadId: started.uploadId,
      partNumber: 2,
      size: tail.byteLength,
      body: new Blob([tail]).stream(),
    }));
    const completed = await run(completeUserUpload(ownerId, started.uploadId));
    const stored = await findOwnedFile(database, ownerId, completed.fileId);
    expect(stored).toMatchObject({
      objectKey: `${ownerId}/Documents/Guides/guide.txt`,
      relativePath: "Documents/Guides/guide.txt",
      size: totalSize,
    });
    expect((await run(getUserUpload(ownerId, started.uploadId))).completed).toBe(true);

    const replacementBody = new TextEncoder().encode("replacement guide");
    const replacement = await run(startUserUpload(ownerId, {
      filename: "guide.txt",
      relativePath: "Documents/Guides/guide.txt",
      mimeType: "text/plain",
      size: replacementBody.byteLength,
      fingerprint: "multipart-guide-v2",
    }));
    await run(uploadUserPart({
      userId: ownerId,
      uploadId: replacement.uploadId,
      partNumber: 1,
      size: replacementBody.byteLength,
      body: new Blob([replacementBody]).stream(),
    }));
    const replaced = await run(completeUserUpload(ownerId, replacement.uploadId));
    expect(replaced.fileId).toBe(completed.fileId);

    const supersededState = await Effect.runPromise(
      getUserUpload(ownerId, started.uploadId).pipe(Effect.provide(layer), Effect.either),
    );
    expect(Either.isLeft(supersededState) && supersededState.left._tag).toBe("FileNotFoundError");
    const replacementDownload = await run(downloadUserFile(ownerId, replaced.fileId));
    expect(await new Response(replacementDownload.object.body).text()).toBe("replacement guide");

    await run(deleteUserFile(ownerId, replaced.fileId));
  });

  it("deletes an explicit folder and its descendant files without a doubled path prefix", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const layer = fileServiceLayer(database, makeMemoryObjectStorage());
    const run = <A, E>(program: Effect.Effect<A, E, import("@/server/file-service").FileService>) =>
      Effect.runPromise(program.pipe(Effect.provide(layer)));
    await run(createUserFolder(ownerId, "Projects"));
    const body = new TextEncoder().encode("folder child");
    const upload = await run(startUserUpload(ownerId, {
      filename: "child.txt",
      relativePath: "Projects/child.txt",
      mimeType: "text/plain",
      size: body.byteLength,
      fingerprint: "folder-delete-child-v1",
    }));
    await run(uploadUserPart({
      userId: ownerId,
      uploadId: upload.uploadId,
      partNumber: 1,
      size: body.byteLength,
      body: new Blob([body]).stream(),
    }));
    await run(completeUserUpload(ownerId, upload.uploadId));

    await expect(run(deleteUserFolder(ownerId, "Projects"))).resolves.toEqual({ deletedFiles: 1 });
    expect(await run(listUserFiles(ownerId))).toEqual([]);
    expect(await run(listUserFolders(ownerId))).toEqual([]);
  });
});
