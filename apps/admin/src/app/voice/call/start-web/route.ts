import { NextRequest } from "next/server";

import { startWebCallRequestSchema } from "@lobbystack/contracts";
import { startVoiceCall } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
import { readRequestBody, verifyInternalRequest } from "@/lib/internal-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const bodyText = await readRequestBody(request);
    const auth = verifyInternalRequest({
      method: request.method,
      path: request.nextUrl.pathname,
      body: bodyText,
      headers: request.headers,
    });
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, { status: auth.status });
    }

    const body = startWebCallRequestSchema.parse(JSON.parse(bodyText));
    const result = await startVoiceCall({
      values: {
        businessId: body.businessSlug,
        twilioCallSid: body.providerCallId,
        from: body.visitorId ?? "web",
        to: body.businessSlug,
        startedAt: body.startedAt,
        gatewaySessionId: body.gatewaySessionId,
      },
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
