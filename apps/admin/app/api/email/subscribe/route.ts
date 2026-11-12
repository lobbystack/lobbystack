import { NextResponse, type NextRequest } from "next/server";

import { setMarketingEmailsSubscribedWithToken } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { enforceEmailUnsubscribeRateLimits } from "@/lib/email-unsubscribe-limit";

export const dynamic = "force-dynamic";

/**
 * Turns marketing emails back on from the unsubscribe page, signed out. The
 * signed token is the credential, and only the page itself calls this, so it
 * keeps the proxy's CSRF check.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const rate = await enforceEmailUnsubscribeRateLimits(request, token);
  if (!rate.allowed) return jsonError(rate.status === 429 ? "Too many requests. Try again later." : "Resubscribing is unavailable right now.", rate.status);
  const result = await setMarketingEmailsSubscribedWithToken(getAuthDatabase().db, { token, subscribed: true });
  if (!result) return jsonError("This link isn't valid.", 400);
  return NextResponse.json(result);
}
