"use client";

import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { useBusinessCan } from "@/components/business-capabilities-provider";
import { useTelemetry } from "@/components/product-analytics";
import { useOpenUpgradePlanDialog } from "@/components/upgrade-plan-dialog-context";
import { isWebsiteImportRunning, type WebsiteImportSummary } from "@/components/website-import-progress";
import { requestJson } from "@/lib/request-json";
import { useCallSettleRefetch } from "@/lib/use-call-settle-refetch";

export type Activation = {
  deploymentMode: string;
  plan: string;
  paidPlanLive: boolean;
  hasDedicatedNumber: boolean;
  completedWebCalls: number;
  lastTestCall?: { id: string; startedAt: string; durationSeconds: number } | null;
  country?: string | null;
  widgetsEnabled?: boolean;
  websiteImport: WebsiteImportSummary | null;
};

const REPORTED_FIRST_CALL_KEY = "lobbystack.activation.firstCallReported";

/**
 * PostHog needs one event the first time an operator hears their own agent.
 * The browser is the only place that knows whether this person has seen it, so
 * the marker is per browser: a second device re-reports at most once.
 */
function readReportedBusinesses(): string[] {
  try {
    const raw = window.localStorage.getItem(REPORTED_FIRST_CALL_KEY);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

function markReported(businessId: string): void {
  try {
    const current = readReportedBusinesses();
    if (current.includes(businessId)) return;
    window.localStorage.setItem(REPORTED_FIRST_CALL_KEY, JSON.stringify([...current, businessId]));
  } catch {
    // A browser with storage blocked still gets the prompt; it may re-report the event.
  }
}

function hasReported(businessId: string): boolean {
  return readReportedBusinesses().includes(businessId);
}

async function getActivation(businessId: string): Promise<Activation> {
  const response = await fetch(`/api/activation?businessId=${encodeURIComponent(businessId)}`, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load activation status.");
  return await response.json() as Activation;
}

/**
 * Where the business stands on the way to its first real caller, and the
 * activation funnel's events. The normal Home's card and the new-account Home
 * both read it, so an account fires the same events on either.
 */
export function useActivation(businessId: string | undefined) {
  const telemetry = useTelemetry();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const callSettleInterval = useCallSettleRefetch();
  // Each next step here is setup, which an activity-only business leaves to its partner.
  const canSetUp = useBusinessCan()("setup");

  const activation = useQuery({
    queryKey: ["activation", businessId],
    enabled: Boolean(businessId) && canSetUp,
    queryFn: () => getActivation(businessId!),
    refetchInterval: query => {
      if (isWebsiteImportRunning(query.state.data?.websiteImport)) return 2500;
      // A call just ended in this tab: poll briefly until the worker records it.
      return callSettleInterval();
    },
  });

  // The same request as the trial banner, so the two share one cached answer.
  const trial = useQuery({ queryKey: ["number-trial", businessId], enabled: Boolean(businessId) && canSetUp, queryFn: () => requestJson<{ trial: { status: string; e164?: string } }>(`/api/number-trial?businessId=${encodeURIComponent(businessId!)}`) });
  const trialNumber = trial.data?.trial?.status === "active" ? trial.data.trial.e164 ?? null : null;
  const trialAvailable = trial.data?.trial?.status === "available";

  const data = activation.data;
  // Self-hosting is carried by the business, not the billing row: a self-hosted
  // workspace has no hosted plan to sell and claims no numbers from us. The
  // events below report this funnel, so they obey the same rule as the card's
  // render; otherwise they fire for a card nobody sees.
  const eligible = Boolean(data && !data.hasDedicatedNumber && data.deploymentMode === "cloud");
  const heardItWork = (data?.completedWebCalls ?? 0) > 0;
  // Someone already paying who skipped the number step needs the claiming
  // screen; the upgrade dialog disables their current plan and hands out no numbers.
  const needsNumberClaim = Boolean(data?.paidPlanLive);
  // A live trial number already answers; the next step is forwarding the real line to it, and the banner asks for a plan.
  const showsUpgrade = eligible && heardItWork && !needsNumberClaim && !trialNumber && !trialAvailable;

  useEffect(() => {
    // Marking an ineligible workspace would also suppress the real report once
    // it becomes eligible, since the marker is per browser.
    if (!businessId || !eligible || !heardItWork || hasReported(businessId)) return;
    markReported(businessId);
    telemetry.track("web.activation.first_call_completed", { businessId, transport: "web_voice" });
  }, [businessId, eligible, heardItWork, telemetry]);

  useEffect(() => {
    if (!businessId || !showsUpgrade) return;
    telemetry.track("web.activation.upgrade_prompt_shown", { businessId, trigger: "first_call_completed" });
  }, [businessId, showsUpgrade, telemetry]);

  const upgrade = useCallback(() => {
    if (businessId) telemetry.track("web.activation.upgrade_prompt_clicked", { businessId, trigger: "first_call_completed" });
    openUpgradePlanDialog();
  }, [businessId, openUpgradePlanDialog, telemetry]);

  return { canSetUp, data, eligible, heardItWork, needsNumberClaim, trialAvailable, trialNumber, upgrade };
}
