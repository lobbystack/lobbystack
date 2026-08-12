import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { snapshotSchema, voiceContextRequestSchema } from "@lobbystack/contracts";
import { businessContextSnapshots, withBusinessTransaction } from "@lobbystack/db";
import { asApiResponse, getAppDatabase, getWorkerDatabase, requireInternalService } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    await requireInternalService(request, rawBody);
    const body = voiceContextRequestSchema.parse(JSON.parse(rawBody));
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_phone(${body.phoneNumber}) as business_id`);
    const businessId = resolved.rows[0]?.business_id;
    if (!businessId) return new Response("Not found", { status: 404 });
    return NextResponse.json(await withBusinessTransaction(getWorkerDatabase().db, { businessId, actorType: "worker" }, async (tx) => {
      const rows = await tx.select().from(businessContextSnapshots).where(eq(businessContextSnapshots.businessId, businessId)).orderBy(desc(businessContextSnapshots.generatedAt)).limit(1);
      const snapshot = rows[0]?.snapshot;
      if (!snapshot) return { businessId, snapshot: null };
      return { businessId, snapshot: snapshotSchema.parse(snapshot) };
    }));
  } catch (error) { return asApiResponse(error); }
}
