"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { PageHeader } from "@/components/page-header";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";

export function AgentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("agent");
  const section = pathname.includes("/knowledge") ? "knowledge" : pathname.includes("/services") ? "services" : pathname.includes("/employees") ? "employees" : pathname.includes("/rules") ? "rules" : "basicSettings";
  const { business } = useActiveBusiness();
  // Same key and request as the services table, so they share one cached list.
  const catalog = useQuery({
    queryKey: ["catalog", business?.businessId],
    enabled: section === "services" && Boolean(business),
    queryFn: () => requestJson<{ services: unknown[] }>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}&limit=100`),
  });
  const count = section === "services" ? catalog.data?.services.length : undefined;
  const title = t(`sections.${section}.title`);
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader description={t(`sections.${section}.description`)} title={count === undefined ? title : <span className="flex items-baseline gap-2">{title}<span className="font-normal text-muted-foreground tabular-nums">({count})</span></span>} />
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}
