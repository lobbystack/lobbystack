import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { widgetKeys } from "@lobbystack/db";
import { insertWidgetKeyInTransaction } from "@lobbystack/domain";
import { isUuid, isWidgetKeyIssuanceEnabled, widgetConfigSchema } from "@lobbystack/shared";

import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";
import { normalizeOrigin, serializeWidgetKeyConfig } from "@/lib/widget-keys";

export const dynamic = "force-dynamic";

function isWebOrigin(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function parseAllowedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) throw jsonError("allowedOrigins must be an array of origin strings.", 400, "invalid_request");
  const entries = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  // Browsers send a full origin, so a bare "example.com" would refuse every visitor.
  const invalid = entries.find((item) => !isWebOrigin(item));
  if (invalid !== undefined) throw jsonError(`"${invalid}" isn't a website address. Start it with https://, as in https://www.example.com.`, 400, "invalid_origin");
  return [...new Set(entries.map(normalizeOrigin))];
}

function parseConfig(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const parsed = widgetConfigSchema.safeParse(value);
  if (!parsed.success) throw jsonError("The widget configuration is invalid.", 400, "invalid_request");
  return parsed.data as unknown as Record<string, unknown>;
}

// The list also says whether this server makes new keys, so the widget page
// needs no billing to know it: a partner's business has none.
export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const rows = await tx.select().from(widgetKeys).where(eq(widgetKeys.businessId, businessId)).orderBy(desc(widgetKeys.createdAt));
  // The key is public (it sits in the website's script tag), so the dashboard can show its snippet again. Older keys kept only a hash.
  return { keys: rows.map((row) => ({ ...serializeWidgetKeyConfig(row), key: row.status === "revoked" ? null : row.keyValue })), issuanceEnabled: isWidgetKeyIssuanceEnabled(process.env) };
})));

export const POST = operatorRoute(async ({ businessId, body: input, transaction }) => NextResponse.json(await transaction(async (tx) => {
  if (!isWidgetKeyIssuanceEnabled(process.env)) throw jsonError("New website chat widgets are not available yet.", 403, "widget_issuance_disabled");
  const body = input as { label?: string; allowedOrigins?: string[]; config?: Record<string, unknown> };
  const allowedOrigins = parseAllowedOrigins(body.allowedOrigins ?? []);
  const config = parseConfig(body.config);
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : undefined;
  const { row, key } = await insertWidgetKeyInTransaction(tx, { businessId, label, allowedOrigins, config });
  return { ok: true, key: { id: row.id, key }, record: serializeWidgetKeyConfig(row) };
}, { minimumRole: "business_admin" })));

export const PATCH = operatorRoute(async ({ request, businessId, body: input, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) throw jsonError("A widget key id is required.", 400, "invalid_request");
  const body = input as { label?: string | null; allowedOrigins?: string[]; config?: Record<string, unknown>; status?: string };
  const existing = isUuid(id) ? (await tx.select({ id: widgetKeys.id, status: widgetKeys.status }).from(widgetKeys).where(and(eq(widgetKeys.id, id), eq(widgetKeys.businessId, businessId))).limit(1))[0] : undefined;
  if (!existing) throw jsonError("The widget key was not found.", 404, "not_found");
  const allowedOrigins = body.allowedOrigins !== undefined ? parseAllowedOrigins(body.allowedOrigins) : undefined;
  const config = body.config !== undefined ? parseConfig(body.config) : undefined;
  const status = body.status === "active" || body.status === "disabled" || body.status === "revoked" ? body.status : undefined;
  if (body.status !== undefined && status === undefined) throw jsonError("status must be active, disabled or revoked.", 400, "invalid_request");
  if (existing.status === "revoked" && status !== undefined && status !== "revoked") throw jsonError("You can't turn a revoked widget key back on. Create a new key instead.", 409, "widget_key_revoked");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) patch.status = status;
  if (allowedOrigins !== undefined) patch.allowedOrigins = allowedOrigins;
  if (config !== undefined) patch.config = config;
  if (body.label !== undefined) patch.label = body.label === null ? null : body.label.trim().slice(0, 120);
  if (Object.keys(patch).length === 1) throw jsonError("Send at least one field to update.", 400, "invalid_request");
  const [row] = await tx.update(widgetKeys).set(patch).where(and(eq(widgetKeys.id, id), eq(widgetKeys.businessId, businessId))).returning();
  if (!row) throw new Error("The widget key could not be updated.");
  return { ok: true, record: serializeWidgetKeyConfig(row) };
}, { minimumRole: "business_admin" })));
