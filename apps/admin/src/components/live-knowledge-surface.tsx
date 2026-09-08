"use client";

import { getCoreRowModel, getPaginationRowModel, useReactTable, type PaginationState } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Globe, MoreHorizontal, Pause, Play, Plus, Search, Text, Trash2, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSetupAction } from "@/lib/use-setup-action";
import { selectActiveBusiness } from "@/lib/active-business";
import { requestJson } from "@/lib/request-json";
import { UploadKnowledgeDocumentSheet } from "./upload-knowledge-document-sheet";
import { AddKnowledgeSheet } from "./add-knowledge-sheet";
import { ImportWebsiteKnowledgeSheet } from "./import-website-knowledge-sheet";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { DataTableRowActions, DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS, DATA_TABLE_ROW_ACTIONS_CELL_CLASS, DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS } from "./data-table/row-controls";
import { DataTablePagination } from "./data-table/pagination";
import { TableCardSkeleton } from "./loading-skeletons";
import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { Progress } from "./ui/progress";
import { Textarea } from "./ui/textarea";

type Business = { businessId: string; name: string; active: boolean; role: string };
export type WebsiteImport = { crawlFinishedCount?: number | null; crawlTotalCount?: number | null; documentCount?: number; id: string; status: string; websiteUrl: string; importedCount: number; indexedCount: number };
type Document = { websiteImport?: WebsiteImport | null; revision?: number; active?: boolean; textContent?: string; id: string; title: string; sourceType: string; sourceUrl: string | null; storageObjectId: string | null; status: string; error?: string | null; processingProgress: number | null; createdAt: string; updatedAt: string };
type Snippet = { tags?: string[]; id: string; title: string; content: string; active: boolean; priority: number; createdAt: string };
type Row = ({ entryType: "document" } & Document) | ({ entryType: "snippet" } & Snippet);

