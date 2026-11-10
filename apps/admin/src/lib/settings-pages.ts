import type { Capability } from "@lobbystack/domain";

import { pageCapability } from "./dashboard-pages";

// The two settings levels with fixed pages: the person's own account and the
// workspace. The third, an agent's settings, lives on each agent at
// /agents/[agentId]. Menus and search show these lists through
// visibleSettingsPages, so a page shows only where the business lets the
// person open it.

export type SettingsPage = {
  href: string;
  /** A key in the nav namespace. */
  titleKey: `settingsPages.${string}`;
  /** Only on a partner's business, where its owners and admins pay the partner and see who opened it. */
  partnerBusinessOnly?: boolean;
};

export const ACCOUNT_PAGES: readonly SettingsPage[] = [
  { href: "/account", titleKey: "settingsPages.profile" },
  { href: "/account/appearance", titleKey: "settingsPages.appearance" },
  { href: "/account/notifications", titleKey: "settingsPages.notifications" },
];

export const WORKSPACE_PAGES: readonly SettingsPage[] = [
  { href: "/workspace/business", titleKey: "settingsPages.business" },
  { href: "/workspace/knowledge", titleKey: "settingsPages.knowledge" },
  { href: "/workspace/services", titleKey: "settingsPages.services" },
  { href: "/workspace/employees", titleKey: "settingsPages.employees" },
  { href: "/workspace/team", titleKey: "settingsPages.team" },
  { href: "/workspace/usage", titleKey: "settingsPages.usage" },
  { href: "/workspace/billing", titleKey: "settingsPages.billing" },
  { href: "/workspace/subscription", titleKey: "settingsPages.subscription", partnerBusinessOnly: true },
  { href: "/workspace/connections", titleKey: "settingsPages.connections" },
  { href: "/workspace/webhooks", titleKey: "settingsPages.webhooks" },
  { href: "/workspace/api-keys", titleKey: "settingsPages.apiKeys" },
  { href: "/workspace/partner-access", titleKey: "settingsPages.partnerAccess", partnerBusinessOnly: true },
];

/** The pages the business lets the person open, in menu order. Partner-only pages show only on a partner's business. */
export function visibleSettingsPages(pages: readonly SettingsPage[], can: (capability: Capability) => boolean, onPartnerBusiness: boolean): SettingsPage[] {
  return pages.filter((page) => (!page.partnerBusinessOnly || onPartnerBusiness) && can(pageCapability(page.href)));
}

/**
 * Where /settings and /workspace send the person: the first workspace page
 * they may open, else their account. An activity-only operator lands on Usage.
 */
export function settingsLandingPage(can: (capability: Capability) => boolean, onPartnerBusiness = false): string {
  return visibleSettingsPages(WORKSPACE_PAGES, can, onPartnerBusiness)[0]?.href ?? ACCOUNT_PAGES[0]!.href;
}
