import { NextResponse } from "next/server";

import { connectCalendar, switchWorkspace } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import { assertCertificationRecipient } from "@lobbystack/shared";
import { asApiResponse, jsonError, requireApiSession } from "@/lib/api-helpers";
import { calendlyCalendarProvider } from "@/lib/calendar-providers";
import { createDomainContext } from "@/lib/domain-context";
import { calendarPkceVerifier, verifyCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { consumeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { routeOAuthCallback } from "@/lib/oauth-callback-host";
import { partnerRequestOrigin, requestBrandScope } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // A connection started on a partner's host finishes there, and lands on that host's integrations page.
  const origin = partnerRequestOrigin(request.headers) ?? process.env.APP_BASE_URL ?? request.url;
  const destination = (status: "success" | "error") => NextResponse.redirect(new URL(`/workspace/connections?calendar=calendly&status=${status}`, origin));
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    // Unauthenticated entry: bound cheap abuse (forged/replayed states) by the
    // trusted client IP before any state, session, or provider work runs.
    const entryRate = await enforceCalendarOAuthRateLimits(
      { operation: "callback", ip: trustedClientIp(request) },
    );
    if (!entryRate.allowed) return jsonError("Too many calendar authorization requests. Please try again later.", entryRate.status, entryRate.code);
    if (!state) return jsonError("Calendly OAuth state is required.", 400);
    const verified = verifyCalendarOAuthState(state, "calendly");
    if (!verified) return jsonError("Calendly OAuth state is invalid or expired.", 400);
    // Calendly returns to the host's domain. A connection started on a
    // partner's host goes back there before anything is used up, since the
    // person's session lives on that host.
    const route = await routeOAuthCallback(request, verified.origin ?? null).catch((error: unknown) => asApiResponse(error));
    if (route instanceof Response) return route;
    if (route.kind === "handoff") return NextResponse.redirect(route.url);
    if (route.kind === "refused") return jsonError("Calendly OAuth state belongs to another domain.", 400);
    const session = await requireApiSession(request);
    if (session.user.id !== verified.userId) return jsonError("Calendly OAuth state belongs to another user.", 403);
    // Authenticated dimensions, counted once per request, before consumption or
    // the provider exchange.
    const identityRate = await enforceCalendarOAuthRateLimits(
      { operation: "callback", userId: verified.userId, businessId: verified.businessId },
    );
    if (!identityRate.allowed) return jsonError("Too many calendar authorization requests. Please try again later.", identityRate.status, identityRate.code);
    if (!await consumeCalendarOAuthState(state, verified.userId, verified.businessId, "calendly")) return jsonError("Calendly OAuth state has already been used or expired.", 400);
    if (!code || url.searchParams.has("error")) return destination("error");
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Calendar token encryption is not configured.");
    const provider = calendlyCalendarProvider();
    const tokens = await provider.exchangeCode(code, calendarPkceVerifier(state));
    const account = await provider.getAccount({ accessToken: tokens.accessToken });
    assertCertificationRecipient("email", account.email ?? "");
    // Connecting queues a sync, which registers the booking webhook with the stored token. A Free account connects
    // too: the dashboard then says why it can't book, which beats a failed connection with no reason.
    await connectCalendar(createDomainContext(), {
      userId: verified.userId,
      businessId: verified.businessId,
      provider: "calendly",
      externalAccountId: account.id,
      encryptedAccessToken: new SecretBox(encryptionKey).encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: new SecretBox(encryptionKey).encrypt(tokens.refreshToken) } : {}),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    });
    // The integrations page shows the active business, so open the one just connected: a link from
    // POST /v1/calendars/calendly/connect may start from another. On a partner's host this opens only
    // that partner's businesses. The connection stands either way.
    await switchWorkspace(createDomainContext(), { userId: verified.userId, businessId: verified.businessId, brand: requestBrandScope(request.headers) }).catch(() => undefined);
    return destination("success");
  } catch (error) {
    asApiResponse(error); // Retain the existing sanitized operational reporting.
    return destination("error");
  }
}
