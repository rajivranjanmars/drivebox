import { Effect } from "effect";
import { getDatabase } from "@/db";
import { FileStoreError, FileNotFoundError, FolderConflictError } from "@/server/file-service";
import { getUserProfile, GovernanceError } from "@/server/governance";
import { resolveSession, SessionLookupError } from "@/server/session";
import { UploadValidationError } from "@/lib/files";

export function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Resolves Better Auth once and maps typed workflow failures to safe HTTP responses. */
export async function withAuthenticatedUser(
  request: Request,
  action: (userId: string) => Promise<Response>,
): Promise<Response> {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      if (!hasSameOrigin(request)) {
        return json({ error: "Cross-site request rejected" }, 403);
      }
    }
    const session = await Effect.runPromise(resolveSession(request.headers));
    if (!session) return json({ error: "Authentication required" }, 401);
    const profile = await getUserProfile(getDatabase(), session.user.id);
    if (profile?.status !== "active") return json({ error: "Account unavailable" }, 403);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof GovernanceError) {
      const status = error.code === "invalid" ? 400
        : error.code === "forbidden" ? 403
        : error.code === "not-found" ? 404
        : 409;
      return json({ error: error.message }, status);
    }
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
