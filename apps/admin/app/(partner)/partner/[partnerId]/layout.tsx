import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { listUserPartners } from "@lobbystack/domain";
import { isUuid, partnerFeatures } from "@lobbystack/shared";
import { PartnerShell } from "@/components/partner-shell";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { opensPartnerConsole, readResolvedBrand } from "@/lib/request-brand";

/**
 * The console of one partner the signed-in person is on the team of. Anyone
 * else goes back to /partner. On a partner's host only that partner's console
 * opens, and its switcher lists no other partner.
 */
export default async function PartnerConsoleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ partnerId: string }> }) {
  const requestHeaders = await headers();
  const { partnerId } = await params;
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(buildAuthPathWithReturnTo("/login", requestHeaders.get(PATHNAME_HEADER) ?? "/partner", localeFromRequestHeaders(requestHeaders).locale));
  if (!isUuid(partnerId)) redirect("/partner");
  const resolved = readResolvedBrand(requestHeaders);
  const partners = (await listUserPartners({ db: getAppDatabase().db }, session.user.id))
    .filter(({ partnerId }) => opensPartnerConsole(resolved, partnerId))
    .map(({ partnerId, name, role }) => ({ partnerId, name, role }));
  const partner = partners.find((candidate) => candidate.partnerId === partnerId.toLowerCase());
  if (!partner) redirect("/partner");
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <PartnerShell partner={partner} partners={partners} sidebarOpen={sidebarOpen} tierBilling={partnerFeatures(process.env).tierBilling} user={{ email: session.user.email ?? "" }}>
      {children}
    </PartnerShell>
  );
}
