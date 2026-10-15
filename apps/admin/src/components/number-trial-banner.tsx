"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useOpenUpgradePlanDialog } from "@/components/upgrade-plan-dialog-context";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type TrialState =
  | { status: "none" }
  | { status: "available" }
  | { status: "over" }
  | { status: "active"; e164: string; daysLeft: number; minutesExhausted: boolean; forwardTo: string | null }
  | { status: "ended"; e164: string };

/** The trial number's countdown, across the top of every dashboard page in the trial's last week, until the owner picks a plan. */
export function NumberTrialBanner() {
  const { t } = useTranslation("common");
  const openUpgrade = useOpenUpgradePlanDialog();
  const { business } = useActiveBusiness();
  const trial = useQuery({ queryKey: ["number-trial", business?.businessId], enabled: Boolean(business), refetchInterval: 5 * 60_000, queryFn: () => requestJson<{ trial: TrialState }>(`/api/number-trial?businessId=${encodeURIComponent(business!.businessId)}`) });
  const state = trial.data?.trial;
  if (!state || state.status === "none" || state.status === "available" || state.status === "over") return null;
  // The countdown waits for the last week; running out of minutes shows at once, since calls already go to the owner.
  if (state.status === "active" && state.daysLeft > 7 && !(state.minutesExhausted && state.forwardTo)) return null;
  const number = formatPhoneNumberDisplay(state.e164);
  const [message, action] = state.status === "ended"
    ? [t("numberTrial.stillAvailable", { number }), t("numberTrial.getNumberBack")]
    : state.minutesExhausted && state.forwardTo
      ? [t("numberTrial.outOfMinutes", { forwardTo: formatPhoneNumberDisplay(state.forwardTo) }), t("numberTrial.getReceptionistBack")]
      : [t("numberTrial.daysLeft", { number, count: state.daysLeft }), t("numberTrial.keepNumber")];
  return (
    <div aria-live="polite" className="relative z-30 w-full shrink-0 border-b border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100" role="status">
      <div className="flex w-full flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Clock aria-hidden="true" className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-medium">{message}</p>
        </div>
        <Button className="shrink-0" onClick={openUpgrade} size="sm" type="button">{action}</Button>
      </div>
    </div>
  );
}
