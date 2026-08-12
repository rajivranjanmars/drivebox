import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "@/server/security-headers";

describe("Worker security headers", () => {
  it("hardens dynamic HTML and prevents shared caching", async () => {
    const response = withSecurityHeaders(new Response("<h1>DriveBox</h1>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }), "https://drivebox.example");

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("<h1>DriveBox</h1>");
  });

  it("does not replace cache policy for non-HTML file responses", () => {
    const response = withSecurityHeaders(new Response("file", {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/octet-stream",
      },
    }));

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("content-security-policy")).toBe(false);
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("does not force HTTPS policy during local HTTP development", () => {
    const response = withSecurityHeaders(new Response("<h1>Local</h1>", {
      headers: { "content-type": "text/html" },
    }), "http://localhost:3000");

    expect(response.headers.has("strict-transport-security")).toBe(false);
    expect(response.headers.has("content-security-policy")).toBe(false);
  });
});
