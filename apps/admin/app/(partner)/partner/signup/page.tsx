import { headers } from "next/headers";

import { hashPartnerToken, previewPartnerSignupInvitation } from "@lobbystack/domain";
import { normalizeAuthEmail, partnerFeatures } from "@lobbystack/shared";
import { GuestAuthCard } from "@/components/guest-auth-card";
import { PartnerSignupSurface, type PartnerSignupBlock } from "@/components/partner-signup-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";

function firstValue(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * Partner signup on the host's domain. While signup is invite-only, it works
 * only with the host's invitation link, for the email that link names.
 */
export default async function PartnerSignupPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[]; google?: string | string[] }> }) {
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
  // A signed-out visitor makes their account here first. Google sign-in comes back
  // with ?google= so the card can record it before it moves on. Without an
  // invitation the console is enough: it sends anyone with no partner back here,
  // and someone who signs in instead lands on the partner they already have.
  if ((!session || firstValue(query.google)) && !blocked) return <GuestAuthCard mode="signup" partner={{ returnTo: invitation ? returnTo : "/partner" }} />;
  if (session && !blocked && preview && (!session.user.emailVerified || normalizeAuthEmail(session.user.email ?? "") !== preview.email)) blocked = "wrongAccount";
  return <PartnerSignupSurface baseDomain={features.baseDomain} blocked={blocked} invitation={features.signup === "invite" ? invitation ?? null : null} invitedEmail={preview?.email ?? null} returnTo={returnTo} />;
}
