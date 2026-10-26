import { NextResponse } from "next/server";

import { connectInstagramAccount } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import { asApiResponse, jsonError, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { consumeInstagramOAuthState, enforceInstagramOAuthRateLimits, instagramProvider, verifyInstagramOAuthState } from "@/lib/instagram-oauth";
import { routeOAuthCallback } from "@/lib/oauth-callback-host";
import { partnerRequestOrigin } from "@/lib/request-brand";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // A connection started on a partner's host finishes there, and lands on that host's integrations page.
  const origin = partnerRequestOrigin(request.headers) ?? process.env.APP_BASE_URL ?? request.url;
  const destination = (status: "success" | "error" | "in_use" | "missing_permission") => NextResponse.redirect(new URL(`/integrations?instagram=${status}`, origin));
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const entryRate = await enforceInstagramOAuthRateLimits({ operation: "callback", ip: trustedClientIp(request) });
    if (!entryRate.allowed) return jsonError("Too many Instagram authorization requests. Please try again later.", entryRate.status, "instagram_oauth_rate_limited");
    if (!state) return jsonError("Instagram OAuth state is required.", 400);
    const verified = verifyInstagramOAuthState(state);
    if (!verified) return jsonError("Instagram OAuth state is invalid or expired.", 400);
    // Instagram returns to the host's domain. A connection started on a
    // partner's host goes back there before anything is used up, since the
    // person's session lives on that host.
    const route = await routeOAuthCallback(request, verified.origin ?? null).catch((error: unknown) => asApiResponse(error));
    if (route instanceof Response) return route;
    if (route.kind === "handoff") return NextResponse.redirect(route.url);
    if (route.kind === "refused") return jsonError("Instagram OAuth state belongs to another domain.", 400);
    const session = await requireApiSession(request);
    if (session.user.id !== verified.userId) return jsonError("Instagram OAuth state belongs to another user.", 403);
    const identityRate = await enforceInstagramOAuthRateLimits({ operation: "callback", userId: verified.userId, businessId: verified.businessId });
    if (!identityRate.allowed) return jsonError("Too many Instagram authorization requests. Please try again later.", identityRate.status, "instagram_oauth_rate_limited");
    if (!await consumeInstagramOAuthState(state, verified.userId, verified.businessId)) return jsonError("Instagram OAuth state has already been used or expired.", 400);
    if (!code || url.searchParams.has("error")) return destination("error");
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) throw new Error("Instagram token encryption is not configured.");
    const provider = instagramProvider();
    const token = await provider.exchangeCode(code);
    // The person can untick messaging on Instagram's consent screen, and then nothing could be answered.
    if (token.permissions.length && !token.permissions.includes("instagram_business_manage_messages")) return destination("missing_permission");
    const account = await provider.getAccount(token.accessToken);
    await provider.subscribeToMessages({ accessToken: token.accessToken, instagramUserId: account.instagramUserId });
    await connectInstagramAccount(createDomainContext(), {
      userId: verified.userId,
      businessId: verified.businessId,
      instagramUserId: account.instagramUserId,
      ...(account.username ? { username: account.username } : {}),
      encryptedAccessToken: new SecretBox(encryptionKey).encrypt(token.accessToken),
      tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
    });
    return destination("success");
  } catch (error) {
    if ((error as { code?: string }).code === "instagram_account_in_use") return destination("in_use");
    asApiResponse(error);
    return destination("error");
  }
}
