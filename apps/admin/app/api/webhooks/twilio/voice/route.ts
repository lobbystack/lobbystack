import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { resolveNumberFallback } from "@lobbystack/domain";
import { resolveTwilioWebhookUrl, validateTwilioSignature } from "@lobbystack/providers/twilio/webhookSecurity";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function twiml(verb: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${verb}</Response>`, { status: 200, headers: { "content-type": "text/xml" } });
}

/**
 * Twilio asks here what to do with a call to a number that's off the SIP
 * trunk. A trial out of minutes forwards the call to the owner, with the
 * caller's own caller ID; any other call goes unanswered.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    // Trial numbers belong to the main account, which signs with its auth token.
    const authToken = request.headers.get("x-twilio-signature-key-sid") ? undefined : process.env.TWILIO_AUTH_TOKEN;
    const publicUrl = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/twilio/voice` : undefined;
    if (!validateTwilioSignature({ authToken, signatureHeader: request.headers.get("x-twilio-signature"), url: resolveTwilioWebhookUrl(request.url, publicUrl), params })) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const to = params.To ?? "";
    const businessId = (await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${to}) as business_id`)).rows[0]?.business_id;
    if (!businessId) return twiml('<Reject reason="busy"/>');
    const fallback = await resolveNumberFallback(createWorkerDomainContext(), { businessId, e164: to });
    if (fallback.action === "forward" && E164_PATTERN.test(fallback.to)) return twiml(`<Dial>${fallback.to}</Dial>`);
    return twiml('<Reject reason="busy"/>');
  } catch {
    return new NextResponse("Temporary webhook failure.", { status: 500 });
  }
}
