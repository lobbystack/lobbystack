import { NextResponse } from "next/server";

import { asApiResponse } from "@/lib/api-helpers";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { createCalendarOAuthState, verifyCalendarConnectLinkToken } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { storeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { googleCalendarProvider } from "@/lib/google-calendar-provider";
import { requireOperator } from "@/lib/operator-request";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opens the link POST /v1/calendars/google/connect returns: it asks a
 * signed-out visitor to sign in first, checks they are an owner or admin of
 * the link's business, and sends them to Google as the integrations page's
 * Connect button does. Nothing changes until they agree there; the callback
 * then connects the calendar and opens that business. A partner's business
 * gets its link on the partner's domain, the only one it opens on, so sign-in,
 * errors and Google's callback stay on the domain the link was opened on.
 */
export async function GET(request: Request) {
  const appUrl = (path: string) => new URL(path, partnerRequestOrigin(request.headers) ?? process.env.APP_BASE_URL ?? request.url);
  const failed = () => NextResponse.redirect(appUrl("/integrations?calendar=google&status=error"));
  try {
    const url = new URL(request.url);
    const link = verifyCalendarConnectLinkToken(url.searchParams.get("token") ?? "");
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
    const state = createCalendarOAuthState({ ...operator, origin: partnerRequestOrigin(request.headers) });
    await storeCalendarOAuthState(state);
    return NextResponse.redirect(googleCalendarProvider().buildAuthorizationUrl({ state }));
  } catch (error) {
    asApiResponse(error); // Reports unexpected failures, as the callback does.
    return failed();
  }
}
