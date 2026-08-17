"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation("settings");
  const items = [
    { label: t("sections.usage"), href: "/settings/usage" },
    { label: t("sections.billing"), href: "/settings/plan" },
    { label: t("sections.business"), href: "/settings/team" },
    { label: t("sections.phoneNumber"), href: "/settings/phone-number" },
    { label: t("sections.appearance"), href: "/settings/appearance" },
    { label: t("sections.notifications"), href: "/settings/notifications" },
    { label: t("sections.widget"), href: "/settings/widget" },
  ];
  return (
    <section className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("header.title")} />
      <nav aria-label={t("header.title")} className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-2">
          {items.map((item) => <Link className={cn("inline-flex h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors", pathname === item.href || pathname.startsWith(`${item.href}/`) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")} href={item.href} key={item.href}>{item.label}</Link>)}
        </div>
      </nav>
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}
