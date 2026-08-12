import { NextResponse } from "next/server";

import { GoogleCalendarProvider } from "@lobbystack/providers";
import { asApiResponse, businessIdFromRequest, requireApiSession, withOperatorTransaction } from "@/lib/api-helpers";
import { createCalendarOAuthState } from "@/lib/google-calendar-oauth";

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
    const state = createCalendarOAuthState({ userId: session.user.id, businessId });
    return NextResponse.json({ url: provider().buildAuthorizationUrl({ state }) });
  } catch (error) {
    return asApiResponse(error);
  }
}
