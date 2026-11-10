import type { Capability } from "@lobbystack/domain";

// What each dashboard page needs the active business to give the person, so
// the dashboard hides what a partner business's access level leaves out:
// billing, API keys and MCP at full access, and everything but the Inbox,
// appointments, contacts and usage at activity only. The server
// enforces the same for every route through business-capabilities.ts. Direct
// businesses give every capability, so their dashboard is unchanged.

const pageCapabilities: ReadonlyArray<readonly [prefix: string, capability: Capability]> = [
  // Home, and what each person sets for themselves.
  ["/", "activity"],
  // The host's affiliate program, which the proxy keeps on the host's domain, where only direct businesses show.
  ["/affiliate", "activity"],
  ["/appointments", "activity"],
  ["/contacts", "activity"],
  ["/analytics", "setup"],
  // Calls, texts, website chats and Instagram in one list.
  ["/inbox", "activity"],
  // The person's own profile, appearance and notifications.
  ["/account", "activity"],
  ["/agents", "setup"],
  // Business details, knowledge, services, employees and connections, which every agent works from.
  ["/business", "setup"],
  // Settings' workspace pages that need more than activity say so below.
  ["/workspace", "setup"],
  ["/workspace/team", "team"],
  // Every operator sees the minutes and chats used against the allowance. A business with billing also sees its plan's meters there.
  ["/workspace/usage", "activity"],
  ["/workspace/billing", "billing"],
  // A partner's business's billing page, where its owner pays the partner. The Settings menu shows it only on a partner's business.
  ["/workspace/subscription", "activity"],
  // Who on the partner's team opened the business, from its audit log. The Settings menu shows it only on a partner's business, and only its owners and admins can read it.
  ["/workspace/partner-access", "activity"],
  // API keys, with the business's MCP connections under them, which need mcp too.
  ["/workspace/api-keys", "api_keys"],
  ["/workspace/webhooks", "api_keys"],
];

// Pages that match only their own path, not the pages under it.
const exactPageCapabilities: ReadonlyMap<string, Capability> = new Map([
  // Settings and Workspace themselves only open the first page the person may use.
  ["/settings", "activity"],
  ["/workspace", "activity"],
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
