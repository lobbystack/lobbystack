import { NextRequest } from "next/server";

import { completeCallRequestSchema } from "@lobbystack/contracts";
import { completeVoiceCall, resolveBusinessByCallId } from "@lobbystack/domain/server";

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

    const body = completeCallRequestSchema.parse(JSON.parse(bodyText));
    const businessId = await resolveBusinessByCallId({ callId: body.callId });
    if (!businessId) {
      return jsonResponse({ error: "Call not found" }, { status: 404 });
    }
    const result = await completeVoiceCall({ businessId, values: body });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
