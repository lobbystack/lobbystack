import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { businesses, widgetKeys, withBusinessTransaction } from "@lobbystack/db";
import type { WidgetConfig, WidgetKeyConfig } from "@lobbystack/shared";

import { getWorkerDatabase, jsonError } from "./api-helpers";
import { hashWidgetKey, isAllowedWidgetOrigin, requestWidgetOrigin, resolveWidgetKeyByHash, serializeWidgetKeyConfig } from "./widget-keys";

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
};

export type WidgetAccessSuccess = { ok: true; session: WidgetSession };
export type WidgetAccessFailure = { ok: false; response: NextResponse };
export type WidgetAccessResult = WidgetAccessSuccess | WidgetAccessFailure;

export async function resolveWidgetAccess(request: Request, key: string | null | undefined): Promise<WidgetAccessResult> {
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
  if (session.key.status === "disabled") return { ok: false, response: jsonError("The widget is disabled.", 403, "widget_disabled") };
  if (origin !== null && !isAllowedWidgetOrigin(origin, session.key.allowedOrigins)) {
    return { ok: false, response: jsonError("This website is not authorized to load this widget.", 403, "widget_origin_denied") };
  }
  return { ok: true, session };
}
