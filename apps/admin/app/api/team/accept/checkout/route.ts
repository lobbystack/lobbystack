import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { startInvitationCheckout } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { enforceFixedWindow, fixedWindowLimit } from "@/lib/fixed-window-limit";
import { readResolvedBrand } from "@/lib/request-brand";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The checkout an owner's invitation opens before they sign in: a Stripe
// Checkout on the partner's own account for the business's package. It opens
// only on the partner's domain, and Stripe sends the owner back to the
// invitation there to sign in.

/** Opens `{ token }`'s checkout and answers `{ url }`, the Stripe Checkout to send the owner to. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token) return jsonError("An invitation token is required.", 400, "invalid_request");
    const resolved = readResolvedBrand(request.headers);
    const partner = resolved?.kind === "partner" ? resolved : null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    // Anyone with the link can ask, and an open checkout is reused, so this only caps retries.
    const limit = await enforceFixedWindow([fixedWindowLimit("invitation-checkout", "token-hour", tokenHash, 20, 60 * 60, "rate_limit_token_hour")]);
    if (!limit.allowed) return jsonError(limit.status === 429 ? "Too many tries. Try again later." : "Checkout abuse protection is unavailable.", limit.status, limit.status === 429 ? "rate_limited" : "rate_limit_unavailable");
    const page = `${partner?.origin ?? ""}/accept-invite?token=${encodeURIComponent(token)}`;
    return NextResponse.json(await startInvitationCheckout(withStripeConnect(createDomainContext()), {
      tokenHash,
      partnerId: partner?.partnerId ?? null,
      successUrl: `${page}&checkout=complete`,
      cancelUrl: `${page}&checkout=canceled`,
    }));
  } catch (error) {
    return asApiResponse(error);
  }
}
