"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { getTestCallStarter, startTestCall, subscribeTestCallStarter } from "@/lib/test-call-launcher";
import { useCallSettleRefetch } from "@/lib/use-call-settle-refetch";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { isWebsiteImportRunning, websiteImportHost, WebsiteImportProgress, type WebsiteImportSummary } from "./website-import-progress";

type Activation = {
  deploymentMode: string;
  plan: string;
  paidPlanLive: boolean;
  hasDedicatedNumber: boolean;
  completedWebCalls: number;
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

export function DashboardActivationCard({ businessId }: { businessId: string | undefined }) {
  const { t } = useTranslation("dashboard");
  const telemetry = useTelemetry();
  const openUpgradePlanDialog = useOpenUpgradePlanDialog();
  const canStartTestCall = useSyncExternalStore(subscribeTestCallStarter, () => getTestCallStarter() !== null, () => false);
  const callSettleInterval = useCallSettleRefetch();

  const activation = useQuery({
    queryKey: ["activation", businessId],
    enabled: Boolean(businessId),
    queryFn: () => getActivation(businessId!),
    refetchInterval: query => {
      if (isWebsiteImportRunning(query.state.data?.websiteImport)) return 2500;
      // A call just ended in this tab: poll briefly until the gateway records it.
      return callSettleInterval();
    },
  });

  const data = activation.data;
  // Self-hosting is carried by the business, not the billing row: a self-hosted
  // workspace has no hosted plan to sell and claims no numbers from us. The
  // events below report this card's funnel, so they obey the same rule as its
  // render; otherwise they fire for a card nobody sees.
  const eligible = Boolean(data && !data.hasDedicatedNumber && data.deploymentMode === "cloud");
  const heardItWork = (data?.completedWebCalls ?? 0) > 0;
  // Someone already paying who skipped the number step needs the claiming
  // screen; the upgrade dialog disables their current plan and hands out no numbers.
  const needsNumberClaim = Boolean(data?.paidPlanLive);
  const showsUpgrade = eligible && heardItWork && !needsNumberClaim;

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

  if (!businessId || !data || !eligible) return null;

  if (isWebsiteImportRunning(data.websiteImport)) {
    return <WebsiteImportProgress job={data.websiteImport!} />;
  }

  const pagesRead = data.websiteImport?.status === "completed" ? data.websiteImport.indexedCount || data.websiteImport.importedCount : 0;
  const host = data.websiteImport ? websiteImportHost(data.websiteImport.websiteUrl) : null;

  return (
    <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="type-card-title text-foreground">
          {!heardItWork ? t("activation.hearIt.title") : needsNumberClaim ? t("activation.claimNumber.title") : t("activation.upgrade.title")}
        </p>
        <p className="type-body-muted">
          {!heardItWork
            ? pagesRead && host
              ? t("activation.hearIt.descriptionWithPages", { count: pagesRead, host })
              : t("activation.hearIt.description")
            : needsNumberClaim
              ? t("activation.claimNumber.description")
              : t("activation.upgrade.description")}
        </p>
      </div>
      {!heardItWork
        ? canStartTestCall
          ? <Button className="shrink-0" onClick={() => startTestCall()} type="button" variant="outline"><Phone />{t("activation.hearIt.cta")}</Button>
          : null
        : needsNumberClaim
          ? <Button className="shrink-0" nativeButton={false} render={<Link href="/settings/phone-number" />}>{t("activation.claimNumber.cta")}</Button>
          : <Button className="shrink-0" onClick={upgrade} type="button">{t("activation.upgrade.cta")}</Button>}
    </Surface>
  );
}
