import { headers } from "next/headers";

import { hashPartnerToken, previewPartnerSignupInvitation } from "@lobbystack/domain";
import { normalizeAuthEmail, partnerFeatures } from "@lobbystack/shared";
import { PartnerSignedOutSurface, PartnerSignupSurface, type PartnerSignupBlock } from "@/components/partner-signup-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";

function firstValue(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * Partner signup on the host's domain. While signup is invite-only, it works
 * only with the host's invitation link, for the email that link names.
 */
export default async function PartnerSignupPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  const requestHeaders = await headers();
  const invitation = firstValue((await searchParams).invitation);
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
  if (!session && !blocked) return <PartnerSignedOutSurface page="signup" returnTo={returnTo} />;
  if (session && !blocked && preview && (!session.user.emailVerified || normalizeAuthEmail(session.user.email ?? "") !== preview.email)) blocked = "wrongAccount";
  return <PartnerSignupSurface baseDomain={features.baseDomain} blocked={blocked} invitation={features.signup === "invite" ? invitation ?? null : null} invitedEmail={preview?.email ?? null} returnTo={returnTo} />;
}
