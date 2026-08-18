import { createFileRoute } from "@tanstack/react-router";
import { json, withAuthenticatedUser } from "@/server/api-response";
import { abortUserUpload, completeUserUpload, getUserUpload } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";

async function status(request: Request, uploadId: string): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => json(await runFileEffect(getUserUpload(userId, uploadId))));
}

async function complete(request: Request, uploadId: string): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => json(await runFileEffect(completeUserUpload(userId, uploadId))));
}

async function abort(request: Request, uploadId: string): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    await runFileEffect(abortUserUpload(userId, uploadId));
    return new Response(null, { status: 204 });
  });
}

export const Route = createFileRoute("/api/uploads/$uploadId")({
  server: {
    handlers: {
      GET: ({ request, params }) => status(request, params.uploadId),
      POST: ({ request, params }) => complete(request, params.uploadId),
      DELETE: ({ request, params }) => abort(request, params.uploadId),
    },
  },
});
