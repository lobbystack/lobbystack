/**
 * Builds a relative auth path while preserving a safe in-app returnTo query.
 * Rejects protocol-relative and absolute URLs so returnTo cannot leave the app.
 */
export function buildAuthPathWithReturnTo(
  path: "/login" | "/signup",
  returnTo: string | null | undefined,
): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return path;
  }
  return `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeReturnTo(
  returnTo: string | null | undefined,
): string | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }
  return returnTo;
}
