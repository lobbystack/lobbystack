import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";

type AgentLayoutProps = {
  businessId?: Id<"businesses">;
};

export function AgentLayout({ businessId }: AgentLayoutProps) {
  const { t } = useTranslation("agent");
  const location = useLocation();

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const header =
    location.pathname === "/agent/basic-settings" || location.pathname === "/agent"
      ? {
          title: t("sections.basicSettings.title"),
          description: t("sections.basicSettings.description"),
        }
      : {
          title: t("page.title"),
          description: t("page.description"),
        };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 py-2">
        <div>
          <h1 className="text-2xl font-bold">{header.title}</h1>
          <p className="text-sm text-muted-foreground">{header.description}</p>
        </div>
      </div>
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
