import { headers } from "next/headers";

import { hashPartnerToken, previewPartnerSignupInvitation } from "@lobbystack/domain";
import { normalizeAuthEmail, partnerFeatures } from "@lobbystack/shared";
import { GuestAuthCard } from "@/components/guest-auth-card";
import { PartnerSignupSurface, type PartnerSignupBlock } from "@/components/partner-signup-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { getSafeReturnTo } from "@/lib/auth-return-to";

function firstValue(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * Partner signup on the host's domain. While signup is invite-only, it works
 * only with the host's invitation link, for the email that link names.
 */
export default async function PartnerSignupPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[]; google?: string | string[]; returnTo?: string | string[] }> }) {
  const requestHeaders = await headers();
  const query = await searchParams;
  const invitation = firstValue(query.invitation);
  const returnTo = `/partner/signup${invitation ? `?invitation=${encodeURIComponent(invitation)}` : ""}`;
  const features = partnerFeatures(process.env);
  const preview = features.signup === "invite" && invitation ? await previewPartnerSignupInvitation({ db: getAppDatabase().db }, { tokenHash: hashPartnerToken(invitation) }) : null;
  let blocked: PartnerSignupBlock | null = null;
  if (features.signup === "invite") {
    if (!invitation) blocked = "inviteOnly";
    else if (!preview || preview.status === "revoked" || (preview.status === "pending" && preview.expired)) blocked = "invitationInvalid";
    else if (preview.status === "accepted") blocked = "invitationUsed";
  }

  const session = await getSession(new Headers(requestHeaders));
  // Someone joining a partner's team makes their account here too, then goes back to the team invitation.
  const joining = getSafeReturnTo(firstValue(query.returnTo));
  if (!session && joining && /^\/partner\/accept-invite(?:\?|$)/.test(joining)) return <GuestAuthCard mode="signup" partner={{ returnTo: joining }} />;
  // A signed-out visitor makes their account here first. Google sign-in comes back
  // with ?google= so the card records it before it moves on, even when the link
  // stopped working meanwhile. Without an invitation the console is enough: it
  // sends anyone with no partner back here, and someone who signs in instead
  // lands on the partner they already have.
  if ((!session && !blocked) || (session && firstValue(query.google))) return <GuestAuthCard mode="signup" partner={{ returnTo: invitation ? returnTo : "/partner" }} />;
  if (session && !blocked && preview && (!session.user.emailVerified || normalizeAuthEmail(session.user.email ?? "") !== preview.email)) blocked = "wrongAccount";
  return <PartnerSignupSurface baseDomain={features.baseDomain} blocked={blocked} invitation={features.signup === "invite" ? invitation ?? null : null} invitedEmail={preview?.email ?? null} returnTo={returnTo} signedIn={session !== null} />;
}
