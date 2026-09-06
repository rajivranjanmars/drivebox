import type { ObjectStorage } from "@/server/object-storage";

interface PendingUpload {
  readonly contentType: string;
  readonly key: string;
  readonly parts: Map<number, Uint8Array>;
}

interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** Small in-memory storage used to test file workflows without a provider binding. */
export function makeMemoryObjectStorage(): ObjectStorage {
  const objects = new Map<string, StoredObject>();
  const uploads = new Map<string, PendingUpload>();

  return {
    async createMultipart(key, metadata) {
      const uploadId = crypto.randomUUID();
      uploads.set(uploadId, { contentType: metadata.contentType, key, parts: new Map() });
      return { uploadId };
    },

    async uploadPart(key, uploadId, partNumber, body, size) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.key !== key) throw new Error("Multipart upload not found");
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      if (bytes.byteLength !== size) throw new Error("Multipart part size mismatch");
      upload.parts.set(partNumber, bytes);
      return { etag: `"part-${partNumber}"`, partNumber };
    },

    async completeMultipart(key, uploadId, parts) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.key !== key) throw new Error("Multipart upload not found");
      const chunks = [...parts]
        .sort((left, right) => left.partNumber - right.partNumber)
        .map(({ partNumber }) => upload.parts.get(partNumber));
      if (chunks.some((chunk) => !chunk)) throw new Error("Multipart part not found");
      const size = chunks.reduce((total, chunk) => total + (chunk?.byteLength ?? 0), 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        if (!chunk) continue;
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      objects.set(key, { bytes, contentType: upload.contentType });
      uploads.delete(uploadId);
      return { etag: `"object-${uploadId}"`, size };
    },

    async abortMultipart(key, uploadId) {
      const upload = uploads.get(uploadId);
      if (upload?.key === key) uploads.delete(uploadId);
    },

    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(object.bytes.slice());
            controller.close();
          },
        }),
        contentType: object.contentType,
        etag: null,
        size: object.bytes.byteLength,
      };
    },

    async delete(key) {
      objects.delete(key);
    },
  };
}
