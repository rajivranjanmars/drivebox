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
  MAX_FILE_SIZE,
  MULTIPART_PART_SIZE,
  parseUploadMetadata,
  UploadValidationError,
} from "@/lib/files";
import { filterAndSortFiles, getFileCategory } from "@/lib/file-presentation";
import {
  deleteUserFile,
  completeUserUpload,
  downloadUserFile,
  fileServiceLayer,
  getUserUpload,
  listUserFiles,
  startUserUpload,
  uploadUserPart,
  uploadUserFile,
} from "@/server/file-service";
import { makeR2ObjectStorage } from "@/server/r2-object-storage";

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
    const headers = new Headers({
      "content-type": "text/plain",
      "x-file-name": encodeURIComponent("résumé.txt"),
      "x-file-size": "42",
    });

    expect(parseUploadMetadata(headers)).toEqual({
      filename: "résumé.txt",
      relativePath: "résumé.txt",
      mimeType: "text/plain",
      size: 42,
    });
  });

  it("rejects oversized and traversal-style names", (): void => {
    const oversized = new Headers({
      "x-file-name": "large.bin",
      "x-file-size": String(MAX_FILE_SIZE + 1),
    });
    expect(() => parseUploadMetadata(oversized)).toThrow(UploadValidationError);

    const pathName = new Headers({
      "x-file-name": encodeURIComponent("../../notes.txt"),
      "x-file-path": encodeURIComponent("./notes.txt"),
      "x-file-size": "10",
    });
    expect(parseUploadMetadata(pathName)).toMatchObject({ filename: "notes.txt", relativePath: "notes.txt" });

    const traversal = new Headers({
      "x-file-name": "notes.txt",
      "x-file-path": encodeURIComponent("../notes.txt"),
      "x-file-size": "10",
    });
    expect(() => parseUploadMetadata(traversal)).toThrow(UploadValidationError);
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

describe("D1 metadata and R2 object storage", (): void => {
  it("stores, lists, authorizes, streams, and deletes an owned file", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const id = crypto.randomUUID();
    const objectKey = buildObjectKey(ownerId, "hello.txt");

    await env.FILES.put(objectKey, "hello drivebox", {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { ownerId, filename: "hello.txt" },
    });
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

    const object = await env.FILES.get(objectKey);
    expect(await object?.text()).toBe("hello drivebox");

    await env.FILES.delete(objectKey);
    await deleteOwnedFile(database, ownerId, id);
    expect(await findOwnedFile(database, ownerId, id)).toBeNull();
    expect(await env.FILES.get(objectKey)).toBeNull();
  });

  it("runs upload, ownership, download, list, and delete through the Effect service", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const layer = fileServiceLayer(database, makeR2ObjectStorage(env.FILES));
    const run = <A, E>(program: Effect.Effect<A, E, import("@/server/file-service").FileService>) =>
      Effect.runPromise(program.pipe(Effect.provide(layer)));

    const body = new TextEncoder().encode("effect storage");
    const uploaded = await run(uploadUserFile({
      body: new Blob([body]).stream(),
      metadata: {
        filename: "effect.txt",
        relativePath: "effect.txt",
        mimeType: "text/plain",
        size: body.byteLength,
      },
      userId: ownerId,
    }));

    expect(await run(listUserFiles(ownerId))).toEqual([
      expect.objectContaining({ id: uploaded.id, filename: "effect.txt" }),
    ]);

    const unauthorized = await Effect.runPromise(
      downloadUserFile(otherUserId, uploaded.id).pipe(Effect.provide(layer), Effect.either),
    );
    expect(Either.isLeft(unauthorized) && unauthorized.left._tag).toBe("FileNotFoundError");

    const download = await run(downloadUserFile(ownerId, uploaded.id));
    expect(await new Response(download.object.body).text()).toBe("effect storage");

    await run(deleteUserFile(ownerId, uploaded.id));
    expect(await run(listUserFiles(ownerId))).toEqual([]);
  });

  it("resumes multipart chunks and mirrors a folder path under the user root", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const layer = fileServiceLayer(database, makeR2ObjectStorage(env.FILES));
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
});
