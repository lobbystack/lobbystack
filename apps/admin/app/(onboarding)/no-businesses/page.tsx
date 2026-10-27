import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveOnboardingState, listUserPartners, partnerReleasedBusinessTo } from "@lobbystack/domain";
import { NoBusinessesSurface } from "@/components/no-businesses-surface";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { opensPartnerConsole, readResolvedBrand, requestBrandScope } from "@/lib/request-brand";

/**
 * On a partner's host, the page for a signed-in person with no business
 * there, in place of the host's onboarding. Anyone it doesn't fit goes on:
 * to their business, to the partner's console, or on the host's own domain
 * to its onboarding. Someone whose business this partner released finds it
 * on the host's domain now, so the page links there; anyone else with a
 * direct business hears nothing of it here.
 */
export default async function NoBusinessesPage() {
  const requestHeaders = await headers();
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect("/login");
  const resolved = readResolvedBrand(requestHeaders);
  if (resolved?.kind !== "partner") redirect("/");
  const db = getAppDatabase().db;
  const [state, partners, released] = await Promise.all([
    getActiveOnboardingState(db, session.user.id, requestBrandScope(requestHeaders)),
    listUserPartners({ db }, session.user.id),
    partnerReleasedBusinessTo({ db }, { userId: session.user.id, partnerId: resolved.partnerId }),
  ]);
  if (state.businessId) redirect("/");
  if (partners.some(({ partnerId }) => opensPartnerConsole(resolved, partnerId))) redirect("/partner");
  const hostUrl = released ? process.env.APP_BASE_URL?.trim().replace(/\/$/, "") || null : null;
  return <NoBusinessesSurface email={session.user.email ?? ""} hostUrl={hostUrl} />;
}
