import { describe, expect, it, vi } from "vitest";
import { json, withAuthenticatedUser } from "@/server/api-response";

describe("custom route request security", (): void => {
  it("marks authenticated and secret-bearing JSON as non-cacheable", (): void => {
    expect(json({ invitationToken: "secret" }).headers.get("cache-control")).toBe("no-store");
  });

  it.each([undefined, "https://evil.example", "not a URL"])("rejects an unsafe mutation origin: %s", async (origin) => {
    const action = vi.fn(async () => new Response(null, { status: 204 }));
    const response = await withAuthenticatedUser(new Request("https://drivebox.test/api/governance", {
      method: "POST",
      headers: origin ? { origin } : undefined,
    }), action);
    expect(response.status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });
});
