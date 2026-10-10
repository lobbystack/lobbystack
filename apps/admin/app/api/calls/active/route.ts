import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { calls } from "@lobbystack/db";

import { operatorRoute } from "@/lib/operator-request";
import { countActiveVoiceCalls, getVoicePresenceCallIds, removeCompletedVoicePresence } from "@/lib/voice-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ businessId, transaction }) => NextResponse.json(await transaction(async (tx) => {
  const ids = await getVoicePresenceCallIds(businessId);
  if (ids.length) {
    const completed = await tx.select({ id: calls.id }).from(calls).where(and(
      eq(calls.businessId, businessId), inArray(calls.id, ids), isNotNull(calls.endedAt),
    ));
    await Promise.all(completed.map(({ id }) => removeCompletedVoicePresence({ businessId, callId: id })));
  }
  return { active: await countActiveVoiceCalls(businessId) };
})));
