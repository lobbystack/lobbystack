"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { WebsiteImportProgressSkeleton } from "@/components/loading-skeletons";
import { ImportWaitSlides, useImportWait } from "@/components/onboarding-import-wait";
import { Button } from "@/components/ui/button";
import { currentWebsiteImport, isWebsiteImportRunning, WebsiteImportProgress, type WebsiteImportSummary } from "@/components/website-import-progress";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

const NEXT_STEP = "/onboarding/verify-phone";

type KnowledgeDocument = { id: string; createdAt?: string; websiteImport?: WebsiteImportSummary | null };

/**
 * Shows while the import runs. Right after the website step the wait starts at
 * once and follows the document that was just submitted, so an import that is
 * still being created is not mistaken for no import at all. With nothing
 * submitted, the operator goes straight on.
 */
export function OnboardingReadingSurface({ documentId }: { documentId?: string | undefined }) {
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
    refetchInterval: (query) => {
      const list = query.state.data?.documents;
      if (list?.some((document) => isWebsiteImportRunning(document.websiteImport))) return 2000;
      // Keep looking for the submitted document, or for the import it queued.
      if (documentId && list) {
        const submitted = list.find((document) => document.id === documentId);
        if (!submitted?.websiteImport) return 2000;
      }
      return false;
    },
  });
  const submitted = documentId ? documents.data?.documents.find((document) => document.id === documentId) : undefined;
  // A submitted website without its import yet still counts as a running one,
  // so the wait holds until the worker's first progress or the time limit.
  const submittedImport = documentId && documents.isSuccess ? submitted?.websiteImport ?? { status: "queued", websiteUrl: business?.websiteUrl ?? "", importedCount: 0, indexedCount: 0 } : null;
  const websiteImport = documentId ? submittedImport : currentWebsiteImport(documents.data?.documents, business?.websiteUrl);
  const { phase, stopWaiting } = useImportWait(websiteImport, documents.isSuccess || documents.isError, Boolean(documentId));
  const over = phase === "ready" || phase === "waited";
  useEffect(() => { if (over) navigate(NEXT_STEP); }, [navigate, over]);

  if (phase !== "waiting") return null;
  return (
    <div className="flex flex-col gap-4">
      {documentId && documents.isPending ? <WebsiteImportProgressSkeleton /> : websiteImport && (!documentId || submitted?.websiteImport) ? <div aria-live="polite"><WebsiteImportProgress job={websiteImport} /></div> : null}
      <ImportWaitSlides />
      <Button className="w-full" onClick={stopWaiting} type="button" variant="ghost">{t("reading.skip")}</Button>
    </div>
  );
}
