import { configuredAppOrigins } from "./app-origins";
import { readResolvedBrand } from "./request-brand";

/**
 * The relying party ID passkeys are bound to: PASSKEY_RP_ID when set, else the
 * hostname of APP_BASE_URL. A passkey only works on that host and its
 * subdomains, so changing it locks everyone out of the passkeys they made.
 * Better Auth would use the hostname of its base URL, but ours is resolved per
 * request, so it needs to be named.
 */
export function passkeyRpId(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.PASSKEY_RP_ID?.trim();
  if (configured) return configured;
  const [origin] = configuredAppOrigins(env);
  return origin ? new URL(origin).hostname : "localhost";
}

/** Better Auth's paths that register, list, change or use a passkey. */
export function isPasskeyPath(path?: string): boolean {
  return Boolean(path?.startsWith("/passkey/"));
}

/**
 * Whether a request may use passkeys: only on the host's own domain, as the
 * proxy resolved it. A passkey belongs to one domain, and a partner's host
 * offers email and password only.
 */
export function passkeyAllowed(headers: Headers): boolean {
  return readResolvedBrand(headers)?.kind === "host";
}
