import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/lib/auth";

/** Delegates all Better Auth protocol endpoints to the request-scoped instance. */
function handleAuthRequest(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});
