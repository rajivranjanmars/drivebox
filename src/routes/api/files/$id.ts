import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { buildContentDisposition } from "@/lib/files";
import {
  deleteUserFile,
  downloadUserFile,
  FileNotFoundError,
  FileStoreError,
} from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";
import { resolveSession, SessionLookupError } from "@/server/session";

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status });
}

async function withSession(
  request: Request,
  action: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const session = await Effect.runPromise(resolveSession(request.headers));
    if (!session) return json({ error: "Authentication required" }, 401);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof FileNotFoundError) return json({ error: "File not found" }, 404);

    const operation = error instanceof FileStoreError ? error.operation : "session";
    const cause = error instanceof FileStoreError || error instanceof SessionLookupError
      ? error.cause
      : error;
    console.error(JSON.stringify({
      message: "file request failed",
      operation,
      error: cause instanceof Error ? cause.message : String(cause),
    }));
    return json({ error: "File request failed" }, 500);
  }
}

async function download(request: Request, id: string): Promise<Response> {
  return withSession(request, async (userId) => {
    const { object, record } = await runFileEffect(downloadUserFile(userId, id));
    const headers = new Headers();
    headers.set("content-type", record.mimeType);
    headers.set("content-length", String(record.size));
    headers.set("content-disposition", buildContentDisposition(record.filename));
    if (object.etag) headers.set("etag", object.etag);
    headers.set("cache-control", "private, no-store");
    return new Response(object.body, { headers });
  });
}

async function remove(request: Request, id: string): Promise<Response> {
  return withSession(request, async (userId) => {
    await runFileEffect(deleteUserFile(userId, id));
    return new Response(null, { status: 204 });
  });
}

export const Route = createFileRoute("/api/files/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => download(request, params.id),
      DELETE: ({ request, params }) => remove(request, params.id),
    },
  },
});
