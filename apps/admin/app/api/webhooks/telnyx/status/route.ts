import { NextResponse } from "next/server";

import { parseTelnyxMessagingWebhook } from "@lobbystack/providers/telnyx/webhooks";
import { applyCarrierSmsStatus } from "@/lib/carrier-webhooks";
import { readSignedTelnyxWebhook } from "@/lib/telnyx-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The per-text status webhook. Its query names the row the status belongs to. */
export async function POST(request: Request) {
  try {
    const { rawBody, signed } = await readSignedTelnyxWebhook(request);
    if (!signed) return new NextResponse("Unauthorized", { status: 401 });
    const event = parseTelnyxMessagingWebhook(JSON.parse(rawBody));
    if (event?.kind === "sms.status") await applyCarrierSmsStatus(event, "telnyx", new URL(request.url).searchParams);
    return NextResponse.json({ ok: true });
  } catch {
    // Never acknowledge a status whose update failed, so Telnyx delivers it again.
    return NextResponse.json({ ok: false, error: "Temporary webhook failure." }, { status: 503, headers: { "Retry-After": "60" } });
  }
}
