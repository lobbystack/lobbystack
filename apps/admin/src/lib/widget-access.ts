import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, widgetKeys, withBusinessTransaction } from "@lobbystack/db";
import type { WidgetConfig, WidgetKeyConfig } from "@lobbystack/shared";

import { getWorkerDatabase, jsonError } from "./api-helpers";
import { hashWidgetKey, isAllowedWidgetOrigin, normalizeOrigin, requestWidgetOrigin, resolveWidgetKeyByHash, serializeWidgetKeyConfig, verifyWidgetSessionToken } from "./widget-keys";

export type WidgetSession = {
  businessId: string;
  widgetKeyId: string;
  keyHash: string;
  origin: string | null;
  key: WidgetKeyConfig;
  businessName: string;
  businessSlug: string;
  defaultLocale: "en" | "fr";
  config: WidgetConfig;
  visitorId?: string;
};

export type WidgetAccessSuccess = { ok: true; session: WidgetSession };
export type WidgetAccessFailure = { ok: false; response: NextResponse };
export type WidgetAccessResult = WidgetAccessSuccess | WidgetAccessFailure;

export async function resolveWidgetAccess(request: Request, key: string | null | undefined, options: { requireOrigin?: boolean; strictOrigin?: boolean } = {}): Promise<WidgetAccessResult> {
  if (!key) return { ok: false, response: jsonError("A widget key is required.", 401, "widget_key_required") };
  const keyHash = hashWidgetKey(key);
  const resolved = await resolveWidgetKeyByHash(keyHash);
  if (!resolved) return { ok: false, response: jsonError("The widget key is invalid or inactive.", 404, "widget_key_invalid") };
  const origin = requestWidgetOrigin(request);
  const session = await withBusinessTransaction(getWorkerDatabase().db, { businessId: resolved.businessId, actorType: "worker" }, async (tx) => {
    const [keyRow, business] = await Promise.all([
      tx.select().from(widgetKeys).where(eq(widgetKeys.id, resolved.widgetKeyId)).limit(1).then((rows) => rows[0]),
      tx.select({ name: businesses.name, slug: businesses.slug, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, resolved.businessId)).limit(1).then((rows) => rows[0]),
    ]);
    if (!keyRow) return null;
    const key = serializeWidgetKeyConfig(keyRow as unknown as Parameters<typeof serializeWidgetKeyConfig>[0]);
    return {
      businessId: resolved.businessId,
      widgetKeyId: resolved.widgetKeyId,
      keyHash,
      origin,
      key,
      config: key.config as WidgetConfig,
      businessName: business?.name ?? "",
      businessSlug: business?.slug ?? "",
      defaultLocale: (business?.defaultLocale === "fr" ? "fr" : "en") as "en" | "fr",
    };
  });
  if (!session) return { ok: false, response: jsonError("The widget key is invalid or inactive.", 404, "widget_key_invalid") };
  if (session.key.status !== "active") return { ok: false, response: jsonError("The widget is disabled.", 403, "widget_disabled") };
  if (options.requireOrigin && origin === null) {
    return { ok: false, response: jsonError("A browser origin is required to load this widget.", 403, "widget_origin_required") };
  }
  if (origin !== null && !isAllowedWidgetOrigin(origin, session.key.allowedOrigins, options.strictOrigin ? { allowAdminOrigin: false, allowLocalhost: false } : {})) {
    return { ok: false, response: jsonError("This website is not authorized to load this widget.", 403, "widget_origin_denied") };
  }
  return { ok: true, session };
}

export async function resolveWidgetSessionAccess(request: Request): Promise<WidgetAccessResult> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const payload = verifyWidgetSessionToken(token);
  if (!payload) return { ok: false, response: jsonError("The widget session is invalid or expired.", 401, "widget_session_invalid") };
  const parentOrigin = request.headers.get("x-widget-parent-origin");
  if (!parentOrigin || normalizeOrigin(parentOrigin) !== payload.origin) {
    return { ok: false, response: jsonError("The widget session origin is invalid.", 403, "widget_origin_denied") };
  }
  const session = await withBusinessTransaction(getWorkerDatabase().db, { businessId: payload.businessId, actorType: "worker" }, async (tx) => {
    const [keyRow, business] = await Promise.all([
      tx.select().from(widgetKeys).where(and(eq(widgetKeys.id, payload.widgetKeyId), eq(widgetKeys.businessId, payload.businessId))).limit(1).then((rows) => rows[0]),
      tx.select({ name: businesses.name, slug: businesses.slug, defaultLocale: businesses.defaultLocale }).from(businesses).where(eq(businesses.id, payload.businessId)).limit(1).then((rows) => rows[0]),
    ]);
    if (!keyRow) return null;
    const key = serializeWidgetKeyConfig(keyRow as unknown as Parameters<typeof serializeWidgetKeyConfig>[0]);
    return {
      businessId: payload.businessId,
      widgetKeyId: payload.widgetKeyId,
      keyHash: "",
      origin: payload.origin,
      key,
      config: key.config as WidgetConfig,
      visitorId: payload.visitorId,
      businessName: business?.name ?? "",
      businessSlug: business?.slug ?? "",
      defaultLocale: (business?.defaultLocale === "fr" ? "fr" : "en") as "en" | "fr",
    };
  });
  if (!session) return { ok: false, response: jsonError("The widget session is invalid.", 401, "widget_session_invalid") };
  if (session.key.status !== "active") return { ok: false, response: jsonError("The widget is disabled.", 403, "widget_disabled") };
  if (!isAllowedWidgetOrigin(payload.origin, session.key.allowedOrigins, { allowAdminOrigin: false, allowLocalhost: false })) {
    return { ok: false, response: jsonError("This website is not authorized to load this widget.", 403, "widget_origin_denied") };
  }
  return { ok: true, session };
}
