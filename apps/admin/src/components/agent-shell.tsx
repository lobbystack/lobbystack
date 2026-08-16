"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { PageHeader } from "@/components/page-header";

export function AgentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("agent");
  const section = pathname.includes("/knowledge") ? "knowledge" : pathname.includes("/services") ? "services" : pathname.includes("/rules") ? "rules" : "basicSettings";
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={t(`sections.${section}.title`)} />
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}
