import { reserveMissingPartnerSubdomains, type DomainContext } from "@lobbystack/domain";
import { isMaintenanceMode, partnerFeatures } from "@lobbystack/shared";

import { createDomainContext } from "./domain-context";
import type { AdminStartupContext } from "./startup-role-assertion";

/**
 * Reserves a subdomain for each partner without one under PARTNER_BASE_DOMAIN,
 * as the admin starts: partners that signed up before the host set it, or set
 * it to something unusable, have none, and a new base domain takes a restart.
 * Returns how many it reserved, or null when it didn't run.
 */
export async function reserveMissingPartnerSubdomainsAtStartup(
  context: AdminStartupContext = {
    runtime: process.env.NEXT_RUNTIME,
    phase: process.env.NEXT_PHASE,
    environment: process.env,
  },
  domain: () => DomainContext = createDomainContext,
): Promise<number | null> {
  if (context.runtime !== "nodejs" || context.phase === "phase-production-build" || isMaintenanceMode(context.environment)) return null;
  const { baseDomain } = partnerFeatures(context.environment);
  if (!baseDomain) return null;
  const reserved = await reserveMissingPartnerSubdomains(domain());
  if (reserved > 0) console.info(`[partners] Reserved ${reserved === 1 ? "1 partner subdomain" : `${reserved} partner subdomains`} under ${baseDomain}.`);
  return reserved;
}
