import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { parseUploadMetadata, UploadValidationError } from "@/lib/files";
import { FileStoreError, uploadUserFile } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";
import { resolveSession, SessionLookupError } from "@/server/session";

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status });
}

/** Streams an authenticated upload through the Effect file workflow. */
async function upload(request: Request): Promise<Response> {
  if (!request.body) return json({ error: "A file body is required" }, 400);

  try {
    const session = await Effect.runPromise(resolveSession(request.headers));
    if (!session) return json({ error: "Authentication required" }, 401);

    const result = await runFileEffect(uploadUserFile({
      body: request.body,
      metadata: parseUploadMetadata(request.headers),
      userId: session.user.id,
    }));
    return json(result, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return json({ error: error.message }, 400);
    }

    const operation = error instanceof FileStoreError ? error.operation : "session";
    const cause = error instanceof FileStoreError || error instanceof SessionLookupError
      ? error.cause
      : error;
    console.error(JSON.stringify({
      message: "file upload failed",
      operation,
      error: cause instanceof Error ? cause.message : String(cause),
    }));
    return json({ error: "Upload failed" }, 500);
  }
}

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      POST: ({ request }) => upload(request),
    },
  },
});
