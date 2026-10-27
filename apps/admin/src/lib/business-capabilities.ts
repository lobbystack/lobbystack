import type { Capability } from "@lobbystack/domain";

// What each operator route needs a business to give the person, so the server
// enforces a partner business's access level whatever the dashboard shows.
// Activity is calls, chats, appointments, contacts and messages, plus what
// every operator needs to land in the business: Home, live updates, their own
// alert and appearance preferences, and verifying their phone. Setup is the
// rest of an owner's and admin's work there. Direct businesses give every
// capability, so only their roles decide, as before.

const routeCapabilities: ReadonlyArray<readonly [prefix: string, capability: Capability]> = [
  ["/api/account/phone-verification", "activity"],
  ["/api/activation", "setup"],
  ["/api/agent", "setup"],
  ["/api/analytics", "setup"],
  ["/api/api-keys", "api_keys"],
  ["/api/appointments", "activity"],
  ["/api/billing", "billing"],
  ["/api/businesses", "setup"],
  ["/api/calendar", "setup"],
  ["/api/calls", "activity"],
  ["/api/catalog", "setup"],
  ["/api/contacts", "activity"],
  ["/api/dashboard", "activity"],
  ["/api/employees", "setup"],
  ["/api/hours", "setup"],
  ["/api/integrations", "setup"],
  ["/api/knowledge", "setup"],
  ["/api/messages", "activity"],
  ["/api/notification-preferences", "activity"],
  ["/api/number-trial", "setup"],
  ["/api/oauth-grants", "mcp"],
  ["/api/onboarding", "setup"],
  // Every owner verifies their phone, since calls forward to it, and moves through onboarding. The phone step reads where numbers are sold.
  ["/api/onboarding/numbers", "activity"],
  ["/api/onboarding/phone-verification", "activity"],
  ["/api/onboarding/stage", "activity"],
  // A partner's business's billing page, where its owner pays the partner. It isn't the host's billing, and the domain lets only owners and admins in.
  ["/api/package-billing", "activity"],
  // Who on the partner's team opened the business. Owners and admins read it at either access level; the route checks the role.
  ["/api/partner-access", "activity"],
  ["/api/phone-numbers", "setup"],
  ["/api/preferences/appearance", "activity"],
  ["/api/realtime", "activity"],
  ["/api/rules", "setup"],
  ["/api/setup", "setup"],
  ["/api/team", "team"],
  ["/api/uploads", "setup"],
  // Minutes and chats against the allowance, without the plan's prices.
  ["/api/usage", "activity"],
  // The dashboard's test call.
  ["/api/voice", "setup"],
  ["/api/webhook-deliveries", "api_keys"],
  ["/api/webhook-endpoints", "api_keys"],
  ["/api/widget-keys", "setup"],
];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The capability the table lists for a path, from its longest matching prefix, or undefined for a path it doesn't list. */
export function listedRouteCapability(pathname: string): Capability | undefined {
  let found: readonly [string, Capability] | undefined;
  for (const entry of routeCapabilities) {
    if (matches(pathname, entry[0]) && (!found || entry[0].length > found[0].length)) found = entry;
  }
  return found?.[1];
}

/** The capability an operator route needs. A route the table doesn't list needs setup, so a new route stays off an activity-only business until it's listed. */
export function routeCapability(pathname: string): Capability {
  return listedRouteCapability(pathname) ?? "setup";
}

/**
 * The capability a request's path needs, read from the path the request
 * reaches. In production Next.js also routes a percent-encoded path, such as
 * /api/%62illing, to the route its decoded form names, so this reads the
 * decoded path, never the spelling the client sent. Undefined for a path
 * that doesn't decode, which the caller refuses.
 */
export function requestPathCapability(pathname: string): Capability | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  return routeCapability(decoded);
}
