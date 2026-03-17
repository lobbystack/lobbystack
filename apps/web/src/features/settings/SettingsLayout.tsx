import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";

type SettingsLayoutProps = {
  businessId?: Id<"businesses">;
};

export function SettingsLayout({ businessId }: SettingsLayoutProps) {
  const { t } = useTranslation("settings");
  const location = useLocation();

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const header =
    location.pathname === "/settings/appearance"
      ? {
          title: t("appearance.title"),
          description: t("appearance.description"),
        }
      : location.pathname === "/settings/integrations"
        ? {
            title: t("sections.integrations"),
            description: t("layout.integrationsDescription"),
          }
        : {
            title: t("sections.business"),
            description: t("layout.businessDescription"),
          };

  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{header.title}</h1>
        <p className="text-muted-foreground">{header.description}</p>
      </div>
      <Separator className="my-4 lg:my-6" />
      <div className="w-full">
        <Outlet />
      </div>
    </div>
  );
}
