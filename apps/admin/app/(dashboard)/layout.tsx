import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveOnboardingState, listUserPartners, resolveOnboardingRoute } from "@lobbystack/domain";
import { isWidgetKeyIssuanceEnabled } from "@lobbystack/shared";
import { RootDocument } from "@/app/root-document";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSession } from "@/lib/auth";
import { getAppDatabase } from "@/lib/api-helpers";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { opensPartnerConsole, readResolvedBrand } from "@/lib/request-brand";
import { DASHBOARD_NAMESPACES } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(localizePublicPath("/login", locale));
  const [onboarding, memberships] = await Promise.all([
    getActiveOnboardingState(getAppDatabase().db, session.user.id),
    listUserPartners({ db: getAppDatabase().db }, session.user.id),
  ]);
  // The partners whose console opens here: on a partner's host, only that partner.
  const resolved = readResolvedBrand(requestHeaders);
  const partners = memberships.filter(({ partnerId }) => opensPartnerConsole(resolved, partnerId));
  // Someone on a partner's team with no business of their own works in the partner console.
  if (onboarding.stage === "create_business" && !onboarding.businessId && partners.length > 0) redirect("/partner");
  if (onboarding.stage !== "complete") redirect(resolveOnboardingRoute(onboarding.stage));
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={DASHBOARD_NAMESPACES}>
      <DashboardShell
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
