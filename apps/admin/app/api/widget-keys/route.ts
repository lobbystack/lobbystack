import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { widgetKeys } from "@lobbystack/db";
import { widgetConfigSchema } from "@lobbystack/shared";

import { asApiResponse, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { hashWidgetKey, normalizeOrigin, serializeWidgetKeyConfig } from "@/lib/widget-keys";

export const dynamic = "force-dynamic";

function parseAllowedOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("allowedOrigins must be an array of origin strings.");
  const origins = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => normalizeOrigin(item.trim()));
  return [...new Set(origins)];
}

function parseConfig(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const parsed = widgetConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error("The widget configuration is invalid.");
  return parsed.data as unknown as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const rows = await tx.select().from(widgetKeys).where(eq(widgetKeys.businessId, businessId)).orderBy(desc(widgetKeys.createdAt));
      return { keys: rows.map((row) => serializeWidgetKeyConfig(row)) };
    }));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const body = await readJson(request) as { label?: string; allowedOrigins?: string[]; config?: Record<string, unknown> };
      const allowedOrigins = parseAllowedOrigins(body.allowedOrigins ?? []);
      const config = parseConfig(body.config);
      const keyToken = `wk_live_${randomBytes(24).toString("base64url")}`;
      const [row] = await tx.insert(widgetKeys).values({
        businessId,
        keyHash: hashWidgetKey(keyToken),
        ...(typeof body.label === "string" && body.label.trim() ? { label: body.label.trim().slice(0, 120) } : {}),
        allowedOrigins,
        config,
      }).returning();
      if (!row) throw new Error("A widget key could not be created.");
      return { ok: true, key: { id: row.id, key: keyToken }, record: serializeWidgetKeyConfig(row) };
    }, { minimumRole: "business_admin" }));
  } catch (error) { return asApiResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      if (!id) throw new Error("A widget key id is required.");
      const body = await readJson(request) as { label?: string | null; allowedOrigins?: string[]; config?: Record<string, unknown>; status?: string };
      const existing = (await tx.select({ id: widgetKeys.id }).from(widgetKeys).where(and(eq(widgetKeys.id, id), eq(widgetKeys.businessId, businessId))).limit(1))[0];
      if (!existing) throw new Error("The widget key was not found.");
      const allowedOrigins = body.allowedOrigins !== undefined ? parseAllowedOrigins(body.allowedOrigins) : undefined;
      const config = body.config !== undefined ? parseConfig(body.config) : undefined;
      const status = body.status === "active" || body.status === "disabled" || body.status === "revoked" ? body.status : undefined;
      if (status !== undefined && status !== "active" && status !== "disabled" && status !== "revoked") throw new Error("status is invalid.");
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (status !== undefined) patch.status = status;
      if (allowedOrigins !== undefined) patch.allowedOrigins = allowedOrigins;
      if (config !== undefined) patch.config = config;
      if (body.label !== undefined) patch.label = body.label === null ? null : body.label.trim().slice(0, 120);
      if (Object.keys(patch).length === 1) throw new Error("At least one field is required.");
      const [row] = await tx.update(widgetKeys).set(patch).where(and(eq(widgetKeys.id, id), eq(widgetKeys.businessId, businessId))).returning();
      if (!row) throw new Error("The widget key could not be updated.");
      return { ok: true, record: serializeWidgetKeyConfig(row) };
    }, { minimumRole: "business_admin" }));
  } catch (error) { return asApiResponse(error); }
}
