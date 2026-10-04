/**
 * The app's configured origins: APP_BASE_URL first, then any `extraKeys`, then
 * the comma-separated AUTH_TRUSTED_ORIGINS. The request's own URL and Host are
 * never included, because a DNS-rebinding page controls both. Malformed values
 * are ignored rather than trusted.
 */
export function configuredAppOrigins(environment: Readonly<Record<string, string | undefined>> = process.env, extraKeys: string[] = []): string[] {
  const values = [environment.APP_BASE_URL, ...extraKeys.map((key) => environment[key]), ...(environment.AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  const origins = new Set<string>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed configuration rather than trusting it.
    }
  }
  return [...origins];
}
