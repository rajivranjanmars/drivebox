import { createFileRoute } from "@tanstack/react-router";
import { getDatabase } from "@/db";
import { json, withAuthenticatedUser } from "@/server/api-response";
import {
  decideAccountRequest,
  getGovernanceDashboard,
  markNotificationRead,
  reissueAccountInvitation,
  requestChildAccount,
} from "@/server/governance";

interface GovernancePayload {
  readonly action?: unknown;
  readonly decision?: unknown;
  readonly email?: unknown;
  readonly name?: unknown;
  readonly notificationId?: unknown;
  readonly reason?: unknown;
  readonly requestId?: unknown;
  readonly role?: unknown;
  readonly transitionNonce?: unknown;
}

async function dashboard(request: Request): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => json(await getGovernanceDashboard(getDatabase(), userId)));
}

async function mutate(request: Request): Promise<Response> {
  return withAuthenticatedUser(request, async (userId) => {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > 8_192) return json({ error: "Request body is too large" }, 413);
    const text = await request.text();
    if (text.length > 8_192) return json({ error: "Request body is too large" }, 413);

    let payload: GovernancePayload;
    try {
      payload = JSON.parse(text) as GovernancePayload;
    } catch {
      return json({ error: "A valid JSON body is required" }, 400);
    }

    if (payload.action === "request-user") {
      if (payload.role !== "admin" && payload.role !== "member") {
        return json({ error: "Role must be admin or member" }, 400);
      }
      const result = await requestChildAccount(getDatabase(), userId, {
        email: String(payload.email ?? ""),
        name: String(payload.name ?? ""),
        role: payload.role,
      });
      return json(result, 201);
    }

    if (payload.action === "decide-request") {
      if (typeof payload.requestId !== "string") return json({ error: "Request ID is required" }, 400);
      if (payload.decision !== "approve" && payload.decision !== "reject") {
        return json({ error: "Decision must be approve or reject" }, 400);
      }
      return json(await decideAccountRequest(
        getDatabase(),
        userId,
        payload.requestId,
        payload.decision,
        typeof payload.reason === "string" ? payload.reason : undefined,
      ));
    }

    if (payload.action === "read-notification") {
      if (typeof payload.notificationId !== "string") return json({ error: "Notification ID is required" }, 400);
      await markNotificationRead(getDatabase(), userId, payload.notificationId);
      return new Response(null, { status: 204 });
    }

    if (payload.action === "reissue-invitation") {
      if (typeof payload.requestId !== "string") return json({ error: "Request ID is required" }, 400);
      if (typeof payload.transitionNonce !== "string") return json({ error: "Request version is required" }, 400);
      return json(await reissueAccountInvitation(getDatabase(), userId, payload.requestId, payload.transitionNonce));
    }

    return json({ error: "Unknown governance action" }, 400);
  });
}

export const Route = createFileRoute("/api/governance")({
  server: { handlers: { GET: ({ request }) => dashboard(request), POST: ({ request }) => mutate(request) } },
});
