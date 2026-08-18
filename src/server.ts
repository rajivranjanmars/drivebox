import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { withSecurityHeaders } from "@/server/security-headers";

export default createServerEntry({
  async fetch(request, options) {
    return withSecurityHeaders(await handler.fetch(request, options), request.url);
  },
});
