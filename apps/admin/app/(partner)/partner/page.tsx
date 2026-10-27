import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { listUserPartners } from "@lobbystack/domain";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { buildPartnerConsoleLoginPath } from "@/lib/auth-return-to";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { opensPartnerConsole, readResolvedBrand } from "@/lib/request-brand";

/**
 * Opens the console on the person's first partner, or on signup when they
 * have none. On a partner's host it opens only that partner's console, and
 * anyone off its team gets a 404, since partner signup stays on the host's
 * domain.
 */
export default async function PartnerConsoleHome() {
  const requestHeaders = await headers();
  const session = await getSession(new Headers(requestHeaders));
  const resolved = readResolvedBrand(requestHeaders);
  // White Label's sign-in stays on the host's domain; a partner's team signs in on the partner's own page.
  if (!session) redirect(buildPartnerConsoleLoginPath(resolved?.kind === "partner", "/partner", localeFromRequestHeaders(requestHeaders).locale));
  const partners = await listUserPartners({ db: getAppDatabase().db }, session.user.id);
  const first = partners.find(({ partnerId }) => opensPartnerConsole(resolved, partnerId));
  if (first) redirect(`/partner/${first.partnerId}/businesses`);
  if (resolved?.kind === "partner") notFound();
  redirect("/partner/signup");
}
