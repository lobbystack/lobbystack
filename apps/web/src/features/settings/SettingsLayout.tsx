import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";

type SettingsLayoutProps = {
  businessId?: Id<"businesses">;
};

export function SettingsLayout({ businessId }: SettingsLayoutProps) {
  const { t } = useTranslation("settings");

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div>
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("layout.title")}</h1>
        <p className="text-muted-foreground">{t("layout.description")}</p>
      </div>
      <Separator className="my-4 lg:my-6" />
      <div className="w-full p-1">
        <Outlet />
      </div>
    </div>
  );
}
