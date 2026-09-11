/**
 * Origins the browser needs for PostHog ingestion, session replay assets, and
 * error reporting. PostHog serves its SDK bundles from changing posthog.com
 * subdomains, so the wildcard is kept alongside the configured ingestion host,
 * which is the first-party reverse proxy in deployed environments.
 */
export function posthogSources(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  const origins = ["https://*.posthog.com"];
  const configured = source.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (configured) {
    try {
      origins.unshift(new URL(configured).origin);
    } catch {
      // Keep the PostHog defaults when a public analytics URL is malformed.
    }
  }
  return Array.from(new Set(origins));
}

export function webCallConnectSource(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const endpoint = source.NEXT_PUBLIC_WEB_CALL_ENDPOINT?.trim();
  if (!endpoint) return undefined;

  try {
    return new URL(endpoint).origin;
  } catch {
    return undefined;
  }
}
export function recordingStorageSource(
  source: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (source.STORAGE_PROVIDER !== "s3") return undefined;
  const bucket = source.S3_BUCKET?.trim();
  if (!bucket || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket)) return undefined;
  try {
    const region = source.S3_REGION?.trim() || "us-east-1";
    if (!/^[a-z0-9-]+$/.test(region)) return undefined;
    const endpoint = new URL(source.S3_ENDPOINT || `https://s3.${region}.amazonaws.com`);
    if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) return undefined;
    // Match S3's path-style fallback for IP endpoints and dotted HTTPS buckets.
    const pathStyle = source.S3_FORCE_PATH_STYLE === "true" ||
      /^[\d.]+$/.test(endpoint.hostname) || endpoint.hostname.startsWith("[") ||
      (endpoint.protocol === "https:" && bucket.includes("."));
    if (!pathStyle) endpoint.hostname = `${bucket}.${endpoint.hostname}`;
    return endpoint.origin;
  } catch {
    return undefined;
  }
}
