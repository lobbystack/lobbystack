import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { capabilityNames, getActiveOnboardingState, listUserBusinesses, listUserPartners, readBusinessCapabilities, resolveOnboardingRoute } from "@lobbystack/domain";
import { isWidgetKeyIssuanceEnabled } from "@lobbystack/shared";
import { RootDocument } from "@/app/root-document";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSession } from "@/lib/auth";
import { getAppDatabase } from "@/lib/api-helpers";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { NO_BUSINESSES_PATH, opensPartnerConsole, readResolvedBrand, requestBrandScope } from "@/lib/request-brand";
import { DASHBOARD_NAMESPACES } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
  // The first render hides what the business's access level leaves out, before the workspace list loads. The list
  // leaves out a business that's no longer active, so that one's read from the business itself; the server enforces
  // the same rules either way.
  const capabilities = businesses.find((business) => business.businessId === onboarding.businessId)?.capabilities
    ?? (onboarding.businessId ? await readBusinessCapabilities(getAppDatabase().db, { userId: session.user.id, businessId: onboarding.businessId }) : null)
    ?? [...capabilityNames];
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={DASHBOARD_NAMESPACES}>
      <DashboardShell
        capabilities={capabilities}
        partnerConsole={partners.length > 0}
        sidebarOpen={sidebarOpen}
        widgetsEnabled={isWidgetKeyIssuanceEnabled(process.env)}
        user={{
          email: session.user.email ?? "",
          name: session.user.name ?? session.user.email ?? "",
        }}
      >
        {children}
      </DashboardShell>
    </RootDocument>
  );
}
