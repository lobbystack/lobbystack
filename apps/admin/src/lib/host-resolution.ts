import { isHostDomainHost, resolveHostBrand } from "@lobbystack/domain";

import { listenForBrandChangesOnce } from "./brand-changes";
import { getDatabase } from "./databases";
import { visitorOrigin, type ResolvedBrand } from "./request-brand";

/**
 * What a request's Host header resolves to, for the proxy: the host's own
 * domain, answered from the environment alone so a database outage never
 * reaches it; a partner's host, through Brands and its cache; or null for any
 * other hostname, which the proxy answers with a 404. Brands reads the
 * database only for a hostname that could be a partner's, so the proxy's pool
 * stays idle on every other hostname. Rejects when the database can't say
 * whether a hostname is a partner's.
 */
export async function resolveRequestHost(host: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<ResolvedBrand | null> {
  if (isHostDomainHost(host)) return { kind: "host" };
  // Visitors are nobody yet, so the app role reads partner hosts through a definer function.
  listenForBrandChangesOnce();
  const brand = await resolveHostBrand({ db: getDatabase("lobbystack_app").db }, host);
  if (!brand) return null;
  if (brand.kind !== "partner" || !brand.partnerId) return { kind: "host" };
  const origin = visitorOrigin(host, env);
  return origin ? { kind: "partner", partnerId: brand.partnerId, origin } : null;
}
