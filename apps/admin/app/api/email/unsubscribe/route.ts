import { NextResponse, type NextRequest } from "next/server";

import { setMarketingEmailsSubscribedWithToken } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { enforceEmailUnsubscribeRateLimits } from "@/lib/email-unsubscribe-limit";
import { negotiateLocale } from "@/lib/locale-request";

export const dynamic = "force-dynamic";

function tokenOf(request: NextRequest): string {
  return request.nextUrl.searchParams.get("token") ?? "";
}

/**
 * The one-click unsubscribe a marketing email's List-Unsubscribe header names
 * (RFC 8058). Mail apps POST `List-Unsubscribe=One-Click` here with no cookies
 * and no Origin, so the proxy exempts this exact path from its CSRF check; the
 * signed token is the only credential. The unsubscribe page's button posts
 * here too. Unsubscribing again answers the same.
 */
export async function POST(request: NextRequest) {
  const token = tokenOf(request);
  const rate = await enforceEmailUnsubscribeRateLimits(request, token);
  if (!rate.allowed) return jsonError(rate.status === 429 ? "Too many requests. Try again later." : "Unsubscribing is unavailable right now.", rate.status);
  const result = await setMarketingEmailsSubscribedWithToken(getAuthDatabase().db, { token, subscribed: false });
  if (!result) return jsonError("This link isn't valid.", 400);
  return NextResponse.json(result);
}

/**
 * A mail app without one-click support opens the header's URL instead. Opening
 * a link never unsubscribes, since scanners open them too, so this sends the
 * person to the page with the button.
 */
export function GET(request: NextRequest) {
  const locale = negotiateLocale({ query: null, cookie: null, acceptLanguage: request.headers.get("accept-language") }).locale;
  // The link is on the host's domain: the proxy answers it nowhere else.
  return NextResponse.redirect(new URL(`/${locale}/unsubscribe/${encodeURIComponent(tokenOf(request))}`, process.env.APP_BASE_URL ?? request.url), 303);
}
