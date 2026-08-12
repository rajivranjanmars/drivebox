const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

/** Adds browser security policy to dynamic Worker responses. */
export function withSecurityHeaders(response: Response, requestUrl = "https://drivebox.invalid"): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";
  const isSecure = new URL(requestUrl).protocol === "https:";

  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  if (contentType.includes("text/html")) {
    headers.set("Cache-Control", "private, no-store");
    if (isSecure) {
      headers.set("Content-Security-Policy", `${CONTENT_SECURITY_POLICY}; upgrade-insecure-requests`);
    }
  }

  if (isSecure) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
