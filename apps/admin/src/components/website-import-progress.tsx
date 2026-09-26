"use client";

import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Surface } from "./ui/surface";

export type WebsiteImportSummary = {
  status: string;
  websiteUrl: string;
  importedCount: number;
  indexedCount: number;
};

const RUNNING_STATUSES = ["queued", "crawling", "indexing"];

export function isWebsiteImportRunning(job: WebsiteImportSummary | null | undefined): boolean {
  return Boolean(job && RUNNING_STATUSES.includes(job.status));
}

export function websiteImportHost(websiteUrl: string): string {
  try {
    return new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`).host;
  } catch {
    return websiteUrl;
  }
}

/**
 * Picks the crawl to show. The knowledge list comes back ordered by title, so
 * an operator who abandoned one URL and submitted another would otherwise watch
 * whichever site happens to sort first.
 */
export function latestWebsiteImport<T extends { createdAt?: string; websiteImport?: WebsiteImportSummary | null }>(documents: T[] | undefined): WebsiteImportSummary | null {
  const imports = (documents ?? []).filter((document) => document.websiteImport);
  if (imports.length === 0) return null;
  const newest = imports.reduce((latest, document) => (document.createdAt ?? "") > (latest.createdAt ?? "") ? document : latest);
  return newest.websiteImport ?? null;
}

/**
 * Crawl progress is written by the worker as it reads a site, so the operator
 * can watch their agent learn instead of waiting in front of a blank step.
 */
export function WebsiteImportProgress({ job }: { job: WebsiteImportSummary }) {
  // These strings live in common: the card renders on the dashboard too, and
  // the dashboard does not carry the onboarding namespace.
  const { t } = useTranslation("common");
  const host = websiteImportHost(job.websiteUrl);
  const failed = job.status === "failed" || job.status === "cancelled";
  const done = job.status === "completed";
  const percent = failed ? 100 : done ? 100 : job.status === "indexing" ? Math.min(95, 60 + Math.round((job.indexedCount / Math.max(job.importedCount, 1)) * 35)) : job.status === "crawling" ? 35 : 10;

  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {failed || done ? (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            {failed ? <TriangleAlert className="size-4 text-destructive" /> : <CheckCircle2 className="size-4" />}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-medium">
            {failed
              ? t("websiteImport.failedTitle", { host })
              : done
                ? t("websiteImport.doneTitle", { host })
                : t("websiteImport.runningTitle", { host })}
          </p>
          <p className="text-xs text-muted-foreground">
            {failed
              ? t("websiteImport.failedHint")
              : done
                ? t("websiteImport.doneHint", { count: job.indexedCount || job.importedCount })
                : t("websiteImport.runningHint", { imported: job.importedCount, indexed: job.indexedCount })}
          </p>
        </div>
        {isWebsiteImportRunning(job) ? <LoaderCircle aria-hidden="true" className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>
      {failed ? null : (
        <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      )}
    </Surface>
  );
}
