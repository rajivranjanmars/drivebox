import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createDatabase } from "@/db";
import { createAuth } from "@/lib/auth";
import { resolveAuthCallback } from "@/lib/navigation";

const baseURL = "https://drivebox.test";

/** Extracts a request Cookie header from Better Auth's Set-Cookie response. */
function getCookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

describe("Better Auth on D1", (): void => {
  it("allows local callbacks and rejects external redirect forms", (): void => {
    expect(resolveAuthCallback("/dashboard?view=recent")).toBe("/dashboard?view=recent");
    expect(resolveAuthCallback("//example.com/path")).toBe("/dashboard");
    expect(resolveAuthCallback("/\\example.com/path")).toBe("/dashboard");
    expect(resolveAuthCallback("https://example.com/path")).toBe("/dashboard");
    expect(resolveAuthCallback(null)).toBe("/dashboard");
  });

  it("registers, resolves a session, signs out, and rejects a bad password", async (): Promise<void> => {
    const auth = createAuth({
      database: createDatabase(env.DB),
      secret: "test-secret-that-is-at-least-thirty-two-characters-long",
      baseURL,
    });

    const signUpResponse = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({
        name: "Auth Tester",
        email: "auth-tester@example.com",
        password: "correct-horse-battery-staple",
      }),
    }));
    expect(signUpResponse.status).toBe(200);

    const cookie = getCookieHeader(signUpResponse);
    expect(cookie).toContain("better-auth.session_token");

    const sessionResponse = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, {
      headers: { cookie },
    }));
    const session = await sessionResponse.json() as { user?: { email?: string } } | null;
    expect(session?.user?.email).toBe("auth-tester@example.com");

    const badSignInResponse = await auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({
        email: "auth-tester@example.com",
        password: "incorrect-password",
      }),
    }));
    expect(badSignInResponse.status).toBe(401);

    const signOutResponse = await auth.handler(new Request(`${baseURL}/api/auth/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: baseURL },
      body: "{}",
    }));
    expect(signOutResponse.status).toBe(200);

    const signedOutSessionResponse = await auth.handler(new Request(`${baseURL}/api/auth/get-session`, {
      headers: { cookie },
    }));
    expect(await signedOutSessionResponse.json()).toBeNull();
  });
});
