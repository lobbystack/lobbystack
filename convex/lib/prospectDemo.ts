export const PROSPECT_DEMO_TOKEN_LENGTH = 32;
export const PROSPECT_DEMO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const PROSPECT_DEMO_WIDGET_ID = "lobbystack-prospect-demo";
export const PROSPECT_DEMO_SESSION_PURPOSE = "prospect_demo";
export const PROSPECT_DEMO_CALLS_PER_VISITOR = 5;
export const PROSPECT_DEMO_MAX_SUGGESTED_PROMPTS = 3;

export const PROSPECT_DEMO_INTAKE_TOOL_NAMES = new Set([
  "waitForUser",
  "getBusinessHours",
  "getBusinessServices",
  "searchKnowledge",
  "takeMessage",
  "endCall",
]);

export const PROSPECT_DEMO_STATUSES = [
  "preparing",
  "active",
  "claimed",
  "revoked",
] as const;

export type ProspectDemoStatus = (typeof PROSPECT_DEMO_STATUSES)[number];

export function generateProspectDemoToken(
  length: number = PROSPECT_DEMO_TOKEN_LENGTH,
): string {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const alphabetSize = alphabet.length;
  const rejectThreshold = Math.floor(256 / alphabetSize) * alphabetSize;
  const result: string[] = [];
  const buffer = new Uint8Array(length);

  while (result.length < length) {
    crypto.getRandomValues(buffer);
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      const byte = buffer[i]!;
      if (byte < rejectThreshold) {
        result.push(alphabet.charAt(byte % alphabetSize));
      }
    }
  }

  return result.join("");
}

export async function hashProspectDemoToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function slugifyProspectDemoName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildProspectDemoPublicUrl(token: string): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error("SITE_URL is required to build prospect demo links.");
  }

  return new URL(`/demo/${token}`, siteUrl).toString();
}

export function buildProspectDemoClaimPath(token: string): string {
  return `/claim-demo?token=${encodeURIComponent(token)}`;
}

export function buildProspectDemoSignupUrl(token: string): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error("SITE_URL is required to build prospect demo signup links.");
  }

  const returnTo = buildProspectDemoClaimPath(token);
  const url = new URL("/signup", siteUrl);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function normalizeProspectDemoLocale(
  value: string | undefined | null,
): "en" | "fr" {
  const normalized = value?.trim().toLowerCase() ?? "en";
  if (normalized === "fr" || normalized.startsWith("fr-")) {
    return "fr";
  }
  return "en";
}

export function isProspectDemoExpired(input: {
  status: ProspectDemoStatus;
  expiresAt: number;
  now?: number;
}): boolean {
  if (input.status === "revoked" || input.status === "claimed") {
    return false;
  }
  return (input.now ?? Date.now()) >= input.expiresAt;
}

export function resolveProspectDemoPublicState(input: {
  status: ProspectDemoStatus;
  expiresAt: number;
  now?: number;
}): "preparing" | "active" | "claimed" | "revoked" | "expired" {
  if (input.status === "claimed") {
    return "claimed";
  }
  if (input.status === "revoked") {
    return "revoked";
  }
  if (input.status === "preparing") {
    return "preparing";
  }
  if (isProspectDemoExpired(input)) {
    return "expired";
  }
  return "active";
}

export function isProspectDemoSessionPurpose(
  sessionPurpose: string | undefined | null,
): boolean {
  return sessionPurpose === PROSPECT_DEMO_SESSION_PURPOSE;
}

export function isProspectDemoIntakeToolAllowed(toolName: string): boolean {
  return PROSPECT_DEMO_INTAKE_TOOL_NAMES.has(toolName);
}
