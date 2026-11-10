import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { capabilityNames, getActiveOnboardingState, listUserBusinesses, listUserPartners, readBusinessCapabilities, resolveOnboardingRoute, type Capability } from "@lobbystack/domain";
import { getSession } from "@/lib/auth";
import { getAppDatabase } from "@/lib/api-helpers";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { NO_BUSINESSES_PATH, opensPartnerConsole, readResolvedBrand, requestBrandScope } from "@/lib/request-brand";

/**
 * Who is signed in to the dashboard, the business they work in, and what it
 * lets them do. It sends anyone who can't open the dashboard where they
 * belong: to sign in, the partner console, onboarding, or the partner's
 * no-business page. The layout and the pages that redirect on the server
 * share one lookup per request.
 */
export const readDashboardRequest = cache(async () => {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(localizePublicPath("/login", locale));
  const brand = requestBrandScope(requestHeaders);
  const [onboarding, memberships, businesses] = await Promise.all([
    getActiveOnboardingState(getAppDatabase().db, session.user.id, brand),
    listUserPartners({ db: getAppDatabase().db }, session.user.id),
    listUserBusinesses(getAppDatabase().db, session.user.id, brand),
  ]);
  // The partners whose console opens here: on a partner's host, only that partner.
  const resolved = readResolvedBrand(requestHeaders);
  const partners = memberships.filter(({ partnerId }) => opensPartnerConsole(resolved, partnerId));
  // Someone on a partner's team with no business of their own works in the partner console.
  if (onboarding.stage === "create_business" && !onboarding.businessId && partners.length > 0) redirect("/partner");
  // On a partner's host, anyone else with no business there waits for the partner's invitation.
  if (!onboarding.businessId && resolved?.kind === "partner") redirect(NO_BUSINESSES_PATH);
  if (onboarding.stage !== "complete") redirect(resolveOnboardingRoute(onboarding.stage));
  const business = businesses.find((row) => row.businessId === onboarding.businessId);
  // The first render hides what the business's access level leaves out, before the workspace list loads. The list
  // leaves out a business that's no longer active, so that one's read from the business itself; the server enforces
  // the same rules either way.
  const capabilities: Capability[] = business?.capabilities
    ?? (onboarding.businessId ? await readBusinessCapabilities(getAppDatabase().db, { userId: session.user.id, businessId: onboarding.businessId }) : null)
    ?? [...capabilityNames];
  // A partner's business pays its partner, and its owners and admins open that billing page, as the client's provider decides.
  const opensPartnerBilling = Boolean(business?.partnerAccessLevel) && business?.via !== "partner" && (business?.role === "business_owner" || business?.role === "business_admin");
  return {
    locale,
    localeSource: source,
    user: { id: session.user.id, email: session.user.email ?? "", name: session.user.name ?? session.user.email ?? "" },
    businessId: onboarding.businessId,
    capabilities,
    can: (capability: Capability) => capabilities.includes(capability),
    opensPartnerBilling,
    partnerConsole: partners.length > 0,
  };
});

export type DashboardRequest = Awaited<ReturnType<typeof readDashboardRequest>>;
