"use client";

import { getCoreRowModel, getPaginationRowModel, useReactTable, type PaginationState } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { selectActiveBusiness } from "@/lib/active-business";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { DataTablePagination } from "./data-table/pagination";
import { TableCardSkeleton } from "./loading-skeletons";
import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";

type Business = { businessId: string; name: string; active: boolean; role: string };
type Service = { id: string; name: string; slug: string; durationMinutes: number; description: string | null; active: boolean; createdAt: string };
type Catalog = { services: Service[] };
type ServiceValues = { name: string; description: string; durationMinutes: string; active: boolean };

const emptyValues: ServiceValues = { name: "", description: "", durationMinutes: "30", active: true };

function serviceSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "service";
}

function summarize(value: string, length = 72): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 3).trimEnd()}...` : normalized;
}

export function LiveServicesSurface() {
  const { i18n, t } = useTranslation("agent");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const catalog = useQuery({ queryKey: ["catalog", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}&limit=100`) });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] }); };
  const saveService = useMutation({
    mutationFn: ({ service, values }: { service: Service | null; values: ServiceValues }) => {
      const payload = { name: values.name.trim(), slug: service?.slug ?? serviceSlug(values.name), durationMinutes: Number(values.durationMinutes), description: values.description.trim() || null, active: values.active };
      return service
        ? requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(payload) })
        : requestJson("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, ...payload }) });
    },
    onSuccess: invalidate,
  });
  const toggleService = useMutation({ mutationFn: (service: Service) => requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ active: !service.active }) }), onSuccess: invalidate });
  const services = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = catalog.data?.services ?? [];
    return query ? rows.filter((service) => `${service.name} ${service.description ?? ""} ${service.durationMinutes}`.toLowerCase().includes(query)) : rows;
  }, [catalog.data, search]);
  const table = useReactTable({ data: services, columns: [], getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), onPaginationChange: setPagination, state: { pagination } });
  const pageRows = table.getRowModel().rows.map((row) => row.original);

  useEffect(() => { setPagination((current) => ({ ...current, pageIndex: 0 })); }, [search]);

  if (businesses.isLoading || catalog.isLoading) return <TableCardSkeleton columns={5} />;
  if (businesses.isError || catalog.isError) return <p className="text-sm text-destructive">{t("sections.services.unavailable")}</p>;
  if (!business) return <PageSurface description="" title=""><p className="text-sm text-muted-foreground">{t("empty.description")}</p></PageSurface>;

  return <PageSurface description="" title=""><div className="flex w-full flex-col gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("table.searchPlaceholder")} value={search} /></div>{canManage ? <Button onClick={() => { setEditingService(null); setEditorOpen(true); }}><Plus data-icon="inline-start" />{t("sections.services.addKnowledge")}</Button> : null}</div>
    <TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[18%]" /><col className="w-[42%]" /><col className="w-[14%]" /><col className="w-[18%]" /><col className="w-12" /></colgroup><TableHeader><TableRow><TableHead>{t("table.title")}</TableHead><TableHead>{t("table.preview")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead className="text-right">{t("table.added")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{pageRows.length ? pageRows.map((service) => <TableRow className={canManage ? "h-12 cursor-pointer" : "h-12"} key={service.id} onClick={() => { if (canManage) { setEditingService(service); setEditorOpen(true); } }}><TableCell className="max-w-0 overflow-hidden"><span className="block truncate font-medium" title={service.name}>{summarize(service.name, 32)}</span></TableCell><TableCell className="max-w-0 overflow-hidden"><span className="block truncate text-sm text-muted-foreground" title={service.description ?? t("sections.services.durationValue", { count: service.durationMinutes })}>{summarize(service.description ?? t("sections.services.durationValue", { count: service.durationMinutes }))}</span></TableCell><TableCell>{service.active ? <Badge variant="secondary">{t("sections.services.status.indexed")}</Badge> : <Badge variant="outline">{t("table.disabled")}</Badge>}</TableCell><TableCell className="text-right text-sm text-muted-foreground">{formatDateTime(service.createdAt, i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeStyle: "short" })}</TableCell><TableCell onClick={(event) => event.stopPropagation()}>{canManage ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("actions.moreOptions")} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setEditingService(service); setEditorOpen(true); }}>{t("sections.services.editKnowledge")}</DropdownMenuItem><DropdownMenuItem onClick={() => toggleService.mutate(service)}>{service.active ? t("actions.disable") : t("actions.enable")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</TableCell></TableRow>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>{search ? t("table.empty") : t("sections.services.emptyState")}</TableCell></TableRow>}</TableBody></Table></TableCard>
    <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} />
    <ServiceEditor editing={editingService} onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditingService(null); }} open={editorOpen} pending={saveService.isPending} save={async (values) => { await saveService.mutateAsync({ service: editingService, values }); setEditorOpen(false); setEditingService(null); }} />
  </div></PageSurface>;
}

function ServiceEditor({ editing, onOpenChange, open, pending, save }: { editing: Service | null; onOpenChange: (open: boolean) => void; open: boolean; pending: boolean; save: (values: ServiceValues) => Promise<void> }) {
  const { t } = useTranslation("agent");
  const titleId = useId(); const durationId = useId(); const descriptionId = useId();
  const [values, setValues] = useState<ServiceValues>(emptyValues);
  useEffect(() => { if (open) setValues(editing ? { name: editing.name, description: editing.description ?? "", durationMinutes: String(editing.durationMinutes), active: editing.active } : emptyValues); }, [editing, open]);
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t(editing ? "sections.services.editKnowledge" : "sections.services.addKnowledge")}</DialogTitle><DialogDescription>{t(editing ? "sections.services.editKnowledgeDescription" : "sections.services.addKnowledgeDescription")}</DialogDescription></DialogHeader><form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void save(values); }}><FieldGroup><Field><FieldContent><FieldLabel htmlFor={titleId}>{t("sections.services.fields.title.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.title.hint")}</FieldDescription></FieldContent><Input id={titleId} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder={t("sections.services.fields.title.placeholder")} required value={values.name} /></Field><Field><FieldContent><FieldLabel htmlFor={durationId}>{t("sections.services.fields.duration.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.duration.hint")}</FieldDescription></FieldContent><Input id={durationId} min="1" onChange={(event) => setValues((current) => ({ ...current, durationMinutes: event.target.value }))} placeholder={t("sections.services.fields.duration.placeholder")} required type="number" value={values.durationMinutes} /></Field><Field><FieldContent><FieldLabel htmlFor={descriptionId}>{t("sections.services.fields.content.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.content.hint")}</FieldDescription></FieldContent><Textarea className="min-h-40" id={descriptionId} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder={t("sections.services.fields.content.placeholder")} value={values.description} /></Field><Field orientation="horizontal"><FieldContent><FieldLabel>{t("sections.services.fields.active.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.active.hint")}</FieldDescription></FieldContent><Switch checked={values.active} onCheckedChange={(active) => setValues((current) => ({ ...current, active }))} /></Field></FieldGroup><DialogFooter><Button className="w-full" disabled={pending || !values.name.trim() || Number(values.durationMinutes) < 1} type="submit">{pending ? t("actions.saving") : t(editing ? "actions.saveChanges" : "actions.save")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
