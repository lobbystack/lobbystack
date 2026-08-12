import { NextResponse } from "next/server";

import { connectCalendar } from "@lobbystack/domain";
import { GoogleCalendarProvider, SecretBox } from "@lobbystack/providers";
import { asApiResponse, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { verifyCalendarOAuthState } from "@/lib/google-calendar-oauth";

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
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return NextResponse.json({ error: "Google OAuth code and state are required." }, { status: 400 });
    const verified = verifyCalendarOAuthState(state);
    if (!verified) return NextResponse.json({ error: "Google OAuth state is invalid or expired." }, { status: 400 });
    const session = await requireApiSession(request);
    if (session.user.id !== verified.userId) return NextResponse.json({ error: "Google OAuth state belongs to another user." }, { status: 403 });
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Calendar token encryption is not configured.");
    const tokens = await provider().exchangeCode(code);
    const account = await provider().getAccount({ accessToken: tokens.accessToken });
    await connectCalendar(createDomainContext(), {
      userId: verified.userId,
      businessId: verified.businessId,
      provider: "google",
      externalAccountId: account.id,
      encryptedAccessToken: new SecretBox(encryptionKey).encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { encryptedRefreshToken: new SecretBox(encryptionKey).encrypt(tokens.refreshToken) } : {}),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
    });
    return NextResponse.redirect(new URL("/integrations?calendar=connected", request.url));
  } catch (error) {
    return asApiResponse(error);
  }
}
