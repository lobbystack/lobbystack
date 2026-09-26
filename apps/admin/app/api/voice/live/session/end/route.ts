import { NextResponse } from "next/server";

import { asApiResponse, readJson } from "@/lib/api-helpers";
import { getLiveClient, requireLivePrototype } from "@/lib/live-prototype";
import { publicCallCorsHeaders } from "@/lib/live-web-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: publicCallCorsHeaders(request.headers.get("origin")) });
}

/**
 * Ends a browser call the caller abandoned before it connected, so the browser
 * never opened the channel it would close it on. Only the browser that started
 * the call knows the session ID. The worker records the end when OpenAI
 * reports the session closed.
 */
export async function POST(request: Request) {
  const cors = publicCallCorsHeaders(request.headers.get("origin"));
  try {
    requireLivePrototype();
    const body = await readJson(request);
    const sessionId = body && typeof body === "object" && "sessionId" in body && typeof body.sessionId === "string" && body.sessionId.length <= 128 ? body.sessionId : undefined;
    if (!sessionId) return NextResponse.json({ code: "invalid_request", error: "A sessionId is required." }, { status: 400, headers: cors });
    await getLiveClient().live.sessions.hangup(sessionId).catch(() => undefined);
    return new NextResponse(null, { status: 204, headers: cors });
  } catch (error) {
    const response = asApiResponse(error);
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  }
}
