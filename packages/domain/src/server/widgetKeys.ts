import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { widgetKeys, type DatabaseTransaction } from "@lobbystack/db";

// Website chat widget keys. A key is public, since the widget's script tag
// carries it. Its hash finds the business, and the key itself is kept so the
// dashboard can show the script tag again.

export type WidgetKeyRow = typeof widgetKeys.$inferSelect;
export type WidgetKeyStatus = "active" | "disabled" | "revoked";
export type WidgetKeyPatch = { label?: string | null; allowedOrigins?: string[]; config?: Record<string, unknown>; status?: WidgetKeyStatus };

export function hashWidgetKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/** Creates a widget key and returns it with the key itself. */
export async function insertWidgetKeyInTransaction(tx: DatabaseTransaction, input: { businessId: string; label?: string | undefined; allowedOrigins: string[]; config: Record<string, unknown> }): Promise<{ row: WidgetKeyRow; key: string }> {
  const key = `wk_live_${randomBytes(24).toString("base64url")}`;
  const [row] = await tx.insert(widgetKeys).values({
    businessId: input.businessId,
    keyHash: hashWidgetKey(key),
    keyValue: key,
    ...(input.label ? { label: input.label } : {}),
    allowedOrigins: input.allowedOrigins,
    config: input.config,
  }).returning();
  if (!row) throw new Error("A widget key could not be created.");
  return { row, key };
}

/** Changes the fields in the patch. Null when the business has no such key. */
export async function updateWidgetKeyInTransaction(tx: DatabaseTransaction, input: { businessId: string; widgetKeyId: string; patch: WidgetKeyPatch }): Promise<WidgetKeyRow | null> {
  const [row] = await tx.update(widgetKeys).set({ ...input.patch, updatedAt: new Date() }).where(and(eq(widgetKeys.id, input.widgetKeyId), eq(widgetKeys.businessId, input.businessId))).returning();
  return row ?? null;
}
