import { NextResponse } from "next/server";

import { GoogleCalendarProvider } from "@lobbystack/providers";
import { asApiResponse, businessIdFromRequest, jsonError, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { storeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function provider(): GoogleCalendarProvider {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Google Calendar OAuth is not configured.");
  return new GoogleCalendarProvider({ clientId, clientSecret, redirectUri });
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });
    await withOperatorTransaction(request, async () => undefined, { minimumRole: "business_admin" });
    // Authenticate and confirm membership before consuming any rate-limit
    // quota, then bound state creation per operator, business, and trusted IP.
    const rate = await enforceCalendarOAuthRateLimits(
      { operation: "start", userId: session.user.id, businessId, ip: trustedClientIp(request) },
      { consume: true },
    );
    if (!rate.allowed) return jsonError("Too many calendar authorization attempts. Please try again later.", rate.status, rate.code);
    const state = createCalendarOAuthState({ userId: session.user.id, businessId });
    await storeCalendarOAuthState(state);
    return NextResponse.json({ url: provider().buildAuthorizationUrl({ state }) });
  } catch (error) {
    return asApiResponse(error);
  }
}
