import { NavLink, Outlet } from "react-router-dom";
import { Link2, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type SettingsLayoutProps = {
  businessId?: Id<"businesses">;
};

export function SettingsLayout({ businessId }: SettingsLayoutProps) {
  const { t } = useTranslation("settings");

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const items = [
    { to: "/settings", icon: Settings2, label: t("sections.business") },
    { to: "/settings/integrations", icon: Link2, label: t("sections.integrations") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("layout.title")}</h1>
        <p className="text-muted-foreground">{t("layout.description")}</p>
      </div>
      <Separator />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
        <aside className="lg:sticky lg:top-24 lg:w-1/5">
          <nav className="flex flex-col gap-2">
            {items.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-muted" : "hover:bg-accent",
                  )
                }
                end={item.to === "/settings"}
                key={item.to}
                to={item.to}
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
