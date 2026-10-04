import { NextResponse } from "next/server";

import { connectCalendar } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import { assertCertificationRecipient } from "@lobbystack/shared";
import { asApiResponse, jsonError, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { verifyCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { googleCalendarProvider } from "@/lib/google-calendar-provider";
import { enforceCalendarOAuthRateLimits } from "@/lib/google-calendar-oauth-limit";
import { consumeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const destination = (status: "success" | "error") => NextResponse.redirect(new URL(`/integrations?calendar=google&status=${status}`, process.env.APP_BASE_URL ?? request.url));
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
    if (!state) return jsonError("Google OAuth state is required.", 400);
    const verified = verifyCalendarOAuthState(state);
    if (!verified) return jsonError("Google OAuth state is invalid or expired.", 400);
    const session = await requireApiSession(request);
    if (session.user.id !== verified.userId) return jsonError("Google OAuth state belongs to another user.", 403);
    // Authenticated dimensions, counted once per request, before consumption or
    // the provider exchange.
    const identityRate = await enforceCalendarOAuthRateLimits(
      { operation: "callback", userId: verified.userId, businessId: verified.businessId },
    );
    if (!identityRate.allowed) return jsonError("Too many calendar authorization requests. Please try again later.", identityRate.status, identityRate.code);
    if (!await consumeCalendarOAuthState(state, verified.userId, verified.businessId)) return jsonError("Google OAuth state has already been used or expired.", 400);
    if (!code || url.searchParams.has("error")) return destination("error");
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Calendar token encryption is not configured.");
    const tokens = await googleCalendarProvider().exchangeCode(code);
    const account = await googleCalendarProvider().getAccount({ accessToken: tokens.accessToken });
    assertCertificationRecipient("email", account.email ?? "");
    await connectCalendar(createDomainContext(), {
      userId: verified.userId,
      businessId: verified.businessId,
      provider: "google",
      externalAccountId: account.id,
      encryptedAccessToken: new SecretBox(encryptionKey).encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: new SecretBox(encryptionKey).encrypt(tokens.refreshToken) } : {}),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    });
    return destination("success");
  } catch (error) {
    asApiResponse(error); // Retain the existing sanitized operational reporting.
    return destination("error");
  }
}
