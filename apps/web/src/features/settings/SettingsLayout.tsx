import { Outlet } from "react-router-dom";
import { Link2, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { SidebarNav } from "@/features/settings/components/sidebar-nav";
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

  const items = [
    { href: "/settings", icon: <Settings2 size={18} />, title: t("sections.business") },
    { href: "/settings/integrations", icon: <Link2 size={18} />, title: t("sections.integrations") },
  ];

  return (
    <div>
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t("layout.title")}</h1>
        <p className="text-muted-foreground">{t("layout.description")}</p>
      </div>
      <Separator className="my-4 lg:my-6" />
      <div className="flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-12">
        <aside className="top-0 lg:sticky lg:w-1/5">
          <SidebarNav items={items} />
        </aside>
        <div className="flex w-full overflow-y-hidden p-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
