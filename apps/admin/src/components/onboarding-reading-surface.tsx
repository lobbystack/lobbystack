"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { ImportWaitSlides, useImportWait } from "@/components/onboarding-import-wait";
import { Button } from "@/components/ui/button";
import { currentWebsiteImport, isWebsiteImportRunning, WebsiteImportProgress, type WebsiteImportSummary } from "@/components/website-import-progress";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

const NEXT_STEP = "/onboarding/verify-phone";

type KnowledgeDocument = { id: string; createdAt?: string; websiteImport?: WebsiteImportSummary | null };

/** Shows while the import runs. With nothing running, the operator goes straight on. */
export function OnboardingReadingSurface() {
  const { t } = useTranslation("onboarding");
  const { navigate, prefetch } = useStepNavigation();
  const { business } = useActiveBusiness();
  const businessId = business?.businessId;
  useEffect(() => { prefetch(NEXT_STEP); }, [prefetch]);
  // A failed check must not hold anyone here, so it doesn't retry.
  const documents = useQuery({
    queryKey: ["onboarding-knowledge", businessId],
    queryFn: () => requestJson<{ documents: KnowledgeDocument[] }>(`/api/knowledge?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
    retry: false,
    refetchInterval: (query) => query.state.data?.documents?.some((document) => isWebsiteImportRunning(document.websiteImport)) ? 2000 : false,
  });
  const websiteImport = currentWebsiteImport(documents.data?.documents, business?.websiteUrl);
  const { phase, stopWaiting } = useImportWait(websiteImport, documents.isSuccess || documents.isError);
  const over = phase === "ready" || phase === "waited";
  useEffect(() => { if (over) navigate(NEXT_STEP); }, [navigate, over]);

  if (phase !== "waiting") return null;
  return (
    <div className="flex flex-col gap-4">
      {websiteImport ? <div aria-live="polite"><WebsiteImportProgress job={websiteImport} /></div> : null}
      <ImportWaitSlides />
      <Button className="h-11 w-full" onClick={stopWaiting} type="button" variant="ghost">{t("reading.skip")}</Button>
    </div>
  );
}
