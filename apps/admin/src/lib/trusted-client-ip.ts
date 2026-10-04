import { isIP } from "node:net";

/**
 * Ingress headers we are willing to trust once the deployment explicitly opts
 * in. Both are single-value headers that a managed edge proxy overwrites:
 * Railway replaces `x-real-ip`, Cloudflare overwrites `cf-connecting-ip`.
 * `x-forwarded-for` is intentionally excluded because it is appended to and
 * carries a proxy hop, so its leftmost value is caller-controlled.
 */
const TRUSTED_CLIENT_IP_HEADERS = ["x-real-ip", "cf-connecting-ip"] as const;
type TrustedClientIpHeader = (typeof TRUSTED_CLIENT_IP_HEADERS)[number];

let warnedUnconfigured = false;

export function trustedClientIpHeader(
  env: Record<string, string | undefined> = process.env,
): TrustedClientIpHeader | undefined {
  const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  return TRUSTED_CLIENT_IP_HEADERS.find((header) => header === configured);
}

/**
 * Emit a single production warning when no trusted header is configured. The
 * request still fails closed (callers fall back to shared limits), but the
 * operator is told why per-client attribution is unavailable instead of the
 * degradation staying silent.
 */
function warnTrustedClientIpUnconfigured(env: Record<string, string | undefined>): void {
  if (warnedUnconfigured || env.NODE_ENV !== "production") return;
  warnedUnconfigured = true;
  console.warn(
    "[trusted-client-ip] TRUSTED_CLIENT_IP_HEADER is not configured; per-client IP attribution is disabled and requests share one fallback bucket. Set it to x-real-ip or cf-connecting-ip only after verifying the ingress overwrites that header.",
  );
}

/**
 * Resolve a client IP only from the deployment's opted-in, ingress-controlled
 * header. Without that opt-in nothing is trusted: callers must treat
 * `undefined` as "no attributable client" and apply shared/global limits rather
 * than letting a caller-forged forwarding header mint identity. Multi-value or
 * non-IP values are rejected for the same reason.
 */
export function trustedClientIpFromHeaders(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const header = trustedClientIpHeader(env);
  if (!header) {
    warnTrustedClientIpUnconfigured(env);
    return undefined;
  }
  const value = headers.get(header)?.trim();
  return value && isIP(value) !== 0 ? value : undefined;
}

export function trustedClientIp(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return trustedClientIpFromHeaders(request.headers, env);
}
