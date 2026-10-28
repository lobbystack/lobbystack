import type { Capability } from "@lobbystack/domain";

// What each dashboard page needs the active business to give the person, so
// the dashboard hides what a partner business's access level leaves out:
// billing, API keys and MCP at full access, and everything but calls, chats,
// appointments, contacts, messages and usage at activity only. The server
// enforces the same for every route through business-capabilities.ts. Direct
// businesses give every capability, so their dashboard is unchanged.

const pageCapabilities: ReadonlyArray<readonly [prefix: string, capability: Capability]> = [
  // Home, and what each person sets for themselves.
  ["/", "activity"],
  // The host's affiliate program, which the proxy keeps on the host's domain, where only direct businesses show.
  ["/affiliate", "activity"],
  ["/settings/account", "activity"],
  ["/settings/appearance", "activity"],
  ["/settings/notifications", "activity"],
  ["/appointments", "activity"],
  ["/calls", "activity"],
  ["/contacts", "activity"],
  ["/messages", "activity"],
  ["/agent", "setup"],
  ["/analytics", "setup"],
  ["/integrations", "setup"],
  ["/integrations/webhooks", "api_keys"],
  ["/setup-guide", "setup"],
  ["/widget", "setup"],
  ["/settings/phone-number", "setup"],
  ["/settings/team", "team"],
  // Every operator sees the minutes and chats used against the allowance. A business with billing also sees its plan's meters there.
  ["/settings/usage", "activity"],
  ["/settings/plan", "billing"],
  // A partner's business's billing page, where its owner pays the partner. The Settings menu shows it only on a partner's business.
  ["/settings/subscription", "activity"],
  // Who on the partner's team opened the business, from its audit log. The Settings menu shows it only on a partner's business, and only its owners and admins can read it.
  ["/settings/partner-access", "activity"],
  // API keys, with the business's MCP connections under them, which need mcp too.
  ["/settings/api-keys", "api_keys"],
];

// Pages that match only their own path, not the pages under it.
const exactPageCapabilities: ReadonlyMap<string, Capability> = new Map([
  // Settings itself only opens the first tab the person may use.
  ["/settings", "activity"],
]);

function matches(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The capability a dashboard page needs, from its longest matching prefix. A page the table doesn't list needs setup. */
export function pageCapability(pathname: string): Capability {
  const exact = exactPageCapabilities.get(pathname);
  if (exact) return exact;
  let found: readonly [string, Capability] | undefined;
  for (const entry of pageCapabilities) {
    if (matches(pathname, entry[0]) && (!found || entry[0].length > found[0].length)) found = entry;
  }
  return found?.[1] ?? "setup";
}

/** The Settings tabs, in the order the dashboard shows them. */
export const SETTINGS_PAGES = ["/settings/usage", "/settings/plan", "/settings/team", "/settings/phone-number", "/settings/appearance", "/settings/notifications", "/settings/api-keys"] as const;

/** The first Settings tab the business lets the person open, where the menu's Settings link goes. */
export function firstSettingsPage(can: (capability: Capability) => boolean): string {
  return SETTINGS_PAGES.find((page) => can(pageCapability(page))) ?? "/settings/account";
}
