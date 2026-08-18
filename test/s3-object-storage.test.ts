import { afterEach, describe, expect, it, vi } from "vitest";
import { makeS3ObjectStorage } from "@/server/s3-object-storage";

const config = {
  endpoint: "https://s3.example.test/gateway",
  region: "us-east-1",
  bucket: "private-drive",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  addressingStyle: "path" as const,
};

afterEach(() => vi.unstubAllGlobals());

describe("generic S3-compatible object storage", (): void => {
  it("signs the complete multipart lifecycle against a path-style endpoint", async (): Promise<void> => {
    const requests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");

      if (request.method === "POST" && url.search === "?uploads") {
        return new Response("<InitiateMultipartUploadResult><UploadId>provider-upload-1</UploadId></InitiateMultipartUploadResult>");
      }
      if (request.method === "PUT" && url.searchParams.has("partNumber")) {
        return new Response(null, { headers: { etag: '"part-etag"' } });
      }
      if (request.method === "POST" && url.searchParams.has("uploadId")) {
        return new Response("<CompleteMultipartUploadResult><ETag>&quot;final-etag&quot;</ETag></CompleteMultipartUploadResult>");
      }
      if (request.method === "GET") {
        return new Response("stored bytes", {
          headers: { "content-length": "12", "content-type": "text/plain", etag: '"final-etag"' },
        });
      }
      return new Response(null, { status: 204 });
    }));

    const storage = makeS3ObjectStorage(config);
    const key = "user-1/Documents/Guide résumé.txt";
    const started = await storage.createMultipart(key, { contentType: "text/plain" });
    expect(started.uploadId).toBe("provider-upload-1");

    const chunk = new TextEncoder().encode("chunk");
    expect(await storage.uploadPart(key, started.uploadId, 1, new Blob([chunk]).stream(), chunk.byteLength)).toEqual({
      etag: '"part-etag"',
      partNumber: 1,
    });
    expect(await storage.completeMultipart(key, started.uploadId, [{ etag: '"part-etag"', partNumber: 1 }])).toEqual({
      etag: '"final-etag"',
      size: null,
    });

    const object = await storage.get(key);
    expect(object).toMatchObject({ size: 12, contentType: "text/plain", etag: '"final-etag"' });
    expect(await new Response(object?.body).text()).toBe("stored bytes");
    await storage.delete(key);

    expect(requests[0]?.url).toContain("/gateway/private-drive/user-1/Documents/Guide%20r%C3%A9sum%C3%A9.txt?uploads");
    expect(requests.map(({ method }) => method)).toEqual(["POST", "PUT", "POST", "GET", "DELETE"]);
  });

  it("supports virtual-hosted bucket addressing", async (): Promise<void> => {
    let requestedUrl = "";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input, init);
      requestedUrl = request.url;
      return new Response(null, { status: 204 });
    }));

    const storage = makeS3ObjectStorage({ ...config, endpoint: "https://objects.example.test", addressingStyle: "virtual" });
    await storage.delete("user-1/file.txt");
    expect(requestedUrl).toBe("https://private-drive.objects.example.test/user-1/file.txt");
  });
});
