import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { widgetKeys as widgetKeysTable, withBusinessTransaction } from "@lobbystack/db";
import { defaultWidgetConfig, widgetConfigSchema, type WidgetConfig, type WidgetKeyConfig } from "@lobbystack/shared";

import { getWorkerDatabase } from "./api-helpers";

export function hashWidgetKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

type ResolvedWidgetKey = {
  businessId: string;
  widgetKeyId: string;
};

export async function resolveWidgetKeyByHash(keyHash: string): Promise<ResolvedWidgetKey | null> {
  const result = await getWorkerDatabase().db.execute<{ business_id: string; widget_key_id: string }>(
    sql`select business_id, widget_key_id from app.resolve_business_by_widget_key(${keyHash})`,
  );
  const row = result.rows[0];
  return row ? { businessId: row.business_id, widgetKeyId: row.widget_key_id } : null;
}

export function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

export function normalizeAllowedOrigins(origins: unknown): Set<string> {
  if (!Array.isArray(origins)) return new Set();
  const normalized = new Set<string>();
  for (const value of origins) {
    if (typeof value !== "string") continue;
    const origin = normalizeOrigin(value);
    if (origin) normalized.add(origin);
  }
  return normalized;
}

function isLocalhostHttp(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function requestWidgetOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return normalizeOrigin(origin);
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return null;
  }
}

export function isAllowedWidgetOrigin(origin: string, allowedOrigins: unknown, options: { allowAdminOrigin?: boolean; allowLocalhost?: boolean } = {}): boolean {
  const normalized = normalizeOrigin(origin);
  const allowlist = normalizeAllowedOrigins(allowedOrigins);
  if (allowlist.has(normalized)) return true;
  if (options.allowLocalhost !== false && isLocalhostHttp(normalized) && process.env.NODE_ENV !== "production") return true;
  let adminOrigin = "";
  try {
    adminOrigin = normalizeOrigin(new URL(process.env.APP_BASE_URL ?? "").origin);
  } catch {
    // Fall through when APP_BASE_URL is unset.
  }
  if (options.allowAdminOrigin !== false && adminOrigin && normalized === adminOrigin) return true;
  return options.allowAdminOrigin !== false && Boolean(adminOrigin) && allowlist.has(adminOrigin);
}

type WidgetSessionTokenPayload = {
  v: 1;
  widgetKeyId: string;
  businessId: string;
  visitorId: string;
  origin: string;
  exp: number;
};

function widgetSessionSecret(): string {
  const secret = [process.env.WIDGET_SESSION_SECRET, process.env.BETTER_AUTH_SECRET]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
  if (!secret && process.env.NODE_ENV === "production") throw new Error("WIDGET_SESSION_SECRET or BETTER_AUTH_SECRET is required in production.");
  return secret ?? "development-only-widget-session-secret";
}

function encodeTokenPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signTokenParts(header: string, payload: string): string {
  return createHmac("sha256", widgetSessionSecret()).update(`${header}.${payload}`).digest("base64url");
}

export function createWidgetSessionToken(input: Omit<WidgetSessionTokenPayload, "v" | "exp"> & { ttlSeconds?: number }): { token: string; expiresAt: string } {
  const header = encodeTokenPart({ alg: "HS256", typ: "JWT" });
  const payload: WidgetSessionTokenPayload = { v: 1, widgetKeyId: input.widgetKeyId, businessId: input.businessId, visitorId: input.visitorId, origin: normalizeOrigin(input.origin), exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 3600) };
  const encodedPayload = encodeTokenPart(payload);
  return { token: `${header}.${encodedPayload}.${signTokenParts(header, encodedPayload)}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function verifyWidgetSessionToken(token: string): WidgetSessionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;
  const expected = signTokenParts(header, payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WidgetSessionTokenPayload;
    if (parsed.v !== 1 || typeof parsed.widgetKeyId !== "string" || typeof parsed.businessId !== "string" || typeof parsed.visitorId !== "string" || typeof parsed.origin !== "string" || typeof parsed.exp !== "number" || parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return { ...parsed, origin: normalizeOrigin(parsed.origin) };
  } catch {
    return null;
  }
}

export function serializeWidgetKeyConfig(row: { id: string; status: string | null; label: string | null; allowedOrigins: unknown; config: unknown; lastUsedAt: Date | null; createdAt: Date }): WidgetKeyConfig {
  const parsed = widgetConfigSchema.safeParse(row.config ?? {});
  const config = Object.fromEntries(
    Object.entries({ ...defaultWidgetConfig, ...(parsed.success ? parsed.data : {}) }).filter(([, value]) => value !== undefined),
  ) as unknown as WidgetConfig;
  return {
    id: row.id,
    label: row.label,
    status: (row.status === "active" || row.status === "disabled" || row.status === "revoked" ? row.status : "active"),
    allowedOrigins: Array.isArray(row.allowedOrigins) ? row.allowedOrigins.filter((value): value is string => typeof value === "string").map(normalizeOrigin) : [],
    config,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function touchWidgetKeyLastUsed(input: { businessId: string; widgetKeyId: string }): Promise<void> {
  await withBusinessTransaction(getWorkerDatabase().db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(widgetKeysTable).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(and(eq(widgetKeysTable.id, input.widgetKeyId), eq(widgetKeysTable.businessId, input.businessId)));
  });
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function requestIpHash(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex");
}
