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
 * Twilio asks here what to do with a call the receptionist won't answer: a
 * call to a number that's off the SIP trunk, or, as the trunk's disaster
 * recovery URL, a call GPT-Live refused because the plan is out of minutes.
 * resolveNumberFallback picks where to forward it, with the caller's own
 * caller ID; a call with nowhere to go gets a busy signal.
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
    // A trunk failover may address the call to the trunk's SIP URI rather than
    // the dialled number, so try each number Twilio sends, in this order.
    const dialled = [...new Set([params.To, params.Called].filter((phone): phone is string => Boolean(phone && E164_PATTERN.test(phone))))];
    let routed: { businessId: string; to: string } | undefined;
    for (const to of dialled) {
      const businessId = (await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${to}) as business_id`)).rows[0]?.business_id;
      if (businessId) { routed = { businessId, to }; break; }
    }
    if (!routed) return twiml('<Reject reason="busy"/>');
    const fallback = await resolveNumberFallback(createWorkerDomainContext(), { businessId: routed.businessId, e164: routed.to });
    // A line that forwards its missed calls here would send this call straight back.
    if (fallback.action === "forward" && E164_PATTERN.test(fallback.to) && fallback.to !== params.ForwardedFrom) return twiml(`<Dial>${fallback.to}</Dial>`);
    return twiml('<Reject reason="busy"/>');
  } catch {
    return new NextResponse("Temporary webhook failure.", { status: 500 });
  }
}