function summarize(value: string, length: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 3).trimEnd()}...` : normalized;
}

function previewText(value: string): string {
  return value.replace(/!\[([^\]]*?)\]\((?:[^)\s]+(?:\s+["'][^"']*["'])?)\)/gu, "$1").replace(/\[([^\]]+)\]\((?:[^)\n]+)\)/gu, "$1").replace(/<[^>\s]+>/gu, "").replace(/\s+/gu, " ").trim();
}

function isImportRow(row: Row): row is Document & { entryType: "document"; websiteImport: WebsiteImport } {
  return row.entryType === "document" && Boolean(row.websiteImport && row.websiteImport.status !== "completed");
}

function importTitle(url: string): string {
  try { const parsed = new URL(url); return parsed.hostname.replace(/^www\./u, "") + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, "")); } catch { return url; }
}

export function websiteImportProgress(job: WebsiteImport): number {
  if (job.status === "queued") return 8;
  if (job.status === "failed") return 100;
  const progress = job.crawlTotalCount && typeof job.crawlFinishedCount === "number" ? Math.round(job.crawlFinishedCount / job.crawlTotalCount * 100) : job.status === "indexing" ? 72 : 12;
  return Math.max(job.status === "indexing" ? 72 : 8, Math.min(99, progress));
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export function LiveKnowledgeSurface() {
  const { i18n, t } = useTranslation("agent");
  const queryClient = useQueryClient();
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [form, setForm] = useState<"text" | "website" | "upload" | null>(null);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Row | null>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  useSetupAction(canManage, useCallback((action: string) => { if (!["upload", "website", "text"].includes(action)) return false; setEditingSnippet(null); setForm(action as "upload" | "website" | "text"); return true; }, []));
  const documents = useQuery({ queryKey: ["knowledge", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<{ documents: Document[] }>(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`), refetchInterval: query => query.state.data?.documents.some(document => ["pending", "processing"].includes(document.status)) ? 1500 : false });
  const [importProgress, setImportProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    setImportProgress(previous => {
      const next: Record<string, number> = {};
      for (const document of documents.data?.documents ?? []) if (document.websiteImport) {
        const key = `${document.websiteImport.id}:${document.revision ?? 0}`;
        next[key] = Math.max(previous[key] ?? 0, websiteImportProgress(document.websiteImport));
      }
      return next;
    });
  }, [documents.data]);
  const snippets = useQuery({ queryKey: ["knowledge-snippets", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<{ snippets: Snippet[] }>(`/api/knowledge/snippets?businessId=${encodeURIComponent(business!.businessId)}`) });
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["knowledge", business?.businessId] }), queryClient.invalidateQueries({ queryKey: ["knowledge-snippets", business?.businessId] }), queryClient.invalidateQueries({ queryKey: ["knowledge-content", business?.businessId] })]); };
  const addWebsite = useMutation({ mutationFn: (input: { title: string; sourceUrl: string }) => requestJson(`/api/knowledge?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify({ businessId: business!.businessId, sourceType: "website", ...input }) }), onSuccess: invalidate });
  const addSnippet = useMutation({ mutationFn: (input: { title: string; content: string; tags: string[]; priority: number; active: boolean }) => requestJson(`/api/knowledge/snippets?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify(input) }), onSuccess: invalidate });
  const updateSnippet = useMutation({ mutationFn: (input: { id: string; title?: string; content?: string; tags?: string[]; priority?: number; active?: boolean }) => requestJson(`/api/knowledge/snippets/${encodeURIComponent(input.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: invalidate });
  const deleteSnippet = useMutation({ mutationFn: (id: string) => requestJson(`/api/knowledge/snippets/${encodeURIComponent(id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }), onSuccess: invalidate });
  const documentAction = useMutation({ mutationFn: ({ id, method, action, active }: { id: string; method: "PATCH" | "DELETE"; action?: "retry" | "cancel"; active?: boolean }) => requestJson(`/api/knowledge/${encodeURIComponent(id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method, ...(active !== undefined ? { body: JSON.stringify({ active }) } : action ? { body: JSON.stringify({ action }) } : {}) }), onSuccess: invalidate });
  const currentDocument = documents.data?.documents.find(document => document.id === viewingDocument?.id) ?? viewingDocument;
  const documentContent = useQuery({ queryKey: ["knowledge-content", business?.businessId, viewingDocument?.id, currentDocument?.updatedAt], enabled: Boolean(business && viewingDocument), queryFn: () => requestJson<{ document: Document & { fileName?: string | null; contentLength?: number | null }; content: string }>(`/api/knowledge/${encodeURIComponent(viewingDocument!.id)}?businessId=${encodeURIComponent(business!.businessId)}`) });
  const uploadDocument = useMutation({ mutationFn: async ({ file, contentType, title, tags }: { file: File; contentType: string; title: string; tags: string[] }) => { const fileChecksum = await checksum(file); const created = await requestJson<{ objectId: string; url: string; headers?: Record<string, string> }>("/api/uploads", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, purpose: "knowledge", fileName: file.name, contentType, length: file.size, checksum: fileChecksum }) }); const result = await fetch(created.url, { method: "PUT", ...(created.headers ? { headers: created.headers } : {}), body: file }); if (!result.ok) throw new Error(t("sections.knowledge.uploadValidation.uploadFailed")); await requestJson("/api/uploads", { method: "PUT", body: JSON.stringify({ businessId: business!.businessId, objectId: created.objectId, length: file.size, contentType, checksum: fileChecksum, title, tags }) }); }, onSuccess: invalidate });

  const rows = useMemo<Row[]>(() => [
    ...(documents.data?.documents ?? []).filter(document => !(document.websiteImport && ["completed", "cancelled"].includes(document.websiteImport.status) && !document.textContent?.trim())).map((document) => {
      const importedPage = Boolean(document.websiteImport && ["completed", "cancelled"].includes(document.websiteImport.status) && document.textContent?.trim());
      return { ...document, ...(importedPage ? { websiteImport: null, status: "indexed" } : {}), title: !importedPage && document.websiteImport && document.websiteImport.status !== "completed" ? importTitle(document.websiteImport.websiteUrl) : document.title, entryType: "document" as const };
    }),
    ...(snippets.data?.snippets ?? []).map((snippet) => ({ ...snippet, entryType: "snippet" as const })),
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [documents.data, snippets.data]);
  const filteredRows = useMemo(() => { const query = search.trim().toLowerCase(); return query ? rows.filter((row) => `${row.title} ${row.entryType === "snippet" ? row.content : row.sourceUrl ?? row.sourceType}`.toLowerCase().includes(query)) : rows; }, [rows, search]);
  const table = useReactTable({ data: filteredRows, columns: [], getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), onPaginationChange: setPagination, state: { pagination } });
  const pageRows = table.getRowModel().rows.map((row) => row.original);

  if (businesses.isLoading) return <p className="text-sm text-muted-foreground">{t("loading.workspace")}</p>;
  if (!business) return <PageSurface description="" title={t("sections.knowledge.title")}><p className="text-sm text-muted-foreground">{t("empty.description")}</p></PageSurface>;
  const uploadProgress = (row: Row) => {
    if (isImportRow(row)) {
      if (row.websiteImport.status === "failed" || row.websiteImport.status === "cancelled") return <span className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-destructive/80">{t("sections.knowledge.websiteImport.previewFailed")}</span>;
      const value = Math.max(importProgress[`${row.websiteImport.id}:${row.revision ?? 0}`] ?? 0, websiteImportProgress(row.websiteImport));
      return <div className="flex min-w-0 flex-col gap-2"><div className="flex items-center gap-2"><Progress className="w-full [&_[data-slot=progress-track]]:h-1.5" value={value} /><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{value}%</span></div></div>;
    }
    if (row.entryType !== "document" || row.active === false || row.sourceType === "website" || !["pending", "processing"].includes(row.status) || row.textContent?.trim()) return null;
    const value = Math.min(100, Math.max(0, Math.round(row.processingProgress ?? (row.status === "processing" ? 92 : 0))));
    return <div className="flex min-w-0 flex-col gap-2"><div className="flex items-center gap-2"><Progress className="w-full [&_[data-slot=progress-track]]:h-1.5" value={value} /><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{value}%</span></div></div>;
  };
  const cancellingImport = Boolean(deleteCandidate && isImportRow(deleteCandidate) && deleteCandidate.websiteImport.status !== "failed");
  const documentPreview = (row: Document) => previewText(row.textContent ?? "") || (row.status === "error" ? row.error ?? t("sections.knowledge.previewError") : ["pending", "processing"].includes(row.status) ? t("sections.knowledge.previewPending") : t("table.documentPreviewHint"));

  return <PageSurface description="" title={t("sections.knowledge.title")}><div className="flex w-full flex-col gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => { setSearch(event.target.value); setPagination(current => ({ ...current, pageIndex: 0 })); }} placeholder={t("table.searchPlaceholder")} value={search} /></div>{canManage ? <div className="flex shrink-0 flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger render={<Button type="button"><Plus data-icon="inline-start" />{t("sections.knowledge.addKnowledge")}<ChevronDown data-icon="inline-end" /></Button>} /><DropdownMenuContent align="end" className="min-w-44 w-auto p-1"><DropdownMenuItem onClick={() => { setEditingSnippet(null); setForm("upload"); }}><Upload />{t("sections.knowledge.addKnowledgeOptions.upload")}</DropdownMenuItem><DropdownMenuItem onClick={() => { setEditingSnippet(null); setForm("website"); }}><Globe />{t("sections.knowledge.addKnowledgeOptions.website")}</DropdownMenuItem><DropdownMenuItem onClick={() => { setEditingSnippet(null); setForm("text"); }}><FileText />{t("sections.knowledge.addKnowledgeOptions.text")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div> : null}</div>
    {documents.isLoading || snippets.isLoading ? <TableCardSkeleton columns={5} /> : <><TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} /></colgroup><TableHeader><TableRow><TableHead>{t("table.title")}</TableHead><TableHead>{t("table.preview")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead className="text-right"><span className={`relative block text-right ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>{t("table.added")}</span></TableHead><TableHead /></TableRow></TableHeader><TableBody>
      {pageRows.length ? pageRows.map((row) => <Fragment key={`${row.entryType}-${row.id}`}><TableRow className={isImportRow(row) ? `${row.websiteImport.status === "failed" ? "h-12" : "h-16"} data-[state=selected]:bg-muted/40` : "h-12 cursor-pointer data-[state=selected]:bg-muted/40"} data-state={viewingDocument?.id === row.id ? "selected" : undefined} onClick={() => { if (isImportRow(row)) return; if (row.entryType === "document") setViewingDocument(viewingDocument?.id === row.id ? null : row); else if (canManage) { setEditingSnippet(row); setForm("text"); } }}><TableCell className="max-w-0 overflow-hidden"><div className="flex min-w-0 items-center gap-2"><span aria-label={t(row.entryType === "snippet" ? "sections.knowledge.textBadge" : row.sourceType === "website" ? "sections.knowledge.websiteImport.badge" : "sections.knowledge.documentBadge")} title={t(row.entryType === "snippet" ? "sections.knowledge.textBadge" : row.sourceType === "website" ? "sections.knowledge.websiteImport.badge" : "sections.knowledge.documentBadge")} className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground">{row.entryType === "snippet" ? <Text className="size-4" /> : row.sourceType === "website" ? <Globe className="size-4" /> : <FileText className="size-4" />}</span><span className="truncate font-medium" title={row.title}>{summarize(row.title, 32)}</span></div></TableCell><TableCell className="max-w-0 overflow-hidden">{uploadProgress(row) ?? <span className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground" title={row.entryType === "snippet" ? previewText(row.content) : documentPreview(row)}>{summarize(row.entryType === "snippet" ? previewText(row.content) : documentPreview(row), 72)}</span>}</TableCell><TableCell>{isImportRow(row) ? <Badge variant={row.websiteImport.status === "failed" || row.websiteImport.status === "cancelled" ? "destructive" : "outline"}>{t(row.websiteImport.status === "failed" || row.websiteImport.status === "cancelled" ? "sections.knowledge.websiteImport.status.failed" : "sections.knowledge.websiteImport.status.inProgress")}</Badge> : row.entryType === "snippet" ? row.active ? <Badge variant="secondary">{t("sections.knowledge.status.indexed")}</Badge> : <Badge variant="outline">{t("table.disabled")}</Badge> : row.active === false ? <Badge variant="outline">{t("table.disabled")}</Badge> : <Badge variant={row.status === "error" ? "destructive" : row.status === "indexed" ? "secondary" : "outline"}>{t(`sections.knowledge.status.${row.status === "processing" ? "indexing" : row.status === "pending" ? "queued" : row.status}`, { defaultValue: row.status })}</Badge>}</TableCell><TableCell className="w-0 max-w-0 text-right whitespace-nowrap"><span className={`relative block truncate text-right text-sm text-muted-foreground ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>{new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</span></TableCell><TableCell className={DATA_TABLE_ROW_ACTIONS_CELL_CLASS} onClick={(event) => event.stopPropagation()}>{canManage ? <DataTableRowActions><DropdownMenu open={openActionId === row.id} onOpenChange={open => setOpenActionId(open ? row.id : null)}><DropdownMenuTrigger aria-expanded={openActionId === row.id} render={<Button aria-label={t("actions.moreOptions")} title={t("actions.moreOptions")} type="button" size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end" side="bottom" sideOffset={8} className="min-w-0 w-fit p-1">{isImportRow(row) ? <DropdownMenuItem onClick={() => setDeleteCandidate(row)} variant="destructive"><Trash2 />{row.websiteImport.status === "failed" ? t("actions.delete") : t("actions.cancelImport")}</DropdownMenuItem> : <><DropdownMenuItem onClick={() => row.entryType === "snippet" ? updateSnippet.mutate({ id: row.id, active: !row.active }) : documentAction.mutate({ id: row.id, method: "PATCH", active: row.active === false })}>{row.active === false ? <Play /> : <Pause />}{row.active === false ? t("actions.enable") : t("actions.disable")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setDeleteCandidate(row)} variant="destructive"><Trash2 />{t("actions.delete")}</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></DataTableRowActions> : null}</TableCell></TableRow>{row.entryType === "document" && viewingDocument?.id === row.id ? <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell className="p-4" colSpan={5}>{documentContent.isLoading ? <div className="space-y-3 rounded-md border border-border/70 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-4 w-full" key={index} />)}</div> : <Textarea className="max-h-80 resize-none overflow-y-auto text-sm leading-relaxed" rows={8} readOnly value={documentContent.isError ? t("sections.knowledge.previewError") : row.status === "error" ? row.error ?? t("sections.knowledge.previewError") : documentContent.data?.content.trim() || t("sections.knowledge.previewPending")} />}</TableCell></TableRow> : null}</Fragment>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>{search ? t("table.empty") : t("sections.knowledge.emptyState")}</TableCell></TableRow>}
    </TableBody></Table></TableCard>
    <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} /></>}
    <AddKnowledgeSheet section="knowledge" mode={editingSnippet ? "edit" : "create"} snippet={editingSnippet} open={form === "text"} onOpenChange={(open) => { if (!open) { setForm(null); setEditingSnippet(null); } }} save={async (values) => { if (editingSnippet) await updateSnippet.mutateAsync({ id: editingSnippet.id, ...values }); else await addSnippet.mutateAsync(values); }} />
    <ImportWebsiteKnowledgeSheet open={form === "website"} onOpenChange={(open) => { if (!open) setForm(null); }} save={async (sourceUrl) => { await addWebsite.mutateAsync({ title: sourceUrl, sourceUrl }); }} />
    <UploadKnowledgeDocumentSheet section="knowledge" open={form === "upload"} onOpenChange={(open) => { if (!open) setForm(null); }} upload={async (values) => { await uploadDocument.mutateAsync(values); }} />
    <ConfirmDeleteDialog cancelLabel={t("actions.deleteCancel")} confirmLabel={t(cancellingImport ? "actions.cancelImport" : "actions.delete")} description={t(cancellingImport ? "actions.cancelImportDescription" : "actions.deleteDescription")} onConfirm={async () => { if (!deleteCandidate) return; if (deleteCandidate.entryType === "snippet") await deleteSnippet.mutateAsync(deleteCandidate.id); else await documentAction.mutateAsync({ id: deleteCandidate.id, method: cancellingImport ? "PATCH" : "DELETE", ...(cancellingImport ? { action: "cancel" } : {}) }); }} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }} open={deleteCandidate !== null} pending={deleteSnippet.isPending || documentAction.isPending} title={t(cancellingImport ? "actions.cancelImportTitle" : "actions.deleteTitle")} />
  </div></PageSurface>;
}
