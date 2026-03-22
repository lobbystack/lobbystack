import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";


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
