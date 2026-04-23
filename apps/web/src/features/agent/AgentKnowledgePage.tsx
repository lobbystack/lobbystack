import { useAction, useConvex, useMutation } from "convex/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { FileText, Globe, MoreHorizontal, Pause, Play, Search, Text, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { KnowledgeSection } from "../../../../../convex/lib/knowledgeSections";
import { AddKnowledgeSheet } from "./AddKnowledgeSheet";
import type { AgentLayoutOutletContext } from "./AgentLayout";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DataTablePagination } from "@/components/data-table/pagination";
import {
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS,
  DataTableRowActions,
} from "@/components/data-table/row-controls";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { captureAnalyticsException } from "@/lib/analytics";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import { cn } from "@/lib/utils";

type AgentKnowledgePageProps = {
  businessId: Id<"businesses">;
  section: KnowledgeSection;
};

type KnowledgeDocumentRow = Doc<"knowledge_documents"> & {
  entryType: "document";
};

type KnowledgeSnippetRow = Doc<"knowledge_snippets"> & {
  entryType: "snippet";
};

type WebsiteIngestionJobRow = Doc<"website_ingestion_jobs"> & {
  entryType: "websiteIngestionJob";
  documentCount: number;
  indexedDocumentCount: number;
  errorDocumentCount: number;
  pendingDocumentCount: number;
};

type KnowledgeRow = KnowledgeDocumentRow | KnowledgeSnippetRow | WebsiteIngestionJobRow;

type RowActionsMenuProps = {
  actionLabel?: string;
  deleting: boolean;
  disabled?: boolean;
  onToggleActive?: () => void;
  toggleActiveDisabled?: boolean;
  toggleActiveLabel?: string;
  toggleActiveVariant?: "enable" | "disable";
  onDelete: () => void;
};

const fullDocumentTextMemoryCache = new Map<string, string>();
const VIEWER_TEXT_SESSION_STORAGE_PREFIX = "agent-knowledge-viewer-text:";
const MAX_PERSISTED_VIEWER_TEXT_BYTES = 512 * 1024;

function isDocumentRow(row: KnowledgeRow): row is KnowledgeDocumentRow {
  return row.entryType === "document";
}

function isWebsiteIngestionJobRow(row: KnowledgeRow): row is WebsiteIngestionJobRow {
  return row.entryType === "websiteIngestionJob";
}

function isSnippetRow(row: KnowledgeRow): row is KnowledgeSnippetRow {
  return row.entryType === "snippet";
}

function isWebsiteDocument(document: KnowledgeDocumentRow): boolean {
  return document.sourceType === "website";
}

function isKnowledgeDocumentActive(document: KnowledgeDocumentRow): boolean {
  return document.active !== false;
}

function isKnowledgeEntryActive(row: KnowledgeDocumentRow | KnowledgeSnippetRow): boolean {
  return isDocumentRow(row) ? isKnowledgeDocumentActive(row) : row.active;
}

