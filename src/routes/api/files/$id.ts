import { createFileRoute } from "@tanstack/react-router";
import { getDatabase } from "@/db";
import { buildContentDisposition } from "@/lib/files";
import { withAuthenticatedUser } from "@/server/api-response";
import {
  deleteUserFile,
  downloadUserFile,
} from "@/server/file-service";
import { resolveDriveAccess } from "@/server/governance";
import { runFileEffect } from "@/server/runtime";

async function download(request: Request, id: string): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    const owner = new URL(request.url).searchParams.get("owner");
    const access = await resolveDriveAccess(getDatabase(), userId, owner);
    const { object, record } = await runFileEffect(downloadUserFile(access.ownerId, id));
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
  return withAuthenticatedUser(request, async (userId) => {
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
