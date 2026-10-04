import { NextResponse } from "next/server";

import { asApiResponse, jsonError, withOperatorTransaction } from "@/lib/api-helpers";
import { createCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { storeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { googleCalendarProvider } from "@/lib/google-calendar-provider";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { session, businessId } = await withOperatorTransaction(request, async ({ session, businessId }) => ({ session, businessId }), { minimumRole: "business_admin" });
    // Authenticate and confirm membership before consuming any rate-limit
    // quota, then bound state creation per operator, business, and trusted IP.
    const rate = await enforceCalendarOAuthRateLimits(
      { operation: "start", userId: session.user.id, businessId, ip: trustedClientIp(request) },
    );
    if (!rate.allowed) return jsonError("Too many calendar authorization attempts. Please try again later.", rate.status, rate.code);
    const state = createCalendarOAuthState({ userId: session.user.id, businessId });
    await storeCalendarOAuthState(state);
    return NextResponse.json({ url: googleCalendarProvider().buildAuthorizationUrl({ state }) });
  } catch (error) {
    return asApiResponse(error);
  }
}
