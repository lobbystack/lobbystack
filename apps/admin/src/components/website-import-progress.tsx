"use client";

import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
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
 * Picks the crawl to show: the one for the business's own website, else the
 * newest. The knowledge list comes back ordered by title, and resubmitting a URL
 * reuses its earlier import, so neither list order nor creation time alone says
 * which site the operator settled on. Mirrors currentWebsiteIngestion.
 */
export function currentWebsiteImport<T extends { createdAt?: string; websiteImport?: WebsiteImportSummary | null }>(documents: T[] | undefined, websiteUrl?: string | null): WebsiteImportSummary | null {
  const imports = (documents ?? []).filter((document) => document.websiteImport);
  if (imports.length === 0) return null;
  const matching = websiteUrl ? imports.find((document) => document.websiteImport!.websiteUrl === websiteUrl) : undefined;
  if (matching) return matching.websiteImport ?? null;
  const newest = imports.reduce((latest, document) => (document.createdAt ?? "") > (latest.createdAt ?? "") ? document : latest);
  return newest.websiteImport ?? null;
}

/** How far the bar fills: a step per stage, and through indexing by the share of pages indexed. */
export function websiteImportPercent(job: WebsiteImportSummary): number {
  if (!isWebsiteImportRunning(job)) return 100;
  if (job.status === "indexing") return Math.min(95, 60 + Math.round((job.indexedCount / Math.max(job.importedCount, 1)) * 35));
  return job.status === "crawling" ? 35 : 10;
}

/**
 * Crawl progress is written by the worker as it reads a site, so the operator
 * can watch their agent learn instead of waiting in front of a blank step.
 */
export function WebsiteImportProgress({ job, inline = false }: { job: WebsiteImportSummary; inline?: boolean }) {
  // These strings live in common: the card renders on the dashboard too, and
  // the dashboard does not carry the onboarding namespace.
  const { t } = useTranslation("common");
  const host = websiteImportHost(job.websiteUrl);
  const failed = job.status === "failed" || job.status === "cancelled";
  const done = job.status === "completed";
  const percent = websiteImportPercent(job);

  // Inside a Getting started step: the step's own text and a bar, no card.
  if (inline) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <p className="type-body-lg text-muted-foreground">
          {failed ? t("websiteImport.failedTitle", { host }) : done ? t("websiteImport.doneTitle", { host }) : t("websiteImport.inlineRunning", { host, count: job.importedCount })}
        </p>
        {failed || done ? null : (
          <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {failed || done ? (
          failed ? <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate type-title">
            {failed
              ? t("websiteImport.failedTitle", { host })
              : done
                ? t("websiteImport.doneTitle", { host })
                : t("websiteImport.runningTitle", { host })}
          </p>
          <p className="type-caption text-muted-foreground">
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
