"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { HeaderActionsSlotContext } from "@/components/header-actions";
import { HeaderButtonSkeleton, HeaderSearchSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { ACCOUNT_PAGES, WORKSPACE_PAGES } from "@/lib/settings-pages";

// Pages that put a search box and an add button in the header, with the add button's label.
const HEADER_ACTIONS: Record<string, { label: string; trailingIcon?: boolean }> = {
  "/workspace/knowledge": { label: "agent:sections.knowledge.addKnowledge", trailingIcon: true },
  "/workspace/services": { label: "agent:sections.services.addKnowledge" },
  "/workspace/employees": { label: "employees:add.button" },
};

/**
 * The header of one settings level's pages, titled with the page open. Pages
 * with a search box and an add button put them in the header once the slot
 * below exists; until then, which includes the server render, the header
 * shows placeholders for them.
 */
function SettingsLevelShell({ children, level }: { children: React.ReactNode; level: "account" | "workspace" }) {
  const pathname = usePathname();
  const { t } = useTranslation(["nav", "agent", "employees"]);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const pages = level === "account" ? ACCOUNT_PAGES : WORKSPACE_PAGES;
  const current = pages.find((page) => pathname === page.href) ?? pages.find((page) => pathname.startsWith(`${page.href}/`));
  const actions = HEADER_ACTIONS[pathname];
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader actions={<><div className="contents" ref={setActionsSlot} />{actions && !actionsSlot ? <><HeaderSearchSkeleton /><HeaderButtonSkeleton label={t(actions.label)} trailingIcon={actions.trailingIcon ?? false} /></> : null}</>} title={current ? t(`nav:${current.titleKey}`) : t(level === "account" ? "nav:sidebar.account" : "nav:sidebar.workspace")} />
      <div className="w-full"><HeaderActionsSlotContext.Provider value={actionsSlot}><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></HeaderActionsSlotContext.Provider></div>
    </section>
  );
}

export function WorkspaceLevelShell({ children }: { children: React.ReactNode }) {
  return <SettingsLevelShell level="workspace">{children}</SettingsLevelShell>;
}

export function AccountLevelShell({ children }: { children: React.ReactNode }) {
  return <SettingsLevelShell level="account">{children}</SettingsLevelShell>;
}
