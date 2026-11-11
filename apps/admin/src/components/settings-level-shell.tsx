"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { HeaderActionsSlotContext } from "@/components/header-actions";
import { HeaderButtonSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { ACCOUNT_PAGES, BUSINESS_PAGES, currentSettingsPage, WORKSPACE_PAGES } from "@/lib/settings-pages";

// Pages that put an add button in the header, with its label.
const HEADER_ACTIONS: Record<string, { label: string; trailingIcon?: boolean }> = {
  "/business/knowledge": { label: "agent:sections.knowledge.addKnowledge", trailingIcon: true },
  "/business/services": { label: "agent:sections.services.addKnowledge" },
  "/business/employees": { label: "employees:add.button" },
  "/workspace/api-keys": { label: "settings:apiKeys.create.action" },
  "/workspace/webhooks": { label: "settings:webhooks.create.action" },
};

/**
 * The header of the pages of Business or one settings level, titled with the
 * page open. Pages with an add button put it in the header once the slot
 * below exists; until then, which includes the server render, the header
 * shows its placeholder.
 */
function SettingsLevelShell({ children, level }: { children: React.ReactNode; level: "account" | "workspace" | "business" }) {
  const pathname = usePathname();
  const { t } = useTranslation(["nav", "agent", "employees", "settings"]);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const pages = level === "account" ? ACCOUNT_PAGES : level === "business" ? BUSINESS_PAGES : WORKSPACE_PAGES;
  const current = currentSettingsPage(pages, pathname);
  const actions = HEADER_ACTIONS[pathname];
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader actions={<><div className="contents" ref={setActionsSlot} />{actions && !actionsSlot ? <HeaderButtonSkeleton label={t(actions.label)} trailingIcon={actions.trailingIcon ?? false} /> : null}</>} title={current ? t(`nav:${current.titleKey}`) : t(level === "account" ? "nav:sidebar.account" : level === "business" ? "nav:items.business" : "nav:sidebar.workspace")} />
      <div className="w-full"><HeaderActionsSlotContext.Provider value={actionsSlot}><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></HeaderActionsSlotContext.Provider></div>
    </section>
  );
}

export function WorkspaceLevelShell({ children }: { children: React.ReactNode }) {
  return <SettingsLevelShell level="workspace">{children}</SettingsLevelShell>;
}

export function BusinessLevelShell({ children }: { children: React.ReactNode }) {
  return <SettingsLevelShell level="business">{children}</SettingsLevelShell>;
}

export function AccountLevelShell({ children }: { children: React.ReactNode }) {
  return <SettingsLevelShell level="account">{children}</SettingsLevelShell>;
}
