"use client";

import { usePathname } from "next/navigation";
import { Bell, BookOpen, Building2, Contact, CreditCard, Gauge, Handshake, KeyRound, Palette, Plug, ReceiptText, ShieldCheck, Tags, UserRound, UsersRound, Webhook, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBusinessCan, useOpensPartnerBilling } from "@/components/business-capabilities-provider";
import { ACCOUNT_PAGES, visibleSettingsPages, WORKSPACE_PAGES, type SettingsPage } from "@/lib/settings-pages";
import { MenuGroup, MenuRow } from "./menu-parts";

const ICONS: Record<string, LucideIcon> = {
  "/account": ShieldCheck,
  "/account/appearance": Palette,
  "/account/notifications": Bell,
  "/workspace/business": Building2,
  "/workspace/knowledge": BookOpen,
  "/workspace/services": Tags,
  "/workspace/employees": Contact,
  "/workspace/team": UsersRound,
  "/workspace/usage": Gauge,
  "/workspace/billing": CreditCard,
  "/workspace/subscription": ReceiptText,
  "/workspace/connections": Plug,
  "/workspace/webhooks": Webhook,
  "/workspace/api-keys": KeyRound,
  "/workspace/partner-access": Handshake,
};

function PageRows({ pages }: { pages: SettingsPage[] }) {
  const pathname = usePathname();
  const { t } = useTranslation("nav");
  return pages.map((page) => {
    const Icon = ICONS[page.href] ?? UserRound;
    const title = t(page.titleKey);
    return <MenuRow active={pathname === page.href} href={page.href} key={page.href} label={title} leading={<Icon />} title={title} />;
  });
}

/** One way into two settings levels, the workspace's and the person's own, with group labels telling them apart. Agent settings stay on each agent. */
export function SettingsMenu() {
  const { t } = useTranslation("nav");
  const can = useBusinessCan();
  const opensPartnerBilling = useOpensPartnerBilling();
  const workspace = visibleSettingsPages(WORKSPACE_PAGES, can, opensPartnerBilling);
  const account = visibleSettingsPages(ACCOUNT_PAGES, can, opensPartnerBilling);
  return (
    <>
      <div className="px-4 pt-3 pb-1 group-data-[collapsible=icon]:hidden"><h2 className="text-base font-medium">{t("items.settings")}</h2></div>
      {workspace.length ? <MenuGroup title={t("sidebar.workspace")}><PageRows pages={workspace} /></MenuGroup> : null}
      <MenuGroup title={t("sidebar.yourAccount")}><PageRows pages={account} /></MenuGroup>
    </>
  );
}
