import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { calls } from "@lobbystack/db";

import { asApiResponse, withOperatorTransaction } from "@/lib/api-helpers";
import { countActiveVoiceCalls, getVoicePresenceCallIds, removeCompletedVoicePresence } from "@/lib/voice-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await withOperatorTransaction(request, async ({ businessId, tx }) => {
      const ids = await getVoicePresenceCallIds(businessId);
      if (ids.length) {
        const completed = await tx.select({ id: calls.id }).from(calls).where(and(
          eq(calls.businessId, businessId), inArray(calls.id, ids), isNotNull(calls.endedAt),
        ));
        await Promise.all(completed.map(({ id }) => removeCompletedVoicePresence({ businessId, callId: id })));
      }
      return { active: await countActiveVoiceCalls(businessId) };
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
