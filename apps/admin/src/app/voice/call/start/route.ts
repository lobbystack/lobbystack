import { NextRequest } from "next/server";

import { startVoiceCallRequestSchema } from "@lobbystack/contracts";
import { startVoiceCall } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
import { readRequestBody, verifyInternalRequest } from "@/lib/internal-auth";

export const runtime = "nodejs";

async function authorize(request: NextRequest, bodyText: string) {
  const auth = verifyInternalRequest({
    method: request.method,
    path: request.nextUrl.pathname,
    body: bodyText,
    headers: request.headers,
  });
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, { status: auth.status });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await readRequestBody(request);
    const unauthorized = await authorize(request, bodyText);
    if (unauthorized) {
      return unauthorized;
    }

    const body = startVoiceCallRequestSchema.parse(JSON.parse(bodyText));
    const result = await startVoiceCall({ values: body });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
