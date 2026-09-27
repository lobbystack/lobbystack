import { NextResponse } from "next/server";

import { asApiResponse, readJson } from "@/lib/api-helpers";
import { getLiveClient, requireLivePrototype } from "@/lib/live-prototype";
import { publicCallCorsHeaders, verifyLiveSessionEndToken } from "@/lib/live-web-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: publicCallCorsHeaders(request.headers.get("origin")) });
}

/**
 * Ends a browser call whose audio channel never opened, so the browser can't
 * close it the usual way. The caller must present the end token from the start
 * response. The worker records the end when OpenAI reports the session closed.
 */
export async function POST(request: Request) {
  const cors = publicCallCorsHeaders(request.headers.get("origin"));
  try {
    requireLivePrototype();
    const body = await readJson(request);
    const values = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const field = (key: string) => { const value = values[key]; return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : undefined; };
    const sessionId = field("sessionId");
    const endToken = field("endToken");
    if (!sessionId || !endToken) return NextResponse.json({ code: "invalid_request", error: "A sessionId and endToken are required." }, { status: 400, headers: cors });
    if (!verifyLiveSessionEndToken(sessionId, endToken)) return NextResponse.json({ code: "forbidden", error: "That call can't be ended from here." }, { status: 403, headers: cors });
    await getLiveClient().live.sessions.hangup(sessionId).catch(() => undefined);
    return new NextResponse(null, { status: 204, headers: cors });
  } catch (error) {
    const response = asApiResponse(error);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
}
