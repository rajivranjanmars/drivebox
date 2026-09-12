import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getDatabase } from "@/db";
import { getAuth } from "@/lib/auth";
import { json } from "@/server/api-response";
import { claimLegacySuperadmin, GovernanceError } from "@/server/governance";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function claim(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: "Cross-site request rejected" }, 403);
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Authentication required" }, 401);
  const payload = await request.json().catch(() => null) as { token?: unknown } | null;
  if (typeof payload?.token !== "string") return json({ error: "Bootstrap token is required" }, 400);
  try {
    await claimLegacySuperadmin(getDatabase(), session.user, payload.token, env.SUPERADMIN_BOOTSTRAP_TOKEN, env.SUPERADMIN_BOOTSTRAP_EMAIL);
    return json({ status: "claimed" });
  } catch (cause) {
    if (cause instanceof GovernanceError) return json({ error: cause.message }, cause.code === "conflict" ? 409 : 403);
    throw cause;
  }
}

export const Route = createFileRoute("/api/bootstrap")({ server: { handlers: { POST: ({ request }) => claim(request) } } });
