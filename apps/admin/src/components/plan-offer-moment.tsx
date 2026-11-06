"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { useTelemetry } from "@/components/product-analytics";
import { usePlanOfferOpener } from "@/components/upgrade-plan-dialog-context";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { isTestCallActive } from "@/lib/test-window";
import { useCallSettleRefetch } from "@/lib/use-call-settle-refetch";

const SESSION_KEY = "lobbystack.planOffer.shown";

// A browser with storage blocked falls back to this, which lasts until the page reloads.
const shownThisPage = new Set<string>();

function shownThisSession(businessId: string): boolean {
  if (shownThisPage.has(businessId)) return true;
  try {
    return (window.sessionStorage.getItem(SESSION_KEY) ?? "").split(",").includes(businessId);
  } catch {
    return false;
  }
}

function markShownThisSession(businessId: string): void {
  shownThisPage.add(businessId);
  try {
    const current = window.sessionStorage.getItem(SESSION_KEY);
    window.sessionStorage.setItem(SESSION_KEY, current ? `${current},${businessId}` : businessId);
  } catch {
    // The set above still covers this page.
  }
}

/**
 * Opens the plans once, right after the operator's first test that worked. The
 * server decides who is due them. It renders nothing, and it needs the upgrade
 * dialog's provider above it.
 */
export function PlanOfferMoment({ businessId, surface }: { businessId: string; surface: "home" }) {
  const telemetry = useTelemetry();
  const openOffer = usePlanOfferOpener();
  const settleInterval = useCallSettleRefetch();
  const offer = useQuery({
    queryKey: ["plan-offer", businessId],
    queryFn: () => requestJson<{ due: boolean }>(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`),
    refetchInterval: () => settleInterval(),
    retry: false,
  });
  const markShown = useMutation({
    mutationFn: (dismissed: boolean) => requestJson(`/api/plan-offer?businessId=${encodeURIComponent(businessId)}`, { method: "POST", body: JSON.stringify(dismissed ? { dismissed: true } : {}) }),
    meta: { inlineError: true },
  });
  const { mutate: recordShown } = markShown;
  const due = offer.data?.due === true;
  useEffect(() => {
    // A running call waits: the check runs again when the poll after it answers.
    if (!due || !openOffer || shownThisSession(businessId) || isTestCallActive()) return;
    markShownThisSession(businessId);
    recordShown(false);
    telemetry.track("web.onboarding.plan_offer_shown", { businessId, surface });
    openOffer({
      onDismiss: () => {
        recordShown(true);
        telemetry.track("web.onboarding.plan_offer_dismissed", { businessId, surface });
      },
      onPlanClicked: (plan) => telemetry.track("web.onboarding.plan_offer_clicked", { businessId, surface, plan }),
    });
  }, [businessId, due, offer.dataUpdatedAt, openOffer, recordShown, surface, telemetry]);
  return null;
}

/** The same moment on Home, for a test that ended anywhere in the dashboard. */
export function HomePlanOffer() {
  const can = useBusinessCan();
  const businessId = useActiveBusiness().business?.businessId;
  return businessId && can("billing") ? <PlanOfferMoment businessId={businessId} surface="home" /> : null;
}
