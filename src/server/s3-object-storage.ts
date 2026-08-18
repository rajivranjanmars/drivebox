import { AwsClient } from "aws4fetch";
import type { ObjectStorage } from "@/server/object-storage";

export interface S3StorageConfig {
  readonly accessKeyId: string;
  readonly addressingStyle: "path" | "virtual";
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1] === undefined ? null : decodeXmlText(match[1]);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function encodeKey(key: string): string {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function makeObjectUrl(config: S3StorageConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  const encodedKey = encodeKey(key);
  const basePath = endpoint.pathname.replace(/\/+$/, "");

  if (config.addressingStyle === "virtual") {
    endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
    endpoint.pathname = `${basePath}/${encodedKey}`;
  } else {
    endpoint.pathname = `${basePath}/${encodeURIComponent(config.bucket)}/${encodedKey}`;
  }
  return endpoint;
}

async function requireSuccess(response: Response, operation: string): Promise<Response> {
  if (response.ok) return response;
  const detail = (await response.text()).slice(0, 2_000);
  throw new Error(`${operation} failed with S3 status ${response.status}${detail ? `: ${detail}` : ""}`);
}

/** Adapts any SigV4 S3-compatible endpoint to the object-storage port. */
export function makeS3ObjectStorage(config: S3StorageConfig): ObjectStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    service: "s3",
    region: config.region,
    retries: 3,
    initRetryMs: 100,
  });

  return {
    async createMultipart(key, metadata) {
      const url = makeObjectUrl(config, key);
      url.search = "uploads";
      const response = await requireSuccess(await client.fetch(url, {
        method: "POST",
        headers: { "content-type": metadata.contentType },
      }), "CreateMultipartUpload");
      const xml = await response.text();
      const uploadId = readXmlTag(xml, "UploadId");
      if (!uploadId) throw new Error("CreateMultipartUpload returned no UploadId");
      return { uploadId };
    },

    async uploadPart(key, uploadId, partNumber, body, size) {
      const url = makeObjectUrl(config, key);
      url.searchParams.set("partNumber", String(partNumber));
      url.searchParams.set("uploadId", uploadId);

      // Parts are intentionally bounded, so buffering makes SigV4 retries replay-safe.
      const bytes = await new Response(body).arrayBuffer();
      if (bytes.byteLength !== size) throw new Error(`UploadPart received ${bytes.byteLength} bytes instead of ${size}`);
      const response = await requireSuccess(await client.fetch(url, {
        method: "PUT",
        headers: { "content-length": String(bytes.byteLength) },
        body: bytes,
      }), "UploadPart");
      const etag = response.headers.get("etag");
      if (!etag) throw new Error("UploadPart returned no ETag");
      return { etag, partNumber };
    },

    async completeMultipart(key, uploadId, parts) {
      const url = makeObjectUrl(config, key);
      url.searchParams.set("uploadId", uploadId);
      const orderedParts = [...parts].sort((left, right) => left.partNumber - right.partNumber);
      const body = `<CompleteMultipartUpload>${orderedParts.map((part) => (
        `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`
      )).join("")}</CompleteMultipartUpload>`;
      const response = await requireSuccess(await client.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/xml" },
        body,
      }), "CompleteMultipartUpload");
      const xml = await response.text();
      const embeddedError = readXmlTag(xml, "Code");
      if (xml.includes("<Error>") && embeddedError) {
        throw new Error(`CompleteMultipartUpload failed: ${embeddedError}`);
      }
      return { etag: readXmlTag(xml, "ETag"), size: null };
    },

    async abortMultipart(key, uploadId) {
      const url = makeObjectUrl(config, key);
      url.searchParams.set("uploadId", uploadId);
      await requireSuccess(await client.fetch(url, { method: "DELETE" }), "AbortMultipartUpload");
    },

    async put(key, body, size, metadata) {
      const url = makeObjectUrl(config, key);
      const bytes = await new Response(body).arrayBuffer();
      const response = await requireSuccess(await client.fetch(url, {
        method: "PUT",
        headers: {
          "content-length": String(bytes.byteLength),
          "content-type": metadata.contentType,
        },
        body: bytes,
      }), "PutObject");
      return { etag: response.headers.get("etag"), size };
    },

    async get(key) {
      const response = await client.fetch(makeObjectUrl(config, key), { method: "GET" });
      if (response.status === 404) return null;
      await requireSuccess(response, "GetObject");
      if (!response.body) throw new Error("GetObject returned no response body");
      return {
        body: response.body,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        size: parsePositiveInteger(response.headers.get("content-length")),
      };
    },

    async delete(key) {
      await requireSuccess(await client.fetch(makeObjectUrl(config, key), { method: "DELETE" }), "DeleteObject");
    },
  };
}
