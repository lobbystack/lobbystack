import { isIP } from "node:net";

/**
 * Ingress headers we are willing to trust once the deployment explicitly opts
 * in. Both are single-value headers that a managed edge proxy overwrites:
 * Railway replaces `x-real-ip`, Cloudflare overwrites `cf-connecting-ip`.
 * `x-forwarded-for` is intentionally excluded because it is appended to and
 * carries a proxy hop, so its leftmost value is caller-controlled.
 */
export const TRUSTED_CLIENT_IP_HEADERS = ["x-real-ip", "cf-connecting-ip"] as const;
export type TrustedClientIpHeader = (typeof TRUSTED_CLIENT_IP_HEADERS)[number];

/**
 * Fail-closed key for requests that cannot be attributed to a single client.
 * Callers hash it like a real address so unattributable traffic shares one
 * strict bucket instead of skipping per-client limits or minting identities.
 */
export const UNATTRIBUTABLE_CLIENT_IP = "unattributable";

export type TrustedClientIpResolution = {
  ip: string | undefined;
  source: "trusted-header" | "direct" | "unattributable";
};

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
export function warnTrustedClientIpUnconfigured(
  env: Record<string, string | undefined> = process.env,
): void {
  if (warnedUnconfigured || env.NODE_ENV !== "production") return;
  warnedUnconfigured = true;
  console.warn(
    "[trusted-client-ip] TRUSTED_CLIENT_IP_HEADER is not configured; per-client IP attribution is disabled and requests share one fallback bucket. Set it to x-real-ip or cf-connecting-ip only after verifying the ingress overwrites that header.",
  );
}

/**
 * Accept a single valid IPv4/IPv6 address. Multi-value or non-IP values are
 * rejected so a caller-forged forwarding header can never mint identity.
 */
export function normalizeTrustedClientIp(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized || isIP(normalized) === 0) return undefined;
  return normalized;
}

/**
 * Resolve a client IP only from the deployment's opted-in, ingress-controlled
 * header. Without that opt-in nothing is trusted: callers must treat
 * `undefined` as "no attributable client" and apply shared/global limits rather
 * than letting a caller-forged forwarding header mint identity.
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
  return normalizeTrustedClientIp(headers.get(header));
}

export function trustedClientIp(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return trustedClientIpFromHeaders(request.headers, env);
}

export function resolveTrustedClientIp(input: {
  headers: Record<string, string | string[] | undefined>;
  peerIp: string | undefined;
  trustProxy: boolean;
  env?: Record<string, string | undefined>;
}): TrustedClientIpResolution {
  const env = input.env ?? process.env;
  const header = trustedClientIpHeader(env);
  if (!header) {
    warnTrustedClientIpUnconfigured(env);
    // Without an explicit opt-in, a socket peer is only trustworthy in direct
    // mode. A proxy-derived `request.ip` can be shaped by `x-forwarded-for`.
    if (input.trustProxy) {
      return { ip: undefined, source: "unattributable" };
    }
    const direct = normalizeTrustedClientIp(input.peerIp);
    return direct === undefined
      ? { ip: undefined, source: "unattributable" }
      : { ip: direct, source: "direct" };
  }

  const raw = input.headers[header];
  // Duplicate headers arrive as arrays; only a single scalar value is trusted.
  const trusted = typeof raw === "string" ? normalizeTrustedClientIp(raw) : undefined;
  return trusted === undefined
    ? { ip: undefined, source: "unattributable" }
    : { ip: trusted, source: "trusted-header" };
}

/**
 * Resolve the rate-limit/abuse identity for a request. Always returns a
 * non-empty key: unattributable requests fail closed onto one shared bucket
 * rather than bypassing the limit or rotating identities.
 */
export function resolveTrustedClientIpKey(input: {
  headers: Record<string, string | string[] | undefined>;
  peerIp: string | undefined;
  trustProxy: boolean;
  env?: Record<string, string | undefined>;
}): string {
  return resolveTrustedClientIp(input).ip ?? UNATTRIBUTABLE_CLIENT_IP;
}
