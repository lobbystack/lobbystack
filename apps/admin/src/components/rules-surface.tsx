"use client";

import { useTable, type PaginationState } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSetupAction } from "@/lib/use-setup-action";
import { requestJson } from "@/lib/request-json";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTablePagination, paginationFeatures } from "./data-table/pagination";
import { TableCardSkeleton } from "./loading-skeletons";
import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { intlLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

type Rule = { id: string; title: string; content: string; active: boolean; sortOrder: number; createdAt: string };

function summarize(value: string, length: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 3).trimEnd()}...` : normalized;
}

export function RulesSurface() {
  const { i18n, t } = useTranslation("agent");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Rule | null>(null);
  // A row is only draggable while its handle is held, so text selection and row clicks keep working.
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const { businesses, business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  useSetupAction(canManage, useCallback((action: string) => { if (action !== "rule") return false; setEditingRule(null); setDialogOpen(true); return true; }, []));
  const rules = useQuery({ queryKey: ["rules", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<Rule[]>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`) });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["rules", business?.businessId] }); };
  const createRule = useMutation({ mutationFn: (input: { title: string; content: string }) => requestJson<string>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "POST", body: JSON.stringify(input) }), onSuccess: invalidate });
  const updateRule = useMutation({ mutationFn: (input: { ruleId: string; title?: string; content?: string; active?: boolean }) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(input) }), onSuccess: invalidate });
  const deleteRule = useMutation({ mutationFn: (ruleId: string) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify({ ruleId }) }), onSuccess: invalidate });
  const reorderRules = useMutation({
    mutationFn: (ruleIds: string[]) => requestJson<{ ok: boolean }>(`/api/rules?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ ruleIds }) }),
    onMutate: async (ruleIds) => {
      await queryClient.cancelQueries({ queryKey: ["rules", business?.businessId] });
      queryClient.setQueryData<Rule[]>(["rules", business?.businessId], (current) => current?.map((rule) => ({ ...rule, sortOrder: ruleIds.indexOf(rule.id) })));
    },
    onSettled: invalidate,
  });

  const orderedRules = useMemo(() => [...(rules.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder), [rules.data]);
  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? orderedRules.filter((rule) => `${rule.title} ${rule.content}`.toLowerCase().includes(query)) : orderedRules;
  }, [orderedRules, search]);
  const table = useTable({ features: paginationFeatures, data: filteredRules, columns: [], onPaginationChange: setPagination, state: { pagination } });
  const pageRows = table.getRowModel().rows.map((row) => row.original);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(filteredRules.length / pagination.pageSize));
    if (pagination.pageIndex >= pageCount) setPagination((current) => ({ ...current, pageIndex: pageCount - 1 }));
  }, [filteredRules.length, pagination.pageIndex, pagination.pageSize]);

  function moveRule(rule: Rule, direction: -1 | 1) {
    const index = orderedRules.findIndex((candidate) => candidate.id === rule.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedRules.length) return;
    const reordered = [...orderedRules];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex]!, reordered[index]!];
    reorderRules.mutate(reordered.map((candidate) => candidate.id));
  }

  function endDrag() {
    setDragArmed(null);
    setDraggingId(null);
    setDropTarget(null);
  }

  function dropRule() {
    const dragged = draggingId;
    const target = dropTarget;
    endDrag();
    if (!dragged || !target || dragged === target.id) return;
    const ids = orderedRules.map((rule) => rule.id).filter((id) => id !== dragged);
    ids.splice(ids.indexOf(target.id) + (target.after ? 1 : 0), 0, dragged);
    if (ids.some((id, index) => id !== orderedRules[index]?.id)) reorderRules.mutate(ids);
  }

  if (businesses.isLoading) return <p className="text-sm text-muted-foreground">{t("loading.workspace")}</p>;
  if (!business) return <PageSurface title={t("sections.rules.title")}><p className="text-sm text-muted-foreground">{t("empty.description")}</p></PageSurface>;

  return (
    <PageSurface title={t("sections.rules.title")}>
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("table.searchPlaceholder")} value={search} /></div>
          {canManage ? <div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={() => { setEditingRule(null); setDialogOpen(true); }}><Plus data-icon="inline-start" />{t("sections.rules.addKnowledge")}</Button></div> : null}
        </div>
        {rules.isLoading ? <TableCardSkeleton columns={5} /> : <><TableCard>
          <Table className="min-w-[60rem] w-full table-fixed">
            <colgroup>{canManage ? <col className="w-10" /> : null}<col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className="w-12" /></colgroup>
            <TableHeader><TableRow>{canManage ? <TableHead /> : null}<TableHead>{t("table.title")}</TableHead><TableHead>{t("table.preview")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead className="text-right">{t("table.added")}</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {pageRows.length ? pageRows.map((rule) => {
                const orderedIndex = orderedRules.findIndex((candidate) => candidate.id === rule.id);
                const dropLine = dropTarget?.id === rule.id && draggingId !== rule.id ? (dropTarget.after ? "shadow-[inset_0_-2px_0_var(--primary)]" : "shadow-[inset_0_2px_0_var(--primary)]") : "";
                return <TableRow
                  className={cn(canManage ? "h-12 cursor-pointer" : "h-12", draggingId === rule.id && "opacity-50", dropLine)}
                  draggable={canManage && dragArmed === rule.id}
                  key={rule.id}
                  onClick={() => { if (canManage) { setEditingRule(rule); setDialogOpen(true); } }}
                  onDragEnd={endDrag}
                  onDragOver={(event) => {
                    if (!draggingId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const box = event.currentTarget.getBoundingClientRect();
                    const after = event.clientY > box.top + box.height / 2;
                    if (dropTarget?.id !== rule.id || dropTarget.after !== after) setDropTarget({ id: rule.id, after });
                  }}
                  onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", rule.id); setDraggingId(rule.id); }}
                  onDrop={(event) => { event.preventDefault(); dropRule(); }}
                >
                  {canManage ? <TableCell className="pr-0" onClick={(event) => event.stopPropagation()}><span aria-hidden="true" className={cn("flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", reorderRules.isPending ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing")} onPointerDown={() => { if (!reorderRules.isPending) setDragArmed(rule.id); }} onPointerUp={() => setDragArmed(null)} title={t("actions.dragToReorder")}><GripVertical className="size-4" /></span></TableCell> : null}
                  <TableCell className="max-w-0 overflow-hidden"><span className="block truncate font-medium" title={rule.title}>{summarize(rule.title, 32)}</span></TableCell>
                  <TableCell className="max-w-0 overflow-hidden"><span className="block truncate text-sm text-muted-foreground" title={rule.content}>{summarize(rule.content, 72)}</span></TableCell>
                  <TableCell>{rule.active ? <Badge variant="secondary">{t("sections.rules.status.indexed")}</Badge> : <Badge variant="outline">{t("table.disabled")}</Badge>}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage), { dateStyle: "medium", timeStyle: "short" }).format(new Date(rule.createdAt))}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>{canManage ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("actions.moreOptions")} size="icon-sm" type="button" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end" className="min-w-0 w-fit p-1"><DropdownMenuItem onClick={() => { setEditingRule(rule); setDialogOpen(true); }}><Pencil />{t("actions.edit")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={orderedIndex === 0 || reorderRules.isPending} onClick={() => moveRule(rule, -1)}><ArrowUp />{t("actions.moveUp")}</DropdownMenuItem><DropdownMenuItem disabled={orderedIndex === orderedRules.length - 1 || reorderRules.isPending} onClick={() => moveRule(rule, 1)}><ArrowDown />{t("actions.moveDown")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={updateRule.isPending} onClick={() => updateRule.mutate({ ruleId: rule.id, active: !rule.active })}>{rule.active ? <Pause /> : <Play />}{rule.active ? t("actions.disable") : t("actions.enable")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setDeleteCandidate(rule)} variant="destructive"><Trash2 />{t("actions.delete")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</TableCell>
                </TableRow>;
              }) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={canManage ? 6 : 5}>{search ? t("table.empty") : t("sections.rules.emptyState")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableCard>
        <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} /></>}
        <RuleDialog editingRule={editingRule} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingRule(null); }} open={dialogOpen} pending={createRule.isPending || updateRule.isPending} save={async (input) => { if (editingRule) await updateRule.mutateAsync({ ruleId: editingRule.id, ...input }); else await createRule.mutateAsync(input); setDialogOpen(false); setEditingRule(null); }} />
        <ConfirmActionDialog confirmVariant="destructive" cancelLabel={t("actions.deleteCancel")} confirmLabel={t("actions.delete")} description={t("actions.deleteDescription")} onConfirm={async () => { if (!deleteCandidate) return; await deleteRule.mutateAsync(deleteCandidate.id); toast.success(t("actions.deleted")); }} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }} open={deleteCandidate !== null} pending={deleteRule.isPending} title={t("actions.deleteTitle")} />
      </div>
    </PageSurface>
  );
}

function RuleDialog({ editingRule, onOpenChange, open, pending, save }: { editingRule: Rule | null; onOpenChange: (open: boolean) => void; open: boolean; pending: boolean; save: (input: { title: string; content: string }) => Promise<void> }) {
  const { t } = useTranslation("agent");
  const titleId = useId();
  const contentId = useId();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (open) { setTitle(editingRule?.title ?? ""); setContent(editingRule?.content ?? ""); setSubmitted(false); } }, [editingRule, open]);
  const titleMissing = submitted && !title.trim();
  const contentMissing = submitted && !content.trim();
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent ><DialogHeader><DialogTitle>{t(editingRule ? "sections.rules.editKnowledge" : "sections.rules.addKnowledge")}</DialogTitle><DialogDescription>{t(editingRule ? "sections.rules.editKnowledgeDescription" : "sections.rules.addKnowledgeDescription")}</DialogDescription></DialogHeader><form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!pending && title.trim() && content.trim()) void save({ title: title.trim(), content: content.trim() }); }}><FieldGroup><Field data-invalid={titleMissing || undefined}><FieldContent><FieldLabel htmlFor={titleId}>{t("sections.rules.fields.title.label")}</FieldLabel><FieldDescription>{t("sections.rules.fields.title.hint")}</FieldDescription></FieldContent><Input aria-describedby={titleMissing ? `${titleId}-error` : undefined} aria-invalid={titleMissing || undefined} id={titleId} onChange={(event) => setTitle(event.target.value)} placeholder={t("sections.rules.fields.title.placeholder")} value={title} />{titleMissing ? <FieldError id={`${titleId}-error`}>{t("sections.rules.fields.title.required")}</FieldError> : null}</Field><Field data-invalid={contentMissing || undefined}><FieldContent><FieldLabel htmlFor={contentId}>{t("sections.rules.fields.content.label")}</FieldLabel><FieldDescription>{t("sections.rules.fields.content.hint")}</FieldDescription></FieldContent><Textarea aria-describedby={contentMissing ? `${contentId}-error` : undefined} aria-invalid={contentMissing || undefined} className="min-h-40" id={contentId} onChange={(event) => setContent(event.target.value)} placeholder={t("sections.rules.fields.content.placeholder")} value={content} />{contentMissing ? <FieldError id={`${contentId}-error`}>{t("sections.rules.fields.content.required")}</FieldError> : null}</Field></FieldGroup><DialogFooter><Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("actions.cancel")}</Button><Button disabled={pending} type="submit">{pending ? t("actions.saving") : t(editingRule ? "actions.save" : "actions.add")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
