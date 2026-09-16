import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { twilioSmsInboundSchema } from "@lobbystack/contracts";
import { receiveInboundSms } from "@lobbystack/domain";
import { normalizeTwilioFormFields, resolveTwilioWebhookUrl, validateTwilioSignature } from "@lobbystack/shared";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twiml(): NextResponse {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { status: 200, headers: { "content-type": "text/xml" } });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = normalizeTwilioFormFields(new URLSearchParams(rawBody));
    const valid = await validateTwilioSignature({ authToken: process.env.TWILIO_AUTH_TOKEN, signatureHeader: request.headers.get("x-twilio-signature"), url: resolveTwilioWebhookUrl(request.url, process.env.TWILIO_SMS_WEBHOOK_URL), params });
    if (!valid) return new NextResponse("Unauthorized", { status: 401 });
    const body = twilioSmsInboundSchema.parse(params);
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_phone(${body.To}) as business_id`);
    const businessId = resolved.rows[0]?.business_id;
    if (!businessId) return twiml();
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
