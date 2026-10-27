import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { listUserBusinesses, listUserPartners, partnerHasBillingPage } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { PartnerShell } from "@/components/partner-shell";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { buildPartnerConsoleLoginPath } from "@/lib/auth-return-to";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { opensPartnerConsole, readResolvedBrand, requestBrandScope } from "@/lib/request-brand";

/**
 * The console of one partner the signed-in person is on the team of. Anyone
 * else goes back to /partner. On a partner's host only that partner's console
 * opens, and its switcher lists no other partner.
 */
export default async function PartnerConsoleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ partnerId: string }> }) {
  const requestHeaders = await headers();
  const { partnerId } = await params;
  const session = await getSession(new Headers(requestHeaders));
  const resolved = readResolvedBrand(requestHeaders);
  if (!session) redirect(buildPartnerConsoleLoginPath(resolved?.kind === "partner", requestHeaders.get(PATHNAME_HEADER) ?? "/partner", localeFromRequestHeaders(requestHeaders).locale));
  if (!isUuid(partnerId)) redirect("/partner");
  const partners = (await listUserPartners({ db: getAppDatabase().db }, session.user.id))
    .filter(({ partnerId }) => opensPartnerConsole(resolved, partnerId))
    .map(({ partnerId, name, role }) => ({ partnerId, name, role }));
  const partner = partners.find((candidate) => candidate.partnerId === partnerId.toLowerCase());
  if (!partner) redirect("/partner");
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const [billingPage, businesses] = await Promise.all([
    // Only owners see Billing: while the deployment bills tiers, or once the host set the partner's pool.
    partner.role === "owner" ? partnerHasBillingPage({ db: getAppDatabase().db }, { userId: session.user.id, partnerId: partner.partnerId }) : false,
    listUserBusinesses(getAppDatabase().db, session.user.id, requestBrandScope(requestHeaders)),
  ]);
  // The account menu links back to the business dashboard for someone on a business's own team here. A business
  // their partner opened for them doesn't count: they get back to that one from Businesses.
  const businessDashboard = businesses.some(({ via }) => via === "membership");
  return (
    <PartnerShell billingPage={billingPage} businessDashboard={businessDashboard} partner={partner} partners={partners} sidebarOpen={sidebarOpen} user={{ email: session.user.email ?? "" }}>
      {children}
    </PartnerShell>
  );
}
