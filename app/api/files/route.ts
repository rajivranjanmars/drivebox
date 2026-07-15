import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { getDatabase } from "@/db";
import {
  buildObjectKey,
  insertFile,
  parseUploadMetadata,
  UploadValidationError,
} from "@/lib/files";
import { getCurrentSession } from "@/lib/session";

/** Reads an exactly-sized body for Node-based local development without unbounded buffering. */
async function readExactBody(
  body: ReadableStream<Uint8Array>,
  expectedSize: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(expectedSize);
  const reader = body.getReader();
  let offset = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > expectedSize) {
      await reader.cancel("Upload exceeded its declared size");
      throw new UploadValidationError("The uploaded byte count exceeded the declared size");
    }
    bytes.set(value, offset);
    offset += value.byteLength;
  }

  if (offset !== expectedSize) {
    throw new UploadValidationError("The uploaded byte count did not match the declared size");
  }

  return bytes;
}

/** Stores a body with an explicit length in Workers and a bounded fallback in Next dev. */
async function storeUploadBody(
  bucket: R2Bucket,
  objectKey: string,
  body: ReadableStream<Uint8Array>,
  metadata: { filename: string; mimeType: string; size: number; ownerId: string },
): Promise<R2Object> {
  const options: R2PutOptions = {
    httpMetadata: { contentType: metadata.mimeType },
    customMetadata: {
      ownerId: metadata.ownerId,
      filename: metadata.filename,
    },
  };

  if (typeof FixedLengthStream !== "undefined") {
    const fixedLengthBody = new FixedLengthStream(metadata.size);
    const pipePromise = body.pipeTo(fixedLengthBody.writable);
    const storePromise = bucket.put(objectKey, fixedLengthBody.readable, options);
    const [storedObject] = await Promise.all([storePromise, pipePromise]);
    return storedObject;
  }

  // OpenNext's Node-based `next dev` bridge does not expose Workers stream globals.
  return bucket.put(objectKey, await readExactBody(body, metadata.size), options);
}

/** Streams an authenticated upload into R2 and records its metadata in D1. */
export async function POST(request: Request): Promise<Response> {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "A file body is required" }, { status: 400 });
  }

  try {
    const metadata = parseUploadMetadata(request.headers);
    const id = crypto.randomUUID();
    const objectKey = buildObjectKey(currentSession.user.id, id);
    const { env } = getCloudflareContext();
    const storedObject = await storeUploadBody(env.FILES, objectKey, request.body, {
      ...metadata,
      ownerId: currentSession.user.id,
    });

    if (storedObject.size !== metadata.size) {
      await env.FILES.delete(objectKey);
      throw new UploadValidationError("The uploaded byte count did not match the declared size");
    }

    try {
      await insertFile(getDatabase(), {
        id,
        userId: currentSession.user.id,
        objectKey,
        ...metadata,
      });
    } catch (error) {
      // Compensate for a metadata failure so an untracked object is not retained.
      await env.FILES.delete(objectKey);
      throw error;
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(
      JSON.stringify({
        message: "file upload failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
