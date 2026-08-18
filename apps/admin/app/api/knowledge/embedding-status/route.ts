import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { knowledgeChunks } from "@lobbystack/db";
import { createEmbeddingProvider } from "@lobbystack/providers";

import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const fingerprint = createEmbeddingProvider()?.fingerprint ?? null;
      const [total, matching, failed, missing] = await Promise.all([
        tx.select({ count: count() }).from(knowledgeChunks).where(eq(knowledgeChunks.businessId, businessId)),
        fingerprint ? tx.select({ count: count() }).from(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, businessId), eq(knowledgeChunks.embeddingFingerprint, fingerprint), eq(knowledgeChunks.embeddingStatus, "completed"))) : Promise.resolve([{ count: 0 }]),
        tx.select({ count: count() }).from(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, businessId), eq(knowledgeChunks.embeddingStatus, "failed"))),
        tx.select({ count: count() }).from(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, businessId), isNull(knowledgeChunks.embeddingFingerprint))),
      ]);
      const totalCount = Number(total[0]?.count ?? 0);
      const matchingCount = Number(matching[0]?.count ?? 0);
      const failedCount = Number(failed[0]?.count ?? 0);
      return { fingerprint, total: totalCount, matching: matchingCount, completed: matchingCount, pending: Math.max(0, totalCount - matchingCount - failedCount), failed: failedCount, missing: Number(missing[0]?.count ?? 0) };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
