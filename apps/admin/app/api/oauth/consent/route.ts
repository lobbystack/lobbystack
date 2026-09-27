import { NextResponse } from "next/server";

import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { ConsentError, decideConsent } from "@/lib/oauth-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The consent screen posts here. The response names the URL to send the browser to. */
export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request) as { oauth_query?: unknown; accept?: unknown; business_id?: unknown; scopes?: unknown };
    if (typeof body.oauth_query !== "string" || !body.oauth_query) return NextResponse.json({ error: "The authorization request is missing.", code: "invalid_request" }, { status: 400 });
    const url = await decideConsent({
      userId: session.user.id,
      headers: request.headers,
      decision: {
        oauthQuery: body.oauth_query,
        accept: body.accept === true,
        businessId: typeof body.business_id === "string" ? body.business_id : undefined,
        scopes: Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string") : undefined,
      },
    });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConsentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    // Better Auth rejects an expired or tampered authorization request with a 4xx APIError.
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      const detail = (error as { body?: { error?: unknown; error_description?: unknown } }).body;
      console.warn(JSON.stringify({ event: "oauth.consent_rejected", status: statusCode, error: detail?.error ?? null, description: detail?.error_description ?? null }));
    }
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) return NextResponse.json({ error: "This authorization request expired or is invalid. Start again from the app.", code: "invalid_request" }, { status: 400 });
    return asApiResponse(error);
  }
}
