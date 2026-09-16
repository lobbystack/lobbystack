import { NextResponse } from "next/server";

import { connectCalendar } from "@lobbystack/domain";
import { GoogleCalendarProvider, SecretBox } from "@lobbystack/providers";
import { assertCertificationRecipient } from "@lobbystack/shared";
import { asApiResponse, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { verifyCalendarOAuthState } from "@/lib/google-calendar-oauth";
import { consumeCalendarOAuthState } from "@/lib/google-calendar-oauth-store";

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
  const destination = (status: "success" | "error") => NextResponse.redirect(new URL(`/integrations?calendar=google&status=${status}`, process.env.APP_BASE_URL ?? request.url));
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!state) return NextResponse.json({ error: "Google OAuth state is required." }, { status: 400 });
    const verified = verifyCalendarOAuthState(state);
    if (!verified) return NextResponse.json({ error: "Google OAuth state is invalid or expired." }, { status: 400 });
    const session = await requireApiSession(request);
    if (session.user.id !== verified.userId) return NextResponse.json({ error: "Google OAuth state belongs to another user." }, { status: 403 });
    if (!await consumeCalendarOAuthState(state, verified.userId, verified.businessId)) return NextResponse.json({ error: "Google OAuth state has already been used or expired." }, { status: 400 });
    if (!code || url.searchParams.has("error")) return destination("error");
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Calendar token encryption is not configured.");
    const tokens = await provider().exchangeCode(code);
    const account = await provider().getAccount({ accessToken: tokens.accessToken });
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
