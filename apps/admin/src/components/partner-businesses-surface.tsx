"use client";

import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/page-header";
import { Surface } from "@/components/ui/surface";

/** The console's Businesses page. A partner has none until it can create them. */
export function PartnerBusinessesSurface() {
  const { t } = useTranslation("partner");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("businesses.title")} />
      <Surface className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Building2 className="size-5" />
        </span>
        <h2 className="text-base font-medium">{t("businesses.empty.title")}</h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{t("businesses.empty.description")}</p>
      </Surface>
    </div>
  );
}
