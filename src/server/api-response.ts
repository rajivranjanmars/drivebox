import { Effect } from "effect";
import { FileStoreError, FileNotFoundError, FolderConflictError } from "@/server/file-service";
import { resolveSession, SessionLookupError } from "@/server/session";
import { UploadValidationError } from "@/lib/files";

export function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

/** Resolves Better Auth once and maps typed workflow failures to safe HTTP responses. */
export async function withAuthenticatedUser(
  request: Request,
  action: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    const session = await Effect.runPromise(resolveSession(request.headers));
    if (!session) return json({ error: "Authentication required" }, 401);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof UploadValidationError) return json({ error: error.message }, 400);
    if (error instanceof FolderConflictError) return json({ error: error.reason }, 409);
    if (error instanceof FileNotFoundError) return json({ error: "Not found" }, 404);

    const operation = error instanceof FileStoreError ? error.operation : "session";
    const cause = error instanceof FileStoreError || error instanceof SessionLookupError ? error.cause : error;
    console.error(JSON.stringify({
      message: "authenticated storage request failed",
      operation,
      error: cause instanceof Error ? cause.message : String(cause),
    }));
    return json({ error: "Storage request failed" }, 500);
  }
}
