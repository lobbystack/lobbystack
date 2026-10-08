import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { twilioSmsInboundSchema } from "@lobbystack/contracts";
import { isSharedSmsSender, receiveInboundSms, receiveSharedSenderSms } from "@lobbystack/domain";
import { resolveTwilioWebhookUrl, validateTwilioSignature } from "@lobbystack/providers/twilio/webhookSecurity";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** TwiML for Twilio, with a reply text when there is one. */
function twiml(reply?: string | null): NextResponse {
  const message = reply ? `<Message>${escapeXml(reply)}</Message>` : "";
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${message}</Response>`, { status: 200, headers: { "content-type": "text/xml" } });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const valid = validateTwilioSignature({ authToken: process.env.TWILIO_AUTH_TOKEN, signatureHeader: request.headers.get("x-twilio-signature"), url: resolveTwilioWebhookUrl(request.url, process.env.TWILIO_SMS_WEBHOOK_URL), params });
    if (!valid) return new NextResponse("Unauthorized", { status: 401 });
    const body = twilioSmsInboundSchema.parse(params);
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_phone(${body.To}) as business_id`);
    const businessId = resolved.rows[0]?.business_id;
    if (!businessId) {
      // The shared sender texts for every cloud business and belongs to none.
      // It answers STOP, START and HELP, and the reply goes out from it.
      if (!isSharedSmsSender(body.To)) return twiml();
      const { reply } = await receiveSharedSenderSms(createWorkerDomainContext(), { from: body.From, body: body.Body, ...(body.OptOutType ? { optOutType: body.OptOutType } : {}) });
      return twiml(reply);
    }
    const providerMessageId = body.MessageSid ?? body.SmsSid;
    if (!providerMessageId) return twiml();
    await receiveInboundSms(createWorkerDomainContext(), {
      businessId,
      providerMessageId,
      from: body.From,
      to: body.To,
      body: body.Body,
      payload: { From: body.From, To: body.To, Body: body.Body, MessageSid: providerMessageId, ...(body.NumMedia !== undefined ? { NumMedia: body.NumMedia } : {}), ...(body.OptOutType ? { OptOutType: body.OptOutType } : {}) },
    });
    return twiml();
  } catch {
    return new NextResponse("Temporary webhook failure.", { status: 500 });
  }
}
