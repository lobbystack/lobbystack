import { NextResponse } from "next/server";

import { parseTelnyxMessagingWebhook } from "@lobbystack/providers/telnyx/webhooks";
import { applyCarrierSmsStatus, receiveCarrierSms } from "@/lib/carrier-webhooks";
import { getTelephony } from "@/lib/telephony";
import { readSignedTelnyxWebhook } from "@/lib/telnyx-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The messaging profile's webhook: texts to a Telnyx number, and the status
 * of a text sent without its own status URL. Telnyx can't take a reply in the
 * response, so a reply from the shared sender goes out through the API.
 */
export async function POST(request: Request) {
  try {
    const { rawBody, signed } = await readSignedTelnyxWebhook(request);
    if (!signed) return new NextResponse("Unauthorized", { status: 401 });
    const event = parseTelnyxMessagingWebhook(JSON.parse(rawBody));
    if (event?.kind === "sms.status") await applyCarrierSmsStatus(event, "telnyx", new URL(request.url).searchParams);
    if (event?.kind === "sms.received") {
      const { reply } = await receiveCarrierSms(event, "telnyx");
      const alert = getTelephony().alertSms;
      if (reply && alert?.from === event.to) await alert.sendSms({ from: event.to, to: event.from, body: reply });
    }
    return NextResponse.json({ ok: true });
  } catch {
    // Telnyx retries a webhook that doesn't answer 2xx, then tries the failover URL.
    return NextResponse.json({ ok: false, error: "Temporary webhook failure." }, { status: 503 });
  }
}
