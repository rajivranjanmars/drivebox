import { getAuth } from "@/lib/auth";

/** Delegates an authentication request to the request-scoped Better Auth handler. */
async function handleAuthRequest(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
