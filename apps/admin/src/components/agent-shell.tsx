"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { HeaderActionsSlotContext } from "@/components/header-actions";
import { HeaderButtonSkeleton, HeaderSearchSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";

export function AgentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("agent");
  const { t: tEmployees } = useTranslation("employees");
  const section = pathname.includes("/knowledge") ? "knowledge" : pathname.includes("/services") ? "services" : pathname.includes("/employees") ? "employees" : pathname.includes("/rules") ? "rules" : "basicSettings";
  // These pages put a search box and an add button in the header, but only once the slot below exists. Until then, which includes the server render, the header shows placeholders for them.
  const hasActions = section !== "basicSettings";
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader actions={<><div className="contents" ref={setActionsSlot} />{hasActions && !actionsSlot ? <><HeaderSearchSkeleton /><HeaderButtonSkeleton label={section === "employees" ? tEmployees("add.button") : t(`sections.${section}.addKnowledge`)} trailingIcon={section === "knowledge"} /></> : null}</>} description={t(`sections.${section}.description`)} title={t(`sections.${section}.title`)} />
      <div className="w-full"><HeaderActionsSlotContext.Provider value={actionsSlot}><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></HeaderActionsSlotContext.Provider></div>
    </section>
  );
}
