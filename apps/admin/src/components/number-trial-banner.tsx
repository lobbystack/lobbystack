"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useBusinessCan } from "@/components/business-capabilities-provider";
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

/**
 * The trial number's state, for people who can see billing. Keeping the
 * number takes one of the host's plans, so a business without billing, such
 * as a partner's, never reads it.
 */
export function useNumberTrial(): TrialState | undefined {
  const { business } = useActiveBusiness();
  const can = useBusinessCan();
  const trial = useQuery({ queryKey: ["number-trial", business?.businessId], enabled: Boolean(business) && can("billing"), refetchInterval: 5 * 60_000, queryFn: () => requestJson<{ trial: TrialState }>(`/api/number-trial?businessId=${encodeURIComponent(business!.businessId)}`) });
  return can("billing") ? trial.data?.trial : undefined;
}

/**
 * Across the top of every dashboard page while the trial number needs the
 * owner: it ran out of minutes, so calls already go to them, or the trial
 * ended and the number is still theirs to keep. The days left show in the
 * sidebar's chip instead, so the banner never counts down.
 */
export function NumberTrialBanner() {
  const { t } = useTranslation("common");
  const openUpgrade = useOpenUpgradePlanDialog();
  const state = useNumberTrial();
  if (!state || state.status === "none" || state.status === "available" || state.status === "over") return null;
  if (state.status === "active" && !(state.minutesExhausted && state.forwardTo)) return null;
  const [message, action] = state.status === "ended"
    ? [t("numberTrial.stillAvailable", { number: formatPhoneNumberDisplay(state.e164) }), t("numberTrial.getNumberBack")]
    : [t("numberTrial.outOfMinutes", { forwardTo: formatPhoneNumberDisplay(state.forwardTo!) }), t("numberTrial.getReceptionistBack")];
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
