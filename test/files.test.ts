import { env } from "cloudflare:test";
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
  parseUploadMetadata,
  UploadValidationError,
} from "@/lib/files";
import { filterAndSortFiles, getFileCategory } from "@/lib/file-presentation";

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
      "x-file-size": "10",
    });
    expect(parseUploadMetadata(pathName).filename).toBe("notes.txt");
  });

  it("builds safe private object and download headers", (): void => {
    expect(buildObjectKey("user-1", "file-1")).toBe("users/user-1/files/file-1");
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
      { id: "old", filename: "Project brief.pdf", timestamp: "2026-01-01T00:00:00.000Z", downloadURL: "/old", type: "application/pdf", size: 10 },
      { id: "new", filename: "Project artwork.png", timestamp: "2026-02-01T00:00:00.000Z", downloadURL: "/new", type: "image/png", size: 20 },
      { id: "other", filename: "Notes.txt", timestamp: "2026-03-01T00:00:00.000Z", downloadURL: "/other", type: "text/plain", size: 30 },
    ];

    expect(filterAndSortFiles(files, "project", "desc").map(({ id }) => id)).toEqual(["new", "old"]);
    expect(files.map(({ id }) => id)).toEqual(["old", "new", "other"]);
  });
});

describe("D1 metadata and R2 object storage", (): void => {
  it("stores, lists, authorizes, streams, and deletes an owned file", async (): Promise<void> => {
    const database = createDatabase(env.DB);
    const id = crypto.randomUUID();
    const objectKey = buildObjectKey(ownerId, id);

    await env.FILES.put(objectKey, "hello drivebox", {
      httpMetadata: { contentType: "text/plain" },
      customMetadata: { ownerId, filename: "hello.txt" },
    });
    await insertFile(database, {
      id,
      userId: ownerId,
      objectKey,
      filename: "hello.txt",
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
});
