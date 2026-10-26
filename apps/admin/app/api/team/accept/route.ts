import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { acceptInvitation, previewInvitation } from "@lobbystack/domain";
import { asApiResponse, jsonError } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { signedInRoute } from "@/lib/operator-request";
import { withStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What an invitation's link shows before sign-in, with the package its owner pays for when it's sold one. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return NextResponse.json({ invitation: null });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return NextResponse.json({ invitation: await previewInvitation(withStripeConnect(createDomainContext()), { tokenHash }) });
  } catch (error) {
    return asApiResponse(error);
  }
}

export const POST = signedInRoute(async ({ session, userId, body, domain }) => {
  if (typeof body.token !== "string") return jsonError("An invitation token is required.", 400);
  const tokenHash = createHash("sha256").update(body.token).digest("hex");
  return NextResponse.json(await acceptInvitation(domain, { userId, tokenHash, email: session.user.email, emailVerified: session.user.emailVerified }));
});
