import { NextResponse } from "next/server";

import { telnyxUrlSecretMatches } from "@lobbystack/providers/telnyx/webhookSecurity";
import { parseTelnyxTexmlCall } from "@lobbystack/providers/telnyx/webhooks";
import { fallbackForCall } from "@/lib/carrier-webhooks";
import { readSignedTelnyxWebhook } from "@/lib/telnyx-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texml(verb: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${verb}</Response>`, { status: 200, headers: { "content-type": "text/xml" } });
}

/**
 * The TeXML application's voice URL, which Telnyx asks about a call to a
 * number in fallback mode: a trial number out of minutes or an ended trial.
 * It forwards the call where resolveNumberFallback points, or gives a busy
 * signal. Telnyx doesn't say whether it signs this request, so it also
 * accepts the secret in TELNYX_TEXML_WEBHOOK_SECRET as the `key` query
 * parameter.
 */
export async function POST(request: Request) {
  try {
    const { rawBody, signed } = await readSignedTelnyxWebhook(request);
    if (!signed && !telnyxUrlSecretMatches(process.env.TELNYX_TEXML_WEBHOOK_SECRET, new URL(request.url).searchParams.get("key"))) return new NextResponse("Unauthorized", { status: 401 });
    const fallback = await fallbackForCall(parseTelnyxTexmlCall(Object.fromEntries(new URLSearchParams(rawBody))));
    return texml(fallback.action === "forward" ? `<Dial><Number>${fallback.to}</Number></Dial>` : '<Reject reason="busy"/>');
  } catch {
    return new NextResponse("Temporary webhook failure.", { status: 500 });
  }
}