function summarizeText(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function summarizeTableTitle(text: string): string {
  return summarizeText(text, 32);
}

function summarizeTablePreview(text: string): string {
  return summarizeText(text, 72);
}

function getViewerCachePrefix(documentId: string): string {
  return `${VIEWER_TEXT_SESSION_STORAGE_PREFIX}${documentId}:`;
}

function getViewerCacheKey(document: Doc<"knowledge_documents">): string {
  return `${getViewerCachePrefix(String(document._id))}${document.lastIndexedAt ?? "pending"}:${document.contentHash ?? "none"}`;
}

function clearViewerCacheForDocument(documentId: string): void {
  const prefix = getViewerCachePrefix(documentId);

  for (const key of fullDocumentTextMemoryCache.keys()) {
    if (key.startsWith(prefix)) {
      fullDocumentTextMemoryCache.delete(key);
    }
  }

  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function readCachedViewerText(cacheKey: string): string | null {
  const inMemory = fullDocumentTextMemoryCache.get(cacheKey);
  if (inMemory !== undefined) {
    return inMemory;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(cacheKey);
  if (stored !== null) {
    fullDocumentTextMemoryCache.set(cacheKey, stored);
  }
  return stored;
}

function writeCachedViewerText(document: Doc<"knowledge_documents">, text: string): void {
  const documentId = String(document._id);
  const cacheKey = getViewerCacheKey(document);

  clearViewerCacheForDocument(documentId);
  fullDocumentTextMemoryCache.set(cacheKey, text);

  if (typeof window === "undefined" || new Blob([text]).size > MAX_PERSISTED_VIEWER_TEXT_BYTES) {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, text);
  } catch {
    // Ignore browser storage quota failures and keep the in-memory cache.
  }
}

function RowActionsMenu({
  actionLabel,
  deleting,
  disabled = false,
  onToggleActive,
  toggleActiveDisabled = false,
  toggleActiveLabel,
  toggleActiveVariant,
  onDelete,
}: RowActionsMenuProps) {
  const { t } = useTranslation("agent");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("actions.moreOptions")}
            disabled={disabled || deleting}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            size="icon-sm"
            title={t("actions.moreOptions")}
            type="button"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        className="min-w-0 w-fit p-1"
        onClick={(event) => {
          event.stopPropagation();
        }}
        side="bottom"
        sideOffset={8}
      >
        {onToggleActive && toggleActiveLabel ? (
          <DropdownMenuItem
            className="gap-2.5 px-3 py-2"
            disabled={toggleActiveDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onToggleActive();
            }}
          >
            {toggleActiveVariant === "enable" ? <Play /> : <Pause />}
            <span>{toggleActiveLabel}</span>
          </DropdownMenuItem>
        ) : null}
        {onToggleActive && toggleActiveLabel ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          className="gap-2.5 px-3 py-2"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          variant="destructive"
        >
          <Trash2 />
          <span>{actionLabel ?? t("actions.delete")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AgentKnowledgePage({ businessId, section }: AgentKnowledgePageProps) {
  const { i18n, t } = useTranslation(["agent", "knowledge"]);
  const outletContext = useOutletContext<AgentLayoutOutletContext | null>();
  const headerActions = outletContext?.headerActions;
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const convex = useConvex();
  const deleteKnowledgeEntry = useAction(api.ai.context.knowledge.deleteKnowledgeEntry);
  const setKnowledgeEntryActive = useAction(api.ai.context.knowledge.setKnowledgeEntryActive);
  const deleteWebsiteIngestionJob = useMutation(
    api.ai.context.websiteIngestion.deleteWebsiteIngestionJob,
  );
  const cancelWebsiteIngestionJob = useMutation(
    api.ai.context.websiteIngestion.cancelWebsiteIngestionJob,
  );
  const { data: knowledge, isInitialLoading: isLoadingKnowledge } = useRememberedConvexQuery(
    api.ai.context.knowledge.listKnowledge,
    {
      businessId,
      section,
    },
  );
  const { data: websiteIngestionJobs } = useRememberedConvexQuery(
    api.ai.context.websiteIngestion.listWebsiteIngestionJobs,
    section === "knowledge" ? { businessId } : "skip",
  );
  const [searchValue, setSearchValue] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [deleteCandidate, setDeleteCandidate] = useState<KnowledgeRow | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<string[]>([]);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<KnowledgeSnippetRow | null>(null);
  const [viewerTextByDocumentId, setViewerTextByDocumentId] = useState<Record<string, string>>({});
  const [viewerCacheKeyByDocumentId, setViewerCacheKeyByDocumentId] = useState<Record<string, string>>({});
  const [loadingViewerIds, setLoadingViewerIds] = useState<string[]>([]);
  const [viewerErrorsByDocumentId, setViewerErrorsByDocumentId] = useState<Record<string, string>>({});
  const [togglingEntryIds, setTogglingEntryIds] = useState<string[]>([]);
  const documents = useMemo(
    () =>
      ((knowledge?.documents ?? []) as Array<Doc<"knowledge_documents">>).map((document) => ({
        ...document,
        entryType: "document" as const,
      })),
    [knowledge?.documents],
  );
  const snippets = useMemo(
    () =>
      ((knowledge?.snippets ?? []) as Array<Doc<"knowledge_snippets">>).map((snippet) => ({
        ...snippet,
        entryType: "snippet" as const,
      })),
    [knowledge?.snippets],
  );
  const pendingWebsiteIngestionRows = useMemo(
    () =>
      ((websiteIngestionJobs ?? []) as Array<
        Doc<"website_ingestion_jobs"> & {
          documentCount: number;
          indexedDocumentCount: number;
          errorDocumentCount: number;
          pendingDocumentCount: number;
        }
      >)
        .filter(
          (job) =>
            job.documentCount === 0 &&
            job.status !== "completed" &&
            job.status !== "canceled",
        )
        .map((job) => ({
          ...job,
          entryType: "websiteIngestionJob" as const,
        })),
    [websiteIngestionJobs],
  );
  const rows = useMemo(
    () =>
      [...pendingWebsiteIngestionRows, ...documents, ...snippets].sort(
        (left, right) => right._creationTime - left._creationTime,
      ),
    [documents, pendingWebsiteIngestionRows, snippets],
  );
  const visibleRows = useMemo(
    () => rows.filter((row) => !optimisticDeletedIds.includes(String(row._id))),
    [optimisticDeletedIds, rows],
  );

  function getLoadedViewerText(document: Doc<"knowledge_documents">): string | undefined {
    const documentId = String(document._id);
    const cacheKey = getViewerCacheKey(document);
    return viewerCacheKeyByDocumentId[documentId] === cacheKey
      ? viewerTextByDocumentId[documentId]
      : undefined;
  }

  function setLoadedViewerText(document: Doc<"knowledge_documents">, text: string): void {
    const documentId = String(document._id);
    const cacheKey = getViewerCacheKey(document);

    setViewerTextByDocumentId((current) => ({
      ...current,
      [documentId]: text,
    }));
    setViewerCacheKeyByDocumentId((current) => ({
      ...current,
      [documentId]: cacheKey,
    }));
  }

  function buildWebsiteIngestionRowTitle(job: WebsiteIngestionJobRow): string {
    try {
      const parsed = new URL(job.websiteUrl);
      const hostname = parsed.hostname.replace(/^www\./u, "");
      const pathname =
        parsed.pathname && parsed.pathname !== "/"
          ? parsed.pathname.replace(/\/+$/u, "")
          : "";
      return `${hostname}${pathname}`;
    } catch {
      return job.websiteUrl;
    }
  }

  function getWebsiteIngestionJobProgressValue(job: WebsiteIngestionJobRow): number {
    switch (job.status) {
      case "queued":
        return 8;
      case "crawling": {
        const finishedCount =
          typeof job.crawlFinishedCount === "number" ? job.crawlFinishedCount : null;
        const totalCount =
          typeof job.crawlTotalCount === "number" ? job.crawlTotalCount : null;

        if (finishedCount !== null && totalCount !== null && totalCount > 0) {
          return Math.max(8, Math.min(99, Math.round((finishedCount / totalCount) * 100)));
        }

        return 12;
      }
      case "indexing":
        return 72;
      case "failed":
        return 100;
      default:
        return 12;
    }
  }

  function getWebsiteIngestionJobPreviewSummary(job: WebsiteIngestionJobRow): string {
    if (job.status === "failed") {
      return t("agent:sections.knowledge.websiteImport.previewFailed");
    }

    return t("agent:sections.knowledge.websiteImport.previewPending");
  }

  function isDocumentProcessing(document: KnowledgeDocumentRow): boolean {
    return document.status === "queued" || document.status === "indexing";
  }

  function getDocumentProgressValue(document: KnowledgeDocumentRow): number {
    return Math.max(
      0,
      Math.min(100, Math.round(document.processingProgress ?? (document.status === "indexing" ? 92 : 0))),
    );
  }

  function renderWebsiteIngestionJobMarker() {
    return (
      <span
        aria-label={t("agent:sections.knowledge.websiteImport.badge")}
        className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        title={t("agent:sections.knowledge.websiteImport.badge")}
      >
        <Globe className="size-4" />
      </span>
    );
  }

  function renderDocumentMarker() {
    return (
      <span
        aria-label={t(`agent:sections.${section}.documentBadge`)}
        className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        title={t(`agent:sections.${section}.documentBadge`)}
      >
        <FileText className="size-4" />
      </span>
    );
  }

  function renderSnippetMarker() {
    return (
      <span
        aria-label={t(`agent:sections.${section}.textBadge`)}
        className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        title={t(`agent:sections.${section}.textBadge`)}
      >
        <Text className="size-4" />
      </span>
    );
  }

  function renderInProgressPreview(progressValue: number) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Progress className="w-full [&_[data-slot=progress-track]]:h-1.5" value={progressValue} />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {progressValue}%
          </span>
        </div>
      </div>
    );
  }

  function renderWebsiteIngestionJobPreview(job: WebsiteIngestionJobRow) {
    const summary = getWebsiteIngestionJobPreviewSummary(job);

    if (job.status === "failed") {
      return (
        <span
          className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-destructive/80"
          title={summary}
        >
          {summarizeTablePreview(summary)}
        </span>
      );
    }

    const progressValue = getWebsiteIngestionJobProgressValue(job);
    return renderInProgressPreview(progressValue);
  }

  function getDocumentStatusLabel(status: KnowledgeDocumentRow["status"]): string {
    switch (status) {
      case "queued":
        return t(`agent:sections.${section}.status.queued`);
      case "indexing":
        return t(`agent:sections.${section}.status.indexing`);
      case "indexed":
        return t(`agent:sections.${section}.status.indexed`);
      case "error":
        return t(`agent:sections.${section}.status.error`);
      default:
        return status;
    }
  }

  function renderDocumentStatus(document: KnowledgeDocumentRow) {
    if (document.status === "queued" || document.status === "indexing") {
      const progressValue = Math.max(
        0,
        Math.min(100, Math.round(document.processingProgress ?? (document.status === "indexing" ? 92 : 0))),
      );
      const label =
        document.status === "queued"
          ? t(`agent:sections.${section}.status.analyzing`)
          : getDocumentStatusLabel(document.status);

      return (
        <span className="inline-flex flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          <Progress className="w-24" value={progressValue} />
          <span className="min-w-10 text-right text-xs tabular-nums">{progressValue}%</span>
        </span>
      );
    }

    return (
      <Badge
        variant={
          document.status === "error"
            ? "destructive"
            : document.status === "indexed"
              ? "secondary"
              : "outline"
        }
      >
        {getDocumentStatusLabel(document.status)}
      </Badge>
    );
  }

  function renderWebsiteIngestionJobStatus(job: WebsiteIngestionJobRow) {
    if (job.status === "failed") {
      return <Badge variant="destructive">{t("agent:sections.knowledge.websiteImport.status.failed")}</Badge>;
    }

    if (job.status === "completed") {
      return <Badge variant="secondary">{t("agent:sections.knowledge.status.indexed")}</Badge>;
    }

    return <Badge variant="outline">{t("agent:sections.knowledge.websiteImport.status.inProgress")}</Badge>;
  }

  function getEntryToggleActionLabel(row: KnowledgeDocumentRow | KnowledgeSnippetRow): string {
    const active = isKnowledgeEntryActive(row);
    return active ? t("agent:actions.disable") : t("agent:actions.enable");
  }

  function renderEntryStatus(row: KnowledgeRow) {
    if (isWebsiteIngestionJobRow(row)) {
      return renderWebsiteIngestionJobStatus(row);
    }

    if (!isKnowledgeEntryActive(row)) {
      return <Badge variant="outline">{t("agent:table.disabled")}</Badge>;
    }

    if (isDocumentRow(row)) {
      return renderDocumentStatus(row);
    }

    return <Badge variant="secondary">{t(`agent:sections.${section}.status.indexed`)}</Badge>;
  }

  function getDocumentPreviewSummary(document: KnowledgeDocumentRow): string {
    const textContent = document.textContent?.trim();
    if (textContent) {
      return summarizeText(textContent);
    }

    if (document.status === "error") {
      return document.error ?? t(`agent:sections.${section}.previewError`);
    }

    if (document.status === "queued" || document.status === "indexing") {
      return t(`agent:sections.${section}.previewPending`);
    }

    if (section === "knowledge") {
      return t("agent:table.documentPreviewHint");
    }

    return t("agent:table.documentPreviewUnavailable");
  }

  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return visibleRows.filter((row) => {
      const preview = isDocumentRow(row)
        ? summarizeTablePreview(getDocumentPreviewSummary(row))
        : isWebsiteIngestionJobRow(row)
          ? summarizeTablePreview(getWebsiteIngestionJobPreviewSummary(row))
          : summarizeTablePreview(row.content);
      const haystack = [
        isWebsiteIngestionJobRow(row) ? buildWebsiteIngestionRowTitle(row) : row.title,
        preview,
        isWebsiteIngestionJobRow(row) ? "" : row.tags.join(" "),
        isWebsiteIngestionJobRow(row) ? row.websiteUrl : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return query.length === 0 || haystack.includes(query);
    });
  }, [searchValue, visibleRows, section, t]);

  const columns = useMemo<Array<ColumnDef<KnowledgeRow>>>(
    () => [
      {
        accessorFn: (row) =>
          isWebsiteIngestionJobRow(row) ? buildWebsiteIngestionRowTitle(row) : row.title,
        id: "title",
        header: () => t("agent:table.title"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            {section === "knowledge"
              ? isDocumentRow(row.original) ? (
                isWebsiteDocument(row.original) ? renderWebsiteIngestionJobMarker() : renderDocumentMarker()
              ) : isWebsiteIngestionJobRow(row.original) ? (
                renderWebsiteIngestionJobMarker()
              ) : isSnippetRow(row.original) ? (
                renderSnippetMarker()
              ) : null
              : null}
            <span
              className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium"
              title={
                isWebsiteIngestionJobRow(row.original)
                  ? buildWebsiteIngestionRowTitle(row.original)
                  : row.original.title
              }
            >
              {summarizeTableTitle(
                isWebsiteIngestionJobRow(row.original)
                  ? buildWebsiteIngestionRowTitle(row.original)
                  : row.original.title,
              )}
            </span>
          </div>
        ),
      },
      {
        accessorFn: (row) =>
          isDocumentRow(row)
            ? summarizeTablePreview(getDocumentPreviewSummary(row))
            : isWebsiteIngestionJobRow(row)
              ? summarizeTablePreview(getWebsiteIngestionJobPreviewSummary(row))
              : summarizeTablePreview(row.content),
        id: "preview",
        header: () => t("agent:table.preview"),
        cell: ({ row }) =>
          isWebsiteIngestionJobRow(row.original) ? (
            renderWebsiteIngestionJobPreview(row.original)
          ) : (
            isDocumentRow(row.original) && isDocumentProcessing(row.original) ? (
              renderInProgressPreview(getDocumentProgressValue(row.original))
            ) : (
              <span
                className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground"
                title={isDocumentRow(row.original)
                  ? getDocumentPreviewSummary(row.original)
                  : row.original.content}
              >
                {isDocumentRow(row.original)
                  ? summarizeTablePreview(getDocumentPreviewSummary(row.original))
                  : summarizeTablePreview(row.original.content)}
              </span>
            )
          ),
      },
      {
        accessorFn: (row) =>
          isWebsiteIngestionJobRow(row)
            ? row.status
            : isDocumentRow(row)
              ? isKnowledgeEntryActive(row)
                ? row.status
                : "disabled"
              : row.active
                ? "indexed"
                : "disabled",
        id: "status",
        header: () => t("agent:table.status"),
        cell: ({ row }) => renderEntryStatus(row.original),
      },
      {
        accessorFn: (row) =>
          formatDateTime(row._creationTime, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        id: "added",
        header: () => (
          <span className={`relative block text-right ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>
            {t("agent:table.added")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className={`relative block truncate text-right text-sm text-muted-foreground ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}
          >
            {formatDateTime(row.original._creationTime, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => {
          const rowData = row.original;
          const toggleableRow = isDocumentRow(rowData) || isSnippetRow(rowData) ? rowData : null;

          return (
            <DataTableRowActions>
              {!isWebsiteIngestionJobRow(rowData) || rowData.status !== "completed" ? (
                <RowActionsMenu
                  deleting={deletingEntryId === String(rowData._id)}
                  {...(toggleableRow
                    ? {
                      onToggleActive: () => {
                        void handleSetEntryActive(toggleableRow, !isKnowledgeEntryActive(toggleableRow));
                      },
                      toggleActiveDisabled: togglingEntryIds.includes(String(rowData._id)),
                      toggleActiveLabel: getEntryToggleActionLabel(toggleableRow),
                      toggleActiveVariant: isKnowledgeEntryActive(toggleableRow) ? "disable" : "enable",
                    }
                  : {})}
                  {...(isWebsiteIngestionJobRow(rowData) && rowData.status !== "failed"
                    ? { actionLabel: t("agent:actions.cancelImport") }
                    : {})}
                  onDelete={() => {
                    setDeleteCandidate(rowData);
                  }}
                />
              ) : null}
            </DataTableRowActions>
          );
        },
        meta: {
          className: DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
        },
      },
    ],
    [deletingEntryId, locale, section, t, togglingEntryIds],
  );

  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  useEffect(() => {
    setOptimisticDeletedIds((current) =>
      current.filter((id) => rows.some((row) => String(row._id) === id)),
    );
  }, [rows]);

  useEffect(() => {
    if (expandedDocumentId && !filteredRows.some((row) => String(row._id) === expandedDocumentId)) {
      setExpandedDocumentId(null);
    }
  }, [expandedDocumentId, filteredRows]);

  useEffect(() => {
    if (editingSnippet && !filteredRows.some((row) => row.entryType === "snippet" && row._id === editingSnippet._id)) {
      setEditingSnippet(null);
    }
  }, [editingSnippet, filteredRows]);

  useEffect(() => {
    setPagination((current) => {
      const pageCount = Math.max(1, Math.ceil(filteredRows.length / current.pageSize));
      if (current.pageIndex <= pageCount - 1) {
        return current;
      }

      return {
        ...current,
        pageIndex: pageCount - 1,
      };
    });
  }, [filteredRows.length]);

  async function handleDelete(row: KnowledgeRow): Promise<void> {
    const entryId = String(row._id);
    setDeletingEntryId(entryId);
    setOptimisticDeletedIds((current) => (current.includes(entryId) ? current : [...current, entryId]));
    if (row.entryType === "snippet" && editingSnippet?._id === row._id) {
      setEditingSnippet(null);
    }
    if (row.entryType === "document" && expandedDocumentId === entryId) {
      setExpandedDocumentId(null);
    }

    try {
      if (isDocumentRow(row)) {
        clearViewerCacheForDocument(entryId);
        setViewerTextByDocumentId((current) => {
          if (!(entryId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        setViewerCacheKeyByDocumentId((current) => {
          if (!(entryId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        await deleteKnowledgeEntry({
          businessId,
          documentId: row._id,
        });
      } else if (isSnippetRow(row)) {
        await deleteKnowledgeEntry({
          businessId,
          snippetId: row._id,
        });
      } else if (row.status !== "failed") {
        await cancelWebsiteIngestionJob({
          businessId,
          websiteIngestionJobId: row._id,
        });
      } else if (row.status === "failed") {
        await deleteWebsiteIngestionJob({
          businessId,
          websiteIngestionJobId: row._id,
        });
      }
    } catch (error) {
      setOptimisticDeletedIds((current) => current.filter((id) => id !== entryId));
      throw error;
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleSetEntryActive(
    row: KnowledgeDocumentRow | KnowledgeSnippetRow,
    nextActive: boolean,
  ): Promise<void> {
    const entryId = String(row._id);
    setTogglingEntryIds((current) => [...current, entryId]);

    try {
      if (isDocumentRow(row)) {
        await setKnowledgeEntryActive({
          businessId,
          documentId: row._id,
          active: nextActive,
        });
      } else {
        await setKnowledgeEntryActive({
          businessId,
          snippetId: row._id,
          active: nextActive,
        });
      }
    } catch (error) {
      captureAnalyticsException(error, {
        source: "agent-knowledge-toggle-active",
        entryId,
        section,
      });
    } finally {
      setTogglingEntryIds((current) => current.filter((candidateId) => candidateId !== entryId));
    }
  }

  const isCancelingWebsiteImport =
    deleteCandidate !== null &&
    isWebsiteIngestionJobRow(deleteCandidate) &&
    deleteCandidate.status !== "failed";

  async function loadFullDocumentText(document: KnowledgeDocumentRow): Promise<void> {
    const documentId = String(document._id);
    const loadedViewerText = getLoadedViewerText(document);
    const cachedText = readCachedViewerText(getViewerCacheKey(document));
    if (
      !document.extractedTextStorageId ||
      loadedViewerText !== undefined ||
      loadingViewerIds.includes(documentId) ||
      cachedText !== null
    ) {
      if (cachedText !== null && loadedViewerText === undefined) {
        setLoadedViewerText(document, cachedText);
      }
      return;
    }

    setLoadingViewerIds((current) => [...current, documentId]);
    setViewerErrorsByDocumentId((current) => {
      if (!(documentId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[documentId];
      return next;
    });

    let fallbackText = document.textContent ?? "";
    try {
      const viewerContent = await convex.query(api.ai.context.knowledge.getKnowledgeDocumentViewerContent, {
        businessId,
        documentId: document._id,
      });
      fallbackText = viewerContent.textContent;

      if (!viewerContent.extractedTextUrl) {
        writeCachedViewerText(document, viewerContent.textContent);
        setLoadedViewerText(document, viewerContent.textContent);
        return;
      }

      const response = await fetch(viewerContent.extractedTextUrl);
      if (!response.ok) {
        throw new Error("Failed to load full document text.");
      }

      const fullText = await response.text();
      writeCachedViewerText(document, fullText);
      setLoadedViewerText(document, fullText);
    } catch (error) {
      if (fallbackText.trim()) {
        writeCachedViewerText(document, fallbackText);
        setLoadedViewerText(document, fallbackText);
        return;
      }
      captureAnalyticsException(error, {
        businessId: String(businessId),
        section,
        operation: "knowledge_document_preview",
        documentId,
      });
      const message =
        error instanceof Error ? error.message : t(`agent:sections.${section}.previewError`);
      setViewerErrorsByDocumentId((current) => ({
        ...current,
        [documentId]: message,
      }));
    } finally {
      setLoadingViewerIds((current) => current.filter((id) => id !== documentId));
    }
  }

  function renderDocumentPreview(document: KnowledgeDocumentRow) {
    const documentId = String(document._id);
    const loadedViewerText = getLoadedViewerText(document);

    if (
      loadingViewerIds.includes(documentId) &&
      !loadedViewerText?.trim() &&
      !document.textContent?.trim()
    ) {
      return (
        <div className="space-y-3 rounded-md border border-border/70 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-4 w-full" key={index} />
          ))}
        </div>
      );
    }

    return (
      <Textarea
        className="max-h-80 resize-none overflow-y-auto text-sm leading-relaxed"
        rows={8}
        readOnly
        value={
          document.status === "error"
            ? viewerErrorsByDocumentId[documentId] ??
              document.error ??
              t(`agent:sections.${section}.previewError`)
            : loadedViewerText?.trim()
              ? loadedViewerText.trim()
              : document.textContent?.trim()
                ? document.textContent.trim()
                : t(`agent:sections.${section}.previewPending`)
        }
      />
    );
  }

  const emptyMessage =
    searchValue.trim().length > 0 ? t("agent:table.empty") : t(`agent:sections.${section}.emptyState`);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("agent:table.searchPlaceholder")}
            value={searchValue}
          />
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>
        ) : null}
      </div>

      {isLoadingKnowledge ? (
        <TableCardSkeleton columns={5} />
      ) : (
        <>
          <TableCard>
            <Table className="min-w-[60rem] w-full table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[42%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} />
              </colgroup>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const className =
                        header.column.id === "added" || header.column.id === "actions"
                            ? "text-right"
                            : header.column.columnDef.meta &&
                                typeof header.column.columnDef.meta === "object" &&
                                "className" in header.column.columnDef.meta
                              ? String(header.column.columnDef.meta.className)
                              : undefined;

                      return (
                        <TableHead className={className} key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const rowData = row.original;
                  const rowId = String(rowData._id);
                  const rowIsInteractive =
                    rowData.entryType === "snippet" || rowData.entryType === "document";
                  const isSelected =
                    rowData.entryType === "snippet"
                      ? editingSnippet?._id === rowData._id
                      : expandedDocumentId === rowId;
                  const isExpandedDocument = rowData.entryType === "document" && expandedDocumentId === rowId;

                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={cn(
                          rowIsInteractive
                            ? "h-12 cursor-pointer data-[state=selected]:bg-muted/40"
                            : (isWebsiteIngestionJobRow(rowData) && rowData.status !== "failed") ||
                                (isDocumentRow(rowData) && isDocumentProcessing(rowData))
                              ? "h-16 data-[state=selected]:bg-muted/40"
                              : "h-12 data-[state=selected]:bg-muted/40",
                        )}
                        data-state={isSelected ? "selected" : undefined}
                        onClick={() => {
                          if (rowData.entryType === "snippet") {
                            setExpandedDocumentId(null);
                            setEditingSnippet(rowData);
                            return;
                          }
                          if (rowData.entryType !== "document") {
                            return;
                          }

                          const nextExpandedId = expandedDocumentId === rowId ? null : rowId;
                          setEditingSnippet(null);
                          setExpandedDocumentId(nextExpandedId);
                          if (nextExpandedId) {
                            void loadFullDocumentText(rowData);
                          }
                        }}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const className =
                            cell.column.id === "title"
                              ? "max-w-0 overflow-hidden"
                              : cell.column.id === "preview"
                                ? "max-w-0 overflow-hidden"
                                : cell.column.id === "added"
                                  ? "w-0 max-w-0 text-right whitespace-nowrap"
                                  : cell.column.id === "actions"
                                    ? DATA_TABLE_ROW_ACTIONS_CELL_CLASS
                                    : cell.column.columnDef.meta &&
                                        typeof cell.column.columnDef.meta === "object" &&
                                        "className" in cell.column.columnDef.meta
                                      ? String(cell.column.columnDef.meta.className)
                                      : undefined;

                          return (
                            <TableCell className={className} key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {rowData.entryType === "document" && isExpandedDocument ? (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell className="p-4" colSpan={row.getVisibleCells().length}>
                            {renderDocumentPreview(rowData)}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableCard>
          <DataTablePagination
            labels={{
              rowsPerPage: t("agent:pagination.rowsPerPage"),
              pageOf: (page, total) => t("agent:pagination.pageOf", { page, total }),
              firstPage: t("agent:pagination.firstPage"),
              previousPage: t("agent:pagination.previousPage"),
              nextPage: t("agent:pagination.nextPage"),
              lastPage: t("agent:pagination.lastPage"),
              goToPage: (page) => t("agent:pagination.goToPage", { page }),
            }}
            table={table}
          />
          <ConfirmDeleteDialog
            cancelLabel={t("agent:actions.deleteCancel")}
            confirmLabel={
              isCancelingWebsiteImport
                ? t("agent:actions.cancelImport")
                : t("agent:actions.delete")
            }
            description={
              isCancelingWebsiteImport
                ? t("agent:actions.cancelImportDescription")
                : t("agent:actions.deleteDescription")
            }
            onConfirm={async () => {
              if (!deleteCandidate) {
                return;
              }

              await handleDelete(deleteCandidate);
            }}
            onOpenChange={(open) => {
              if (!open && !deletingEntryId) {
                setDeleteCandidate(null);
              }
            }}
            open={deleteCandidate !== null}
            pending={
              deleteCandidate !== null &&
              deletingEntryId === String(deleteCandidate._id)
            }
            title={
              isCancelingWebsiteImport
                ? t("agent:actions.cancelImportTitle")
                : t("agent:actions.deleteTitle")
            }
          />
        </>
      )}

      <AddKnowledgeSheet
        businessId={businessId}
        mode="edit"
        onOpenChange={(open) => {
          if (!open) {
            setEditingSnippet(null);
          }
        }}
        open={editingSnippet !== null}
        section={section}
        snippet={editingSnippet}
      />
    </div>
  );
}
