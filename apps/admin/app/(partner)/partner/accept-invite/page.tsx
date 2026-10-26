import { headers } from "next/headers";

import { hashPartnerToken, previewPartnerInvitation } from "@lobbystack/domain";
import { PartnerAcceptInviteSurface } from "@/components/partner-accept-invite-surface";
import { PartnerSignedOutSurface } from "@/components/partner-signup-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";

/** Where a team invitation's email links: join the partner's team, signed in as the invited address. */
export default async function PartnerAcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const returnTo = `/partner/accept-invite${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const preview = token ? await previewPartnerInvitation({ db: getAppDatabase().db }, { tokenHash: hashPartnerToken(token) }) : null;
  const state = !preview ? "invalid" : preview.status !== "pending" ? "used" : preview.expired ? "expired" : "valid";
  const invitation = preview ? { partnerName: preview.partnerName, email: preview.email, role: preview.role } : null;
  const session = await getSession(new Headers(await headers()));
  if (!session && state === "valid") return <PartnerSignedOutSurface page="acceptInvite" returnTo={returnTo} values={{ email: preview!.email, partnerName: preview!.partnerName }} />;
  return <PartnerAcceptInviteSurface invitation={invitation} returnTo={returnTo} state={state} token={token} />;
}
