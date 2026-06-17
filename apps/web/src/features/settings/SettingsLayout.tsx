import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../../convex/_generated/dataModel";

type SettingsLayoutProps = {
  businessId?: Id<"businesses">;
};

export function SettingsLayout({ businessId }: SettingsLayoutProps) {
  const { t } = useTranslation("settings");

  if (!businessId) {
    return null;
  }

  const navigationItems = [
    { label: t("sections.usage"), to: "/settings/usage" },
    { label: t("sections.billing"), to: "/settings/plan" },
    { label: t("sections.business"), to: "/settings/team" },
    { label: t("sections.phoneNumber"), to: "/settings/phone-number" },
    { label: t("sections.appearance"), to: "/settings/appearance" },
    { label: t("sections.notifications"), to: "/settings/notifications" },
  ] as const;

  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("header.title")} />
      <nav
        aria-label={t("header.title")}
        className="overflow-x-auto pb-1"
      >
        <div className="flex min-w-max items-center gap-2">
          {navigationItems.map((item) => (
            <NavLink
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )
                }
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="w-full">
        <Outlet />
      </div>
    </section>
  );
}
