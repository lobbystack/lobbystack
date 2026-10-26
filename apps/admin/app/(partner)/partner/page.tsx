import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { listUserPartners } from "@lobbystack/domain";
import { getAppDatabase } from "@/lib/api-helpers";
import { getSession } from "@/lib/auth";
import { buildAuthPathWithReturnTo } from "@/lib/auth-return-to";
import { localeFromRequestHeaders } from "@/lib/locale-request";

/** Opens the console on the person's first partner, or on signup when they have none. */
export default async function PartnerConsoleHome() {
  const requestHeaders = await headers();
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(buildAuthPathWithReturnTo("/login", "/partner", localeFromRequestHeaders(requestHeaders).locale));
  const [first] = await listUserPartners({ db: getAppDatabase().db }, session.user.id);
  redirect(first ? `/partner/${first.partnerId}/businesses` : "/partner/signup");
}
