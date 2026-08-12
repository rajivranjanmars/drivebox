import { createFileRoute } from "@tanstack/react-router";
import { parseMultipartUploadMetadata, UploadValidationError } from "@/lib/files";
import { json, withAuthenticatedUser } from "@/server/api-response";
import { startUserUpload } from "@/server/file-service";
import { runFileEffect } from "@/server/runtime";

async function start(request: Request): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > 4_096) throw new UploadValidationError("Upload details are too large");
    const text = await request.text();
    if (text.length > 4_096) throw new UploadValidationError("Upload details are too large");

    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch {
      throw new UploadValidationError("Upload details must be valid JSON");
    }
    const state = await runFileEffect(startUserUpload(userId, parseMultipartUploadMetadata(input)));
    return json(state, state.completed ? 200 : 201);
  });
}

export const Route = createFileRoute("/api/uploads")({
  server: { handlers: { POST: ({ request }) => start(request) } },
});
