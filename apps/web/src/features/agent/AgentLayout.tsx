import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";

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
    <div>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{header.title}</h1>
        <p className="text-muted-foreground">{header.description}</p>
      </div>
      <Separator className="my-4 lg:my-6" />
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
