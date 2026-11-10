"use client";

import { usePathname } from "next/navigation";
import { Bell, BookOpen, Building2, Contact, CreditCard, Gauge, Handshake, KeyRound, Palette, Plug, ReceiptText, ShieldCheck, Tags, UserRound, UsersRound, Webhook, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBusinessCan, useOpensPartnerBilling } from "@/components/business-capabilities-provider";
import { ACCOUNT_PAGES, BUSINESS_PAGES, visibleSettingsPages, WORKSPACE_PAGES, type SettingsPage } from "@/lib/settings-pages";
import { MenuGroup, MenuRow } from "./menu-parts";

const ICONS: Record<string, LucideIcon> = {
  "/account": ShieldCheck,
  "/account/appearance": Palette,
  "/account/notifications": Bell,
  "/business": Building2,
  "/business/knowledge": BookOpen,
  "/business/services": Tags,
  "/business/employees": Contact,
  "/business/connections": Plug,
  "/workspace/team": UsersRound,
  "/workspace/usage": Gauge,
  "/workspace/billing": CreditCard,
  "/workspace/subscription": ReceiptText,
  "/workspace/webhooks": Webhook,
  "/workspace/api-keys": KeyRound,
  "/workspace/partner-access": Handshake,
};

function PageRows({ pages }: { pages: SettingsPage[] }) {
  const pathname = usePathname();
  const { t } = useTranslation("nav");
  return pages.map((page) => {
    const Icon = ICONS[page.href] ?? UserRound;
    const title = t(page.menuKey ?? page.titleKey);
    return <MenuRow active={pathname === page.href} href={page.href} key={page.href} label={title} leading={<Icon />} title={title} />;
  });
}

/** What every agent works from: the business's details, knowledge, services, employees and connections. Its back row names it. */
export function BusinessMenu() {
  const can = useBusinessCan();
  return <MenuGroup><PageRows pages={visibleSettingsPages(BUSINESS_PAGES, can, false)} /></MenuGroup>;
}

/** One way into two settings levels, the workspace's and the person's own, with group labels telling them apart. Its back row names it. */
export function SettingsMenu() {
  const { t } = useTranslation("nav");
  const can = useBusinessCan();
  const opensPartnerBilling = useOpensPartnerBilling();
  const workspace = visibleSettingsPages(WORKSPACE_PAGES, can, opensPartnerBilling);
  const account = visibleSettingsPages(ACCOUNT_PAGES, can, opensPartnerBilling);
  return (
    <>
      {workspace.length ? <MenuGroup title={t("sidebar.workspace")}><PageRows pages={workspace} /></MenuGroup> : null}
      <MenuGroup title={t("sidebar.yourAccount")}><PageRows pages={account} /></MenuGroup>
    </>
  );
}
