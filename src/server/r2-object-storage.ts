import type { ObjectStorage } from "@/server/object-storage";

/** Adapts Cloudflare's low-hop R2 binding to the provider-neutral storage port. */
export function makeR2ObjectStorage(bucket: R2Bucket): ObjectStorage {
  return {
    async createMultipart(key, metadata) {
      const upload = await bucket.createMultipartUpload(key, {
        httpMetadata: { contentType: metadata.contentType },
      });
      return { uploadId: upload.uploadId };
    },

    async uploadPart(key, uploadId, partNumber, body, size) {
      const fixedLengthBody = new FixedLengthStream(size);
      const pipePromise = body.pipeTo(fixedLengthBody.writable);
      const uploadPromise = bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, fixedLengthBody.readable);
      const [part] = await Promise.all([uploadPromise, pipePromise]);
      return part;
    },

    async completeMultipart(key, uploadId, parts) {
      const object = await bucket.resumeMultipartUpload(key, uploadId).complete([...parts]);
      return { etag: object.httpEtag, size: object.size };
    },

    async abortMultipart(key, uploadId) {
      await bucket.resumeMultipartUpload(key, uploadId).abort();
    },

    async put(key, body, size, metadata) {
      const fixedLengthBody = new FixedLengthStream(size);
      const pipePromise = body.pipeTo(fixedLengthBody.writable);
      const putPromise = bucket.put(key, fixedLengthBody.readable, {
        httpMetadata: { contentType: metadata.contentType },
      });
      const [object] = await Promise.all([putPromise, pipePromise]);
      return { etag: object.httpEtag, size: object.size };
    },

    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? null,
        etag: object.httpEtag,
        size: object.size,
      };
    },

    async delete(key) {
      await bucket.delete(key);
    },
  };
}
