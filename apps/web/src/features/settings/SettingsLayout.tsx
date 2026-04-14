import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
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
      : location.pathname === "/settings/billing"
        ? {
            title: t("sections.billing"),
            description: t("layout.billingDescription"),
          }
      : {
            title: t("sections.business"),
            description: t("layout.businessDescription"),
          };

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader description={header.description} title={header.title} />
        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
