import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { prospectDemos, withBusinessTransaction } from "@lobbystack/db";
import { getAppDatabase, getWorkerDatabase } from "./api-helpers";

type WebVoiceAccess =
  | { allowed: true; businessId: string; mode: "normal" }
  | { allowed: true; businessId: string; mode: "prospect_demo"; prospectDemoId: string }
  | { allowed: false; status: 403 | 404; reason: "invalid" | "mismatch" | "not_found" | "token_required" };

export function hashProspectDemoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveWebVoiceAccess(input: {
  businessSlug: string;
  prospectDemoToken?: string | undefined;
}): Promise<WebVoiceAccess> {
  const slugResult = await getAppDatabase().db.execute<{ business_id: string }>(
    sql`select app.resolve_business_by_slug(${input.businessSlug}) as business_id`,
  );
  const businessId = slugResult.rows[0]?.business_id;
  if (!businessId) return { allowed: false, status: 404, reason: "not_found" };

  if (input.prospectDemoToken) {
    const tokenHash = hashProspectDemoToken(input.prospectDemoToken.trim());
    const tokenResult = await getAppDatabase().db.execute<{ business_id: string; prospect_demo_id: string }>(
      sql`select business_id, prospect_demo_id from app.resolve_business_by_demo_token(${tokenHash})`,
    );
    const demo = tokenResult.rows[0];
    if (!demo) return { allowed: false, status: 403, reason: "invalid" };
    if (demo.business_id !== businessId) return { allowed: false, status: 403, reason: "mismatch" };
    return { allowed: true, businessId, mode: "prospect_demo", prospectDemoId: demo.prospect_demo_id };
  }

  const demo = await withBusinessTransaction(
    getWorkerDatabase().db,
    { businessId, actorType: "worker" },
    async (tx) => (await tx.select({ status: prospectDemos.status }).from(prospectDemos).where(eq(prospectDemos.businessId, businessId)).limit(1))[0],
  );
  if (demo && demo.status !== "claimed") {
    return { allowed: false, status: 403, reason: "token_required" };
  }

  return { allowed: true, businessId, mode: "normal" };
}
