/**
 * The app's configured origins: APP_BASE_URL first, then any `extraKeys`, then
 * the comma-separated AUTH_TRUSTED_ORIGINS. The request's own URL and Host are
 * never included, because a DNS-rebinding page controls both. Malformed values
 * are ignored rather than trusted, unless `keepPatterns` is set: then values
 * that are not plain origins (such as Better Auth's `*.example.com` wildcards or
 * custom schemes) pass through trimmed.
 */
export function configuredAppOrigins(environment: Readonly<Record<string, string | undefined>> = process.env, extraKeys: string[] = [], keepPatterns = false): string[] {
  const values = [environment.APP_BASE_URL, ...extraKeys.map((key) => environment[key]), ...(environment.AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  const origins = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    let origin: string | undefined;
    try {
      origin = new URL(trimmed).origin;
    } catch {
      // Not a URL.
    }
    // Opaque origins (custom schemes, "localhost:3000") serialize as "null".
    if (origin && origin !== "null") origins.add(origin);
    else if (keepPatterns) origins.add(trimmed);
  }
  return [...origins];
}
