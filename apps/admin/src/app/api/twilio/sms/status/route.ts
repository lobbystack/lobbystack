import { NextRequest } from "next/server";

import { twilioSmsStatusPayloadSchema } from "@lobbystack/contracts";
import { reconcileSmsStatus } from "@lobbystack/domain/server";

import { errorResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const payload = Object.fromEntries(formData.entries());
    const parsed = twilioSmsStatusPayloadSchema.parse(payload);
    const providerMessageId = parsed.MessageSid ?? parsed.SmsSid;
    if (!providerMessageId) {
      return new Response("Missing message id", { status: 400 });
    }
    await reconcileSmsStatus({
      providerMessageId,
      providerStatus: parsed.MessageStatus,
      providerUpdatedAt: new Date().toISOString(),
    });
    return new Response("OK");
  } catch (error) {
    return errorResponse(error);
  }
}
