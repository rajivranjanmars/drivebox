const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

/** Resolves an authentication callback to a safe in-application path. */
export function resolveAuthCallback(requestedPath: string | null): string {
  if (
    requestedPath?.startsWith("/")
    && !requestedPath.startsWith("//")
    && !requestedPath.includes("\\")
  ) {
    return requestedPath;
  }

  return DEFAULT_AUTHENTICATED_PATH;
}
