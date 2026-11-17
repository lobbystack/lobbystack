"use client";

import { useTable, type PaginationState } from "@tanstack/react-table";
import { FileText, Globe, Text } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DataTablePagination, paginationFeatures, useDataTablePaginationLabels } from "@/components/data-table/pagination";
import { matchesSearch } from "@/components/data-table/search-match";
import { TableSearch } from "@/components/data-table/table-search";
import { DataTablePaginationSkeleton, KnowledgeRowsSkeleton, TableSearchSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Status } from "@/components/ui/status";
import { Table, TableActionsColumn, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { intlLocale } from "@/lib/locale";
import { knowledgeStatusVariant } from "@/lib/status-variants";
import { cn } from "@/lib/utils";
import { RowCheckbox, SelectAllCheckbox, type Selection } from "./selection";

export type WebsiteImport = NonNullable<KnowledgeSource["websiteImport"]>;

export function websiteImportProgress(job: Pick<WebsiteImport, "status"> & Partial<WebsiteImport>): number {
  if (job.status === "queued") return 8;
  if (job.status === "failed") return 100;
  const progress = job.crawlTotalCount && typeof job.crawlFinishedCount === "number" ? Math.round(job.crawlFinishedCount / job.crawlTotalCount * 100) : job.status === "indexing" ? 72 : 12;
  return Math.max(job.status === "indexing" ? 72 : 8, Math.min(99, progress));
}

function summarize(value: string, length: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 3).trimEnd()}...` : normalized;
}

function stripHtmlTags(value: string): string {
  // Remove tags until the text stops changing, so nested markers can't survive one pass.
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>\s]+>/gu, "");
  } while (current !== previous);
  return current;
}

export function previewText(value: string): string {
  const withoutImages = value.replace(/!\[([^\]]*?)\]\((?:[^)\s]+(?:\s+["'][^"']*["'])?)\)/gu, "$1");
  const withoutLinks = withoutImages.replace(/\[([^\]]+)\]\((?:[^)\n]+)\)/gu, "$1");
  return stripHtmlTags(withoutLinks).replace(/\s+/gu, " ").trim();
}

/** A website still being read. One whose read stalled isn't: it shows the problem and Try again instead. */
export function isImporting(source: KnowledgeSource): boolean {
  return source.kind === "website" && Boolean(source.websiteImport && !["completed", "cancelled", "failed"].includes(source.websiteImport.status)) && !source.websiteImport!.stalled;
}

/** A website whose read should be running but stopped moving. */
export function isImportStalled(source: KnowledgeSource): boolean {
  return source.kind === "website" && Boolean(source.websiteImport && !["completed", "cancelled", "failed"].includes(source.websiteImport.status) && source.websiteImport.stalled);
}

function SourceIcon({ source }: { source: KnowledgeSource }) {
  const { t } = useTranslation("agent");
  const label = t(source.kind === "text" ? "sections.knowledge.textBadge" : source.kind === "website" ? "sections.knowledge.websiteImport.badge" : "sections.knowledge.documentBadge");
  return <span aria-label={label} className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground" title={label}>{source.kind === "text" ? <Text className="size-4" /> : source.kind === "website" ? <Globe className="size-4" /> : <FileText className="size-4" />}</span>;
}

function ProgressCell({ value }: { value: number }) {
  return <div className="flex items-center gap-2"><Progress className="w-full [&_[data-slot=progress-track]]:h-1.5" value={value} /><span className="shrink-0 type-caption tabular-nums text-muted-foreground">{value}%</span></div>;
}

/** The preview column: a website's page count, a file's or entry's first words, or progress while it's read. */
function PreviewCell({ source, onRetry }: { source: KnowledgeSource; onRetry?: ((source: KnowledgeSource) => void) | undefined }) {
  const { t } = useTranslation("agent");
  if (isImporting(source)) return <ProgressCell value={websiteImportProgress(source.websiteImport!)} />;
  if (isImportStalled(source)) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 truncate type-body text-destructive/80">{t("sections.knowledge.websiteImport.previewStalled")}</span>
        {onRetry ? <Button className="shrink-0" onClick={(event) => { event.stopPropagation(); onRetry(source); }} size="sm" type="button" variant="outline">{t("sections.knowledge.websiteImport.tryAgain")}</Button> : null}
      </div>
    );
  }
  if (source.kind === "file" && ["pending", "processing"].includes(source.status) && !source.preview.trim()) {
    return <ProgressCell value={Math.min(100, Math.max(0, Math.round(source.processingProgress ?? (source.status === "processing" ? 92 : 0))))} />;
  }
  const text = source.kind === "website"
    ? source.pageCount ? [t("sections.knowledge.website.pages", { count: source.pageCount }), source.pagesOff ? t("sections.knowledge.website.pagesOff", { count: source.pagesOff }) : null].filter(Boolean).join(" · ") : source.status === "error" ? t("sections.knowledge.websiteImport.previewFailed") : t("sections.knowledge.websiteImport.previewPending")
    : previewText(source.preview) || (source.status === "error" ? source.error ?? t("sections.knowledge.previewError") : ["pending", "processing"].includes(source.status) ? t("sections.knowledge.previewPending") : t("table.documentPreviewHint"));
  return <span className={cn("block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap", source.kind === "website" && source.status === "error" ? "type-body text-destructive/80" : "type-body-muted")} title={text}>{summarize(text, 72)}</span>;
}

/** On, off, or how far reading has got. off says whether the row's switch for this table is off. */
function StatusCell({ source, off }: { source: KnowledgeSource; off: boolean }) {
  const { t } = useTranslation("agent");
  if (isImporting(source)) return <Status variant={knowledgeStatusVariant("in_progress")}>{t("sections.knowledge.websiteImport.status.inProgress")}</Status>;
  if (isImportStalled(source)) return <Status variant={knowledgeStatusVariant("failed")}>{t("sections.knowledge.websiteImport.status.stalled")}</Status>;
  if (source.kind === "website" && source.status === "error") return <Status variant={knowledgeStatusVariant("failed")}>{t("sections.knowledge.websiteImport.status.failed")}</Status>;
  if (off) return <Status variant={knowledgeStatusVariant("disabled")}>{t("table.disabled")}</Status>;
  const status = source.status === "processing" ? "indexing" : source.status === "pending" ? "queued" : source.status;
  return <Status variant={knowledgeStatusVariant(source.status)}>{t(`sections.knowledge.status.${status}`, { defaultValue: source.status })}</Status>;
}

export type KnowledgeSearch = {
  /** What is typed in the field. */
  value: string;
  onChange: (value: string) => void;
  /** The trimmed text the rows are filtered by. */
  query: string;
  /** Whether the field shows: not while there is nothing to search. */
  visible: boolean;
};

/** Filters a table's rows by what is typed: title, address and preview. Pass `rows` to the table and selection, `search` to the table. */
export function useKnowledgeSearch(all: KnowledgeSource[]): { rows: KnowledgeSource[]; search: KnowledgeSearch } {
  const [value, onChange] = useState("");
  const query = value.trim();
  const rows = useMemo(() => query ? all.filter((source) => matchesSearch(query, [source.title, source.sourceUrl, source.preview ? previewText(source.preview) : null])) : all, [all, query]);
  return { rows, search: { value, onChange, query, visible: all.length > 0 || Boolean(query) } };
}

export type KnowledgeSourcesTableProps = {
  rows: KnowledgeSource[];
  /** The search field above the table. Without it there is none. */
  search?: KnowledgeSearch | undefined;
  loading: boolean;
  selection?: Selection | undefined;
  /** Opens a row: a website's pages, a file's text, an entry's editor. */
  onOpen?: ((source: KnowledgeSource) => void) | undefined;
  /** Whether a row counts as off in this table: for the business, or for one agent. */
  isOff: (source: KnowledgeSource) => boolean;
  /** A column of switches, such as this agent's switch for a shared source. */
  toggle?: { heading: string; render: (source: KnowledgeSource) => React.ReactNode } | undefined;
  /** The row's actions menu. */
  menu?: ((source: KnowledgeSource) => React.ReactNode) | undefined;
  /** Starts a website's read again when it stalled. Without it, the row only says so. */
  onRetry?: ((source: KnowledgeSource) => void) | undefined;
  expandedId?: string | null | undefined;
  expanded?: React.ReactNode;
  emptyText: string;
  label: string;
};

/** Knowledge sources, one row each, in pages of ten. In selection mode each row gets a checkbox. */
export function KnowledgeSourcesTable({ rows, loading, selection, onOpen, isOff, toggle, menu, onRetry, expandedId, expanded, emptyText, label, search }: KnowledgeSourcesTableProps) {
  const { i18n, t } = useTranslation("agent");
  const { t: tCommon } = useTranslation("common");
  const paginationLabels = useDataTablePaginationLabels("agent");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const table = useTable({ features: paginationFeatures, data: rows, columns: [], onPaginationChange: setPagination, state: { pagination } });
  const pageRows = table.getRowModel().rows.map((row) => row.original);
  const query = search?.query ?? "";
  useEffect(() => { setPagination((current) => current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }); }, [query]);
  const selecting = Boolean(selection?.selecting);
  const columns = 4 + (selecting ? 1 : 0) + (toggle ? 1 : 0) + (menu ? 1 : 0);
  const filled = loading || pageRows.length > 0;
  return (
    <div className="flex w-full flex-col gap-4">
      {search ? loading ? <TableSearchSkeleton /> : search.visible ? <TableSearch label={tCommon("tableSearch.knowledge")} onValueChange={search.onChange} value={search.value} /> : null : null}
      <TableCard>
        <Table aria-label={label} className={cn("w-full table-fixed", filled && "min-w-[60rem]")}>
          <colgroup>
            {selecting ? <col className="w-12" /> : null}
            <col className="w-[22%]" /><col className="w-[42%]" /><col className="w-[12%]" /><col className="w-[18%]" />
            {toggle ? <col className="w-28" /> : null}
            {menu ? <TableActionsColumn /> : null}
          </colgroup>
          <TableHeader empty={!filled}>
            <TableRow>
              {selecting && selection ? <TableHead><SelectAllCheckbox selection={selection} /></TableHead> : null}
              <TableHead>{t("table.title")}</TableHead>
              <TableHead>{t("table.preview")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="text-right">{t("table.added")}</TableHead>
              {toggle ? <TableHead className="text-right">{toggle.heading}</TableHead> : null}
              {menu ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody aria-busy={loading || undefined}>
            {loading ? <KnowledgeRowsSkeleton columns={{ checkbox: selecting, toggle: Boolean(toggle), menu: Boolean(menu) }} rows={10} /> : pageRows.length ? pageRows.map((source) => (
              <Fragment key={`${source.kind}-${source.id}`}>
                <TableRow className={onOpen ? "cursor-pointer" : undefined} data-state={expandedId === source.id || selection?.selected.has(source.id) ? "selected" : undefined} onClick={() => { if (selecting && selection) selection.toggle(source.id); else onOpen?.(source); }}>
                  {selecting && selection ? <TableCell><RowCheckbox id={source.id} selection={selection} title={source.title} /></TableCell> : null}
                  <TableCell className="max-w-0 overflow-hidden"><div className="flex min-w-0 items-center gap-2"><SourceIcon source={source} /><span className="truncate type-item-title" title={source.title}>{summarize(source.title, 32)}</span></div></TableCell>
                  <TableCell className="max-w-0 overflow-hidden"><PreviewCell onRetry={selecting ? undefined : onRetry} source={source} /></TableCell>
                  <TableCell><StatusCell off={isOff(source)} source={source} /></TableCell>
                  <TableCell className="text-right type-body-muted">{new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage), { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.createdAt))}</TableCell>
                  {toggle ? <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>{toggle.render(source)}</TableCell> : null}
                  {menu ? <TableCell onClick={(event) => event.stopPropagation()}>{selecting ? null : menu(source)}</TableCell> : null}
                </TableRow>
                {expandedId === source.id && expanded ? <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={columns}>{expanded}</TableCell></TableRow> : null}
              </Fragment>
            )) : <TableRow><TableCell className="h-24 text-center whitespace-normal text-muted-foreground" colSpan={columns}>{query ? tCommon("tableSearch.noResults", { query }) : emptyText}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableCard>
      {loading ? <DataTablePaginationSkeleton rowsPerPage={paginationLabels.rowsPerPage} /> : <DataTablePagination labels={paginationLabels} table={table} />}
    </div>
  );
}
