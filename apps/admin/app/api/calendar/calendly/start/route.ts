import { NextResponse } from "next/server";

import { calendlyCodeChallenge } from "@lobbystack/providers";
import { jsonError } from "@/lib/api-helpers";
import { calendlyCalendarProvider } from "@/lib/calendar-providers";
import { calendarPkceVerifier, createCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { storeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { operatorRoute } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, transaction }) => {
  await transaction(async () => undefined, { minimumRole: "business_admin" });
  // Authenticate and confirm membership before consuming any rate-limit
  // quota, then bound state creation per operator, business, and trusted IP.
  const rate = await enforceCalendarOAuthRateLimits(
    { operation: "start", userId, businessId, ip: trustedClientIp(request) },
  );
  if (!rate.allowed) return jsonError("Too many calendar authorization attempts. Please try again later.", rate.status, rate.code);
  // Calendly returns to the host's domain, which hands the callback back to a partner's host it started on.
  const state = createCalendarOAuthState({ userId, businessId, origin: partnerRequestOrigin(request.headers), provider: "calendly" });
  await storeCalendarOAuthState(state, "calendly");
  return NextResponse.json({ url: calendlyCalendarProvider().buildAuthorizationUrl({ state, codeChallenge: calendlyCodeChallenge(calendarPkceVerifier(state)) }) });
});
