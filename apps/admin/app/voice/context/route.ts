import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { voiceContextRequestSchema } from "@lobbystack/contracts";
import { recordVoiceSnapshotLoaded } from "@lobbystack/domain";
import { asApiResponse, getAppDatabase, requireInternalService } from "@/lib/api-helpers";
import { loadValidBusinessSnapshot } from "@/lib/business-snapshot";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    await requireInternalService(request, rawBody);
    const body = voiceContextRequestSchema.parse(JSON.parse(rawBody));
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_phone(${body.phoneNumber}) as business_id`);
    const businessId = resolved.rows[0]?.business_id;
    if (!businessId) return new Response("Not found", { status: 404 });
    const snapshot = await loadValidBusinessSnapshot(businessId);
    // This endpoint serves phone calls, which the voice gateway carries over Twilio.
    if (snapshot && body.channel === "voice") {
      await recordVoiceSnapshotLoaded(createWorkerDomainContext(), { businessId, channel: "voice", provider: "twilio" });
    }
    return NextResponse.json({ businessId, snapshot });
  } catch (error) { return asApiResponse(error); }
}
