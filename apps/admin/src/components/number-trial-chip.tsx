"use client";

import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useOpenUpgradePlanDialog } from "@/components/upgrade-plan-dialog-context";
import { useNumberTrial } from "@/components/number-trial-banner";
import { cn } from "@/lib/utils";

/**
 * The trial's countdown in the sidebar footer and the phone's menu sheet, for
 * as long as the trial runs, with the plans one click away. Like the banner,
 * only people who can see billing get it, so a partner's business never shows
 * it. `openWith` lets the sheet close itself before the plans open.
 */
export function NumberTrialChip({ className, openWith }: { className?: string; openWith?: (openPlans: () => void) => void }) {
  const { t } = useTranslation("common");
  const openUpgrade = useOpenUpgradePlanDialog();
  const state = useNumberTrial();
  if (state?.status !== "active") return null;
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 group-data-[collapsible=icon]:hidden", className)} role="status">
      <span className="flex min-w-0 items-center gap-2 type-label text-sidebar-foreground">
        <Clock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{t("numberTrial.chip", { count: state.daysLeft })}</span>
      </span>
      <Button className="shrink-0" onClick={() => (openWith ? openWith(openUpgrade) : openUpgrade())} size="xs" type="button" variant="link">{t("numberTrial.viewPlans")}</Button>
    </div>
  );
}
