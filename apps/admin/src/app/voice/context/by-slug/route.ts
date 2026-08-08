import { NextRequest } from "next/server";

import { voiceContextBySlugRequestSchema } from "@lobbystack/contracts";

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

    const body = voiceContextBySlugRequestSchema.parse(JSON.parse(bodyText));
    return jsonResponse({
      businessSlug: body.businessSlug,
      snapshot: null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
