import { NextResponse } from "next/server";

import { calendlyCodeChallenge } from "@lobbystack/providers";
import { asApiResponse } from "@/lib/api-helpers";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { calendlyCalendarProvider } from "@/lib/calendar-providers";
import { calendarPkceVerifier, createCalendarOAuthState, verifyCalendarConnectLinkToken } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { storeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { requireOperator } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens the link POST /v1/calendars/calendly/connect returns: it asks a
 * signed-out visitor to sign in first, checks they are an owner or admin of
 * the link's business, and sends them to Calendly as the integrations page's
 * Connect button does. Anyone else lands on the integrations page with a
 * message saying so. Nothing changes until they agree there; the callback then
 * connects the account and opens that business.
 */
export async function GET(request: Request) {
  const appUrl = (path: string) => new URL(path, partnerRequestOrigin(request.headers) ?? process.env.APP_BASE_URL ?? request.url);
  const failed = (status = "error") => NextResponse.redirect(appUrl(`/business/connections?calendar=calendly&status=${status}`));
  try {
    const url = new URL(request.url);
    const link = verifyCalendarConnectLinkToken(url.searchParams.get("token") ?? "", "calendly");
    // The membership check reads businessId from the query, so it must be the business the link was signed for.
    if (!link || link.businessId !== url.searchParams.get("businessId")) return failed();
    let operator: { userId: string; businessId: string };
    try {
      const signedIn = await requireOperator(request);
      operator = await signedIn.transaction(async () => ({ userId: signedIn.userId, businessId: signedIn.businessId }), { minimumRole: "business_admin" });
    } catch (error) {
      if (error instanceof Response && error.status === 401) return NextResponse.redirect(appUrl(buildAuthPathWithReturnTo("/login", `${url.pathname}${url.search}`)));
      throw error;
    }
    const rate = await enforceCalendarOAuthRateLimits({ operation: "start", userId: operator.userId, businessId: operator.businessId, ip: trustedClientIp(request) });
    if (!rate.allowed) return failed();
    const state = createCalendarOAuthState({ ...operator, origin: partnerRequestOrigin(request.headers), provider: "calendly" });
    await storeCalendarOAuthState(state, "calendly");
    return NextResponse.redirect(calendlyCalendarProvider().buildAuthorizationUrl({ state, codeChallenge: calendlyCodeChallenge(calendarPkceVerifier(state)) }));
  } catch (error) {
    // Reports unexpected failures, as the callback does.
    return failed(asApiResponse(error).status === 403 ? "not_admin" : "error");
  }
}
