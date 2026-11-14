"use client";

import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useOpenUpgradePlanDialog } from "@/components/upgrade-plan-dialog-context";
import { useNumberTrial } from "@/components/number-trial-banner";
import { intlLocale } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * The trial's card in the sidebar footer and the phone's menu sheet, for as
 * long as the trial runs, with the plans one click away. It counts the days
 * down, or says the minutes ran out. Like the banner, only people who can see
 * billing get it, so a partner's business never shows it. In the sidebar,
 * `collapsible` swaps it for an icon button when the sidebar folds to icons,
 * like the account menu beside it. `openWith` lets the sheet close itself
 * before the plans open.
 */
export function NumberTrialCard({ className, collapsible = false, openWith }: { className?: string; collapsible?: boolean; openWith?: (openPlans: () => void) => void }) {
  const { t, i18n } = useTranslation("common");
  const openUpgrade = useOpenUpgradePlanDialog();
  const state = useNumberTrial();
  if (state?.status !== "active") return null;
  const openPlans = () => (openWith ? openWith(openUpgrade) : openUpgrade());
  const title = t("numberTrial.title");
  const remaining = state.minutesExhausted
    ? t("numberTrial.noMinutesLeft")
    : t("numberTrial.daysLeft", { count: state.daysLeft, days: new Intl.NumberFormat(intlLocale(i18n.language)).format(state.daysLeft) });
  const description = state.minutesExhausted
    ? state.forwardTo ? t("numberTrial.callsGoTo", { forwardTo: formatPhoneNumberDisplay(state.forwardTo) }) : t("numberTrial.answerAgain")
    : t("numberTrial.keepNumber", { number: formatPhoneNumberDisplay(state.e164) });
  return (
    <>
      <Card className={cn(collapsible && "group-data-[collapsible=icon]:hidden", className)} role="status" size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="flex items-center gap-2 type-item-title">
              <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              {title}
            </span>
            <span className="type-caption text-muted-foreground">{remaining}</span>
          </div>
          <p className="type-caption text-muted-foreground">{description}</p>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={openPlans} size="sm" type="button" variant="secondary">{t("numberTrial.viewPlans")}</Button>
        </CardFooter>
      </Card>
      {collapsible ? (
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={t("numberTrial.viewPlans")}
              className="group-data-[collapsible=icon]:justify-center"
              onClick={openPlans}
              tooltip={{ children: <span className="flex flex-col"><span>{title}</span><span>{remaining}</span></span> }}
              type="button"
            >
              <Clock aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : null}
    </>
  );
}
