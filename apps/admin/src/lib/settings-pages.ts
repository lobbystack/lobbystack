import type { Capability } from "@lobbystack/domain";

import { pageCapability } from "./dashboard-pages";

// The pages with fixed menus outside the agents: the person's own account and
// the workspace, which share Settings, and the business every agent works
// from, under /business. An agent's own settings live on each agent at
// /agents/[agentId]. Menus and search show these lists through
// visibleSettingsPages, so a page shows only where the business lets the
// person open it.

export type SettingsPage = {
  href: string;
  /** A key in the nav namespace, for the page's title. */
  titleKey: `settingsPages.${string}`;
  /** A shorter key for its menu row, where the menu already names the section. */
  menuKey?: `businessPages.${string}`;
  /** Only on a partner's business, where its owners and admins pay the partner and see who opened it. */
  partnerBusinessOnly?: boolean;
};

export const ACCOUNT_PAGES: readonly SettingsPage[] = [
  { href: "/account", titleKey: "settingsPages.profile" },
  { href: "/account/appearance", titleKey: "settingsPages.appearance" },
  { href: "/account/notifications", titleKey: "settingsPages.notifications" },
];

export const BUSINESS_PAGES: readonly SettingsPage[] = [
  { href: "/business", titleKey: "settingsPages.business", menuKey: "businessPages.details" },
  { href: "/business/knowledge", titleKey: "settingsPages.knowledge" },
  { href: "/business/services", titleKey: "settingsPages.services" },
  { href: "/business/employees", titleKey: "settingsPages.employees" },
  { href: "/business/integrations", titleKey: "settingsPages.connections" },
];

export const WORKSPACE_PAGES: readonly SettingsPage[] = [
  { href: "/workspace/team", titleKey: "settingsPages.team" },
  { href: "/workspace/usage", titleKey: "settingsPages.usage" },
  { href: "/workspace/billing", titleKey: "settingsPages.billing" },
  { href: "/workspace/subscription", titleKey: "settingsPages.subscription", partnerBusinessOnly: true },
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

/** The page the person is on in one of these lists: its own path, else the page above it. */
export function currentSettingsPage(pages: readonly SettingsPage[], pathname: string): SettingsPage | undefined {
  return pages.find((page) => pathname === page.href) ?? pages.find((page) => pathname.startsWith(`${page.href}/`));
}

/** Where the Business row opens: the first business page the person may use, or null when there's none. */
export function businessLandingPage(can: (capability: Capability) => boolean): string | null {
  return visibleSettingsPages(BUSINESS_PAGES, can, false)[0]?.href ?? null;
}
