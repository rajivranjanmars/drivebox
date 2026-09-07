import { createFileRoute } from "@tanstack/react-router";
import { normalizeFolderPath } from "@/lib/files";
import { json, withAuthenticatedUser } from "@/server/api-response";
import { createUserFolder, deleteUserFolder } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";

interface CreateFolderPayload {
  readonly path?: unknown;
}

async function create(request: Request): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    let payload: CreateFolderPayload;
    try {
      payload = await request.json() as CreateFolderPayload;
    } catch {
      return json({ error: "A JSON body is required" }, 400);
    }

    const path = normalizeFolderPath(payload.path);
    if (!path) return json({ error: "The folder name is required" }, 400);

    const folder = await runFileEffect(createUserFolder(userId, path));
    return json(folder, 201);
  });
}

async function remove(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path") ?? "";
  return withAuthenticatedUser(request, async (userId) => {
    const path = normalizeFolderPath(rawPath);
    if (!path) return json({ error: "The folder path is required" }, 400);
    await runFileEffect(deleteUserFolder(userId, path));
    return new Response(null, { status: 204 });
  });
}

export const Route = createFileRoute("/api/folders")({
  server: {
    handlers: {
      POST: ({ request }) => create(request),
      DELETE: ({ request }) => remove(request),
    },
  },
});
