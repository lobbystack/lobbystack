import { NextRequest } from "next/server";

import { twilioSmsInboundPayloadSchema } from "@lobbystack/contracts";
import { recordInboundSms } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries());
    const parsed = twilioSmsInboundPayloadSchema.parse(payload);
    await recordInboundSms({
      to: parsed.To,
      from: parsed.From,
      body: parsed.Body,
      ...(parsed.MessageSid ?? parsed.SmsSid
        ? { providerMessageId: parsed.MessageSid ?? parsed.SmsSid }
        : {}),
      ...(parsed.OptOutType ? { optOutType: parsed.OptOutType } : {}),
    });
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
