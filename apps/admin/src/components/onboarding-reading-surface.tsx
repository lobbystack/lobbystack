"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { resolveOnboardingRoute, stageAfterWebsite } from "@lobbystack/shared";

import { ReadingStatusSkeleton } from "@/components/loading-skeletons";
import { ImportWaitSlides, useImportWait } from "@/components/onboarding-import-wait";
import { currentWebsiteImport, isWebsiteImportRunning, websiteImportHost, websiteImportPercent, type WebsiteImportSummary } from "@/components/website-import-progress";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { requestJson } from "@/lib/request-json";
import { useStepNavigation } from "@/lib/use-step-navigation";

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
  // The phone step for a partner's owner, the number for a direct one.
  const nextStep = resolveOnboardingRoute(stageAfterWebsite(business ? { partnerId: business.partnerAccessLevel ? "partner" : null } : null));
  useEffect(() => { prefetch(nextStep); }, [nextStep, prefetch]);
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
  const { phase } = useImportWait(websiteImport, documents.isSuccess || documents.isError, Boolean(documentId));
  const over = phase === "ready" || phase === "waited";
  useEffect(() => { if (over) navigate(nextStep); }, [navigate, nextStep, over]);

  if (phase !== "waiting") return null;
  const status = documentId && documents.isPending
    ? <ReadingStatusSkeleton label={t("reading.status", { host: websiteImportHost(business?.websiteUrl ?? ""), count: 0 })} />
    : websiteImport && (!documentId || submitted?.websiteImport) ? <ReadingStatus job={websiteImport} /> : null;
  return <ImportWaitSlides status={status} />;
}

/** The site being read and how many pages are in, as a line and a bar under the slide. */
function ReadingStatus({ job }: { job: WebsiteImportSummary }) {
  const { t } = useTranslation("onboarding");
  return (
    <div aria-live="polite" className="flex flex-col gap-3">
      <p className="truncate text-center type-body text-muted-foreground">{t("reading.status", { host: websiteImportHost(job.websiteUrl), count: job.importedCount })}</p>
      <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${websiteImportPercent(job)}%` }} />
      </div>
    </div>
  );
}
