"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export function AgentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("agent");
  const section = pathname.includes("/knowledge") ? "knowledge" : pathname.includes("/services") ? "services" : pathname.includes("/rules") ? "rules" : "basicSettings";
  const actionTarget = section === "knowledge" ? "#knowledge-source-form" : section === "services" ? "#service-form" : section === "rules" ? "#rule-form" : null;
  const actionLabel = section === "knowledge" ? t("sections.knowledge.addKnowledge") : section === "services" ? t("sections.services.addKnowledge") : section === "rules" ? t("sections.rules.addKnowledge") : null;
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader description={t(`sections.${section}.description`)} actions={actionTarget && actionLabel ? <Button nativeButton={false} render={<a href={actionTarget} />}><Plus data-icon="inline-start" />{actionLabel}</Button> : undefined} title={t(`sections.${section}.title`)} />
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}
