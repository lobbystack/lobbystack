"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { getTestCallStarter, startTestCall, subscribeTestCallStarter } from "@/lib/test-call-launcher";
import { Button } from "./ui/button";
import { Surface } from "./ui/surface";
import { useOpenUpgradePlanDialog } from "./upgrade-plan-dialog-context";
import { isWebsiteImportRunning, websiteImportHost, WebsiteImportProgress, type WebsiteImportSummary } from "./website-import-progress";

type Activation = {
  plan: string;
  subscriptionState: string | null;
  hasDedicatedNumber: boolean;
  completedWebCalls: number;
  firstCompletedWebCallAt: string | null;
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

  const activation = useQuery({
    queryKey: ["activation", businessId],
    enabled: Boolean(businessId),
    queryFn: () => getActivation(businessId!),
    refetchInterval: query => isWebsiteImportRunning(query.state.data?.websiteImport) ? 2500 : false,
  });

  const data = activation.data;
  const heardItWork = (data?.completedWebCalls ?? 0) > 0;
  const showsUpgrade = Boolean(data && !data.hasDedicatedNumber && heardItWork);

  useEffect(() => {
    if (!businessId || !data || !heardItWork || hasReported(businessId)) return;
    markReported(businessId);
    telemetry.track("web.activation.first_call_completed", { businessId, transport: "web_voice" });
  }, [businessId, data, heardItWork, telemetry]);

  useEffect(() => {
    if (!businessId || !showsUpgrade) return;
    telemetry.track("web.activation.upgrade_prompt_shown", { businessId, trigger: "first_call_completed" });
  }, [businessId, showsUpgrade, telemetry]);

  const upgrade = useCallback(() => {
    if (businessId) telemetry.track("web.activation.upgrade_prompt_clicked", { businessId, trigger: "first_call_completed" });
    openUpgradePlanDialog();
  }, [businessId, openUpgradePlanDialog, telemetry]);

  if (!businessId || !data || data.hasDedicatedNumber || data.plan === "self_host") return null;

  if (isWebsiteImportRunning(data.websiteImport)) {
    return <WebsiteImportProgress job={data.websiteImport!} />;
  }

  const pagesRead = data.websiteImport?.status === "completed" ? data.websiteImport.indexedCount || data.websiteImport.importedCount : 0;
  const host = data.websiteImport ? websiteImportHost(data.websiteImport.websiteUrl) : null;

  return (
    <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          {heardItWork ? <Phone className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-card-title text-foreground">
            {heardItWork ? t("activation.upgrade.title") : t("activation.hearIt.title")}
          </p>
          <p className="type-body-muted">
            {heardItWork
              ? t("activation.upgrade.description")
              : pagesRead && host
                ? t("activation.hearIt.descriptionWithPages", { count: pagesRead, host })
                : t("activation.hearIt.description")}
          </p>
        </div>
      </div>
      {heardItWork
        ? <Button className="shrink-0" onClick={upgrade} type="button">{t("activation.upgrade.cta")}</Button>
        : canStartTestCall
          ? <Button className="shrink-0" onClick={() => startTestCall()} type="button" variant="outline"><Phone />{t("activation.hearIt.cta")}</Button>
          : null}
    </Surface>
  );
}
