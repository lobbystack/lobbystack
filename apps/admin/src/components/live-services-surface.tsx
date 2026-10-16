"use client";

import { useTable, type PaginationState } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, HandHelping, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { currencyFractionDigits, formatServicePrice, intlLocale, isDiscountPercent, servicePriceFromColumns, servicePriceTypes, type ServicePriceType } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { useSetupAction } from "@/lib/use-setup-action";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { DataTablePagination, paginationFeatures } from "./data-table/pagination";
import { TableCardSkeleton } from "./loading-skeletons";
import { PageSurface } from "./page-surface";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DurationPicker, formatDuration } from "./ui/duration-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";

type Service = { id: string; name: string; slug: string; durationMinutes: number; description: string | null; priceType: ServicePriceType; priceMinor: number | null; priceMaxMinor: number | null; discountPercent: number; active: boolean; createdAt: string };
type Catalog = { currency: string; services: Service[] };
type ServiceValues = { name: string; description: string; durationMinutes: string; priceType: ServicePriceType; price: string; priceMax: string; discountEnabled: boolean; discount: string; active: boolean };

const emptyValues: ServiceValues = { name: "", description: "", durationMinutes: "30", priceType: "fixed", price: "", priceMax: "", discountEnabled: false, discount: "", active: true };

type PriceError = "invalid" | "rangeIncomplete" | "rangeOrder" | "discountInvalid";

/** The price the editor's fields describe, or why they don't describe one. Empty amounts mean no price. */
export function readPrice(values: ServiceValues, currency: string, locale: string): { priceType: ServicePriceType; priceMinor: number | null; priceMaxMinor: number | null; discountPercent: number } | { error: PriceError } {
  if (values.priceType === "in_person") return { priceType: "in_person", priceMinor: null, priceMaxMinor: null, discountPercent: 0 };
  const discountText = values.discountEnabled ? values.discount.trim() : "";
  const discountPercent = discountText ? Number(discountText) : 0;
  if (!/^(\d{1,3}(\.\d{0,2})?)?$/u.test(discountText) || !isDiscountPercent(discountPercent)) return { error: "discountInvalid" };
  const amount = parsePriceInput(values.price, currency, locale);
  if (values.priceType !== "range") return amount === undefined ? { error: "invalid" } : { priceType: values.priceType, priceMinor: amount, priceMaxMinor: null, discountPercent };
  const max = parsePriceInput(values.priceMax, currency, locale);
  if (amount === undefined || max === undefined) return { error: "invalid" };
  if ((amount === null) !== (max === null)) return { error: "rangeIncomplete" };
  if (amount !== null && max !== null && max <= amount) return { error: "rangeOrder" };
  return { priceType: "range", priceMinor: amount, priceMaxMinor: max, discountPercent };
}

/** The locale's grouping and decimal marks: "," and "." in English, a narrow space and "," in French, "." and "," in Spanish and Serbian. */
function numberMarks(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(intlLocale(locale)).formatToParts(1_234_567.8);
  return { group: parts.find((part) => part.type === "group")?.value ?? ",", decimal: parts.find((part) => part.type === "decimal")?.value ?? "." };
}

/**
 * Price text as its whole digits and, after a decimal mark, its decimals.
 * A "," or "." that isn't the locale's grouping mark is the decimal mark, so
 * "12,50" is 12.50 in French, Spanish and Serbian; with both marks, the last
 * one is, so "1,234.50" and "1.234,50" read the same anywhere. `marks` counts
 * decimal marks, more than one when the text isn't a number.
 */
function splitPrice(text: string, locale: string): { whole: string; decimals: string | undefined; marks: number } {
  const { group } = numberMarks(locale);
  const value = text.replace(/[^\d.,]/gu, "");
  const found = value.match(/[.,]/gu) ?? [];
  const decimal = new Set(found).size > 1 ? found.at(-1) : found.find((mark) => mark !== group);
  const [whole = "", ...rest] = decimal ? value.split(decimal) : [value];
  return { whole: whole.replace(/\D/gu, ""), decimals: decimal ? rest.join("").replace(/\D/gu, "") : undefined, marks: rest.length };
}

/** Whole digits grouped the locale's way, then its decimal mark and the decimals, if any. */
function joinPrice(whole: string, decimals: string | undefined, locale: string): string {
  const { group, decimal } = numberMarks(locale);
  const grouped = whole.replace(/^0+(?=\d)/u, "").replace(/\B(?=(\d{3})+(?!\d))/gu, group);
  return decimals === undefined ? grouped : `${grouped || "0"}${decimal}${decimals}`;
}

/** Typed or pasted price text as the price input shows it, "3,500" or "1 234,5": grouped the locale's way, with at most the currency's decimals. */
export function formatPriceTyping(text: string, currency: string, locale: string): string {
  const { whole, decimals } = splitPrice(text, locale);
  const digits = currencyFractionDigits(currency);
  return joinPrice(whole, digits && decimals !== undefined ? decimals.slice(0, digits) : undefined, locale);
}

/** The price text in the currency's smallest unit: null when empty, undefined when it isn't a price in this currency. */
export function parsePriceInput(text: string, currency: string, locale: string): number | null | undefined {
  if (!text.trim()) return null;
  if (/[^\d\s.,]/u.test(text)) return undefined;
  const { whole, decimals = "", marks } = splitPrice(text, locale);
  const digits = currencyFractionDigits(currency);
  if (marks > 1 || (!whole && !decimals) || decimals.length > digits) return undefined;
  const minor = Number(whole || "0") * 10 ** digits + Number(decimals.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : undefined;
}

/** A stored price as the price input shows it: "3,500" or "12,50", which parsePriceInput reads back to the same amount. */
export function priceInputValue(priceMinor: number | null, currency: string, locale: string): string {
  if (priceMinor === null) return "";
  const unit = 10 ** currencyFractionDigits(currency);
  return joinPrice(String(Math.floor(priceMinor / unit)), priceMinor % unit ? String(priceMinor % unit).padStart(String(unit).length - 1, "0") : undefined, locale);
}

/** A discount as the locale writes it, "12,5" in Serbian; grouping off for the editor's input. */
function formatPercent(value: number, locale: string, useGrouping = true): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping }).format(value);
}

/** Where the caret goes after reformatting: before the same number of digits it had after it. */
function caretBefore(text: string, digitsAfter: number): number {
  let position = text.length;
  for (let seen = 0; position > 0 && seen < digitsAfter; position -= 1) if (/\d/u.test(text[position - 1]!)) seen += 1;
  return position;
}

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
  const [deleteCandidate, setDeleteCandidate] = useState<Service | null>(null);
  const { businesses, business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  useSetupAction(canManage, useCallback((action: string) => { if (action !== "service") return false; setEditingService(null); setEditorOpen(true); return true; }, []));
  const catalog = useQuery({ queryKey: ["catalog", business?.businessId], enabled: Boolean(business), queryFn: () => requestJson<Catalog>(`/api/catalog?businessId=${encodeURIComponent(business!.businessId)}&limit=100`) });
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["catalog", business?.businessId] }); };
  const saveService = useMutation({
    mutationFn: ({ service, values }: { service: Service | null; values: ServiceValues }) => {
      const price = readPrice(values, catalog.data?.currency ?? "USD", i18n.language);
      const payload = { name: values.name.trim(), slug: service?.slug ?? serviceSlug(values.name), durationMinutes: Number(values.durationMinutes), description: values.description.trim() || null, ...("error" in price ? {} : price), active: values.active };
      return service
        ? requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify(payload) })
        : requestJson("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, ...payload }) });
    },
    onSuccess: invalidate,
  });
  const deleteService = useMutation({ mutationFn: (service: Service) => requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }), onSuccess: invalidate });
  const toggleService = useMutation({ mutationFn: (service: Service) => requestJson(`/api/catalog/${encodeURIComponent(service.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ active: !service.active }) }), onSuccess: invalidate });
  const duplicateService = useMutation({
    mutationFn: (service: Service) => {
      const existing = catalog.data?.services ?? [];
      const names = new Set(existing.map((row) => row.name.toLowerCase()));
      const slugs = new Set(existing.map((row) => row.slug));
      let number = 1;
      const copyName = () => number === 1 ? t("sections.services.copyName", { name: service.name }) : t("sections.services.copyNameNumbered", { name: service.name, number });
      while (names.has(copyName().toLowerCase())) number += 1;
      const name = copyName();
      const base = serviceSlug(name);
      let slug = base;
      for (let suffix = 2; slugs.has(slug); suffix += 1) slug = `${base}-${suffix}`;
      return requestJson("/api/catalog", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, name, slug, durationMinutes: service.durationMinutes, description: service.description, priceType: service.priceType, priceMinor: service.priceMinor, priceMaxMinor: service.priceMaxMinor, discountPercent: service.discountPercent, active: service.active }) });
    },
    onSuccess: async () => { await invalidate(); toast.success(t("sections.services.duplicated")); },
    onError: () => { toast.error(t("sections.services.duplicateFailed")); },
  });
  const services = useMemo(() => {
    const query = search.trim().toLowerCase();
    const collator = new Intl.Collator(i18n.resolvedLanguage ?? i18n.language, { numeric: true, sensitivity: "base" });
    const rows = [...(catalog.data?.services ?? [])].sort((left, right) => collator.compare(left.name, right.name));
    return query ? rows.filter((service) => `${service.name} ${service.description ?? ""} ${service.durationMinutes}`.toLowerCase().includes(query)) : rows;
  }, [catalog.data, search, i18n.language, i18n.resolvedLanguage]);
  // Refetches after a duplicate or edit change `data`; stay on the page instead of jumping to the first.
  const table = useTable({ features: paginationFeatures, data: services, columns: [], autoResetPageIndex: false, onPaginationChange: setPagination, state: { pagination } });
  const pageRows = table.getRowModel().rows.map((row) => row.original);

  useEffect(() => { setPagination((current) => ({ ...current, pageIndex: 0 })); }, [search]);
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(services.length / pagination.pageSize) - 1);
    if (pagination.pageIndex > lastPage) setPagination((current) => ({ ...current, pageIndex: lastPage }));
  }, [services.length, pagination.pageIndex, pagination.pageSize]);

  if (businesses.isLoading) return <TableCardSkeleton columns={6} />;
  if (businesses.isError || catalog.isError) return <p className="text-sm text-destructive">{t("sections.services.unavailable")}</p>;
  if (!business) return <PageSurface title=""><p className="text-sm text-muted-foreground">{t("empty.description")}</p></PageSurface>;

  return <PageSurface title=""><div className="flex w-full flex-col gap-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-sm flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" onChange={(event) => setSearch(event.target.value)} placeholder={t("table.searchPlaceholder")} value={search} /></div>{canManage ? <div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={() => { setEditingService(null); setEditorOpen(true); }}><Plus data-icon="inline-start" />{t("sections.services.addKnowledge")}</Button></div> : null}</div>
    {catalog.isLoading ? <TableCardSkeleton columns={6} /> : <><TableCard><Table className="min-w-[60rem] w-full table-fixed"><colgroup><col className="w-[20%]" /><col className="w-[34%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-12" /></colgroup><TableHeader><TableRow><TableHead>{t("table.title")}</TableHead><TableHead>{t("table.preview")}</TableHead><TableHead>{t("sections.services.price.column")}</TableHead><TableHead>{t("table.status")}</TableHead><TableHead className="text-right">{t("table.added")}</TableHead><TableHead /></TableRow></TableHeader><TableBody>{pageRows.length ? pageRows.map((service) => <TableRow className={canManage ? "h-12 cursor-pointer" : "h-12"} key={service.id} onClick={() => { if (canManage) { setEditingService(service); setEditorOpen(true); } }}><TableCell className="max-w-0 overflow-hidden"><div className="flex min-w-0 items-center gap-2"><HandHelping aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="block truncate font-medium" title={service.name}>{summarize(service.name, 32)}</span></div></TableCell><TableCell className="max-w-0 overflow-hidden"><span className="block truncate text-sm text-muted-foreground" title={service.description ?? t("sections.services.durationValue", { duration: formatDuration(service.durationMinutes, intlLocale(i18n.language)) })}>{summarize(service.description ?? t("sections.services.durationValue", { duration: formatDuration(service.durationMinutes, intlLocale(i18n.language)) }))}</span></TableCell><TableCell className="truncate text-sm whitespace-nowrap tabular-nums">{servicePriceFromColumns(service, catalog.data!.currency) ? formatServicePrice(servicePriceFromColumns(service, catalog.data!.currency)!, intlLocale(i18n.language), { from: (amount) => t("sections.services.price.from", { amount }), range: (min, max) => t("sections.services.price.range", { min, max }), inPerson: t("sections.services.price.inPerson"), discounted: (_regular, percent, discounted) => t("sections.services.price.discounted", { price: discounted, percent: formatPercent(percent, intlLocale(i18n.language)) }) }) : <span className="text-muted-foreground">{t("sections.services.price.none")}</span>}</TableCell><TableCell>{service.active ? <Badge variant="secondary">{t("sections.services.status.indexed")}</Badge> : <Badge variant="outline">{t("table.disabled")}</Badge>}</TableCell><TableCell className="text-right text-sm text-muted-foreground">{formatDateTime(service.createdAt, i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium", timeStyle: "short" })}</TableCell><TableCell onClick={(event) => event.stopPropagation()}>{canManage ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("actions.moreOptions")} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end" className="min-w-0 w-fit p-1"><DropdownMenuItem onClick={() => { setEditingService(service); setEditorOpen(true); }}><Pencil />{t("sections.services.edit")}</DropdownMenuItem><DropdownMenuItem disabled={duplicateService.isPending} onClick={() => duplicateService.mutate(service)}><Copy />{t("sections.services.duplicate")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => toggleService.mutate(service)}>{service.active ? <Pause /> : <Play />}{service.active ? t("actions.disable") : t("actions.enable")}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setDeleteCandidate(service)} variant="destructive"><Trash2 />{t("actions.delete")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}</TableCell></TableRow>) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>{search ? t("table.empty") : t("sections.services.emptyState")}</TableCell></TableRow>}</TableBody></Table></TableCard>
    <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} /></>}
    <ConfirmActionDialog cancelLabel={t("actions.deleteCancel")} confirmLabel={t("actions.delete")} confirmVariant="destructive" description={t("sections.services.deleteDescription")} onConfirm={async () => { if (!deleteCandidate) return; await deleteService.mutateAsync(deleteCandidate); setDeleteCandidate(null); toast.success(t("actions.deleted")); }} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }} open={deleteCandidate !== null} pending={deleteService.isPending} title={t("sections.services.deleteTitle")} />
    <ServiceEditor currency={catalog.data?.currency ?? "USD"} editing={editingService} onOpenChange={(open) => { setEditorOpen(open); if (!open) setEditingService(null); }} open={editorOpen} pending={saveService.isPending} save={async (values) => { await saveService.mutateAsync({ service: editingService, values }); setEditorOpen(false); setEditingService(null); }} />
  </div></PageSurface>;
}

function ServiceEditor({ currency, editing, onOpenChange, open, pending, save }: { currency: string; editing: Service | null; onOpenChange: (open: boolean) => void; open: boolean; pending: boolean; save: (values: ServiceValues) => Promise<void> }) {
  const { i18n, t } = useTranslation("agent");
  const titleId = useId(); const durationId = useId(); const descriptionId = useId(); const activeId = useId(); const priceId = useId(); const discountId = useId();
  const discountInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ServiceValues>(emptyValues);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (open) { setValues(editing ? { name: editing.name, description: editing.description ?? "", durationMinutes: String(editing.durationMinutes), priceType: editing.priceType, price: priceInputValue(editing.priceMinor, currency, i18n.language), priceMax: priceInputValue(editing.priceMaxMinor, currency, i18n.language), discountEnabled: editing.discountPercent > 0, discount: editing.discountPercent > 0 ? String(editing.discountPercent) : "", active: editing.active } : emptyValues); setSubmitted(false); } }, [currency, editing, i18n.language, open]);
  const price = readPrice(values, currency, i18n.language);
  const priceValid = !("error" in price);
  const discountedPrice = values.discountEnabled && !("error" in price) && price.discountPercent > 0 ? servicePriceFromColumns(price, currency) : undefined;
  const discountPreview = discountedPrice ? formatServicePrice(discountedPrice, intlLocale(i18n.language), { from: (amount) => t("sections.services.price.from", { amount }), range: (min, max) => t("sections.services.price.range", { min, max }), inPerson: "", discounted: (regular, _percent, discounted) => t("sections.services.fields.price.discountPreview", { price: discounted, regular }) }) : null;
  const priceInvalid = submitted && !priceValid;
  const amountInput = (field: "price" | "priceMax", label: string) => <InputGroup className="w-full min-w-0"><InputGroupInput aria-describedby={priceInvalid ? `${priceId}-error` : undefined} aria-invalid={priceInvalid || undefined} aria-label={label} className="tabular-nums" inputMode="decimal" onChange={(event) => {
    const input = event.target;
    // Keep the caret before the same digits once grouping marks are added or removed.
    const digitsAfter = input.value.slice(input.selectionStart ?? input.value.length).replace(/\D/gu, "").length;
    const next = formatPriceTyping(input.value, currency, i18n.language);
    setValues((current) => ({ ...current, [field]: next }));
    requestAnimationFrame(() => { const caret = caretBefore(next, digitsAfter); input.setSelectionRange(caret, caret); });
  }} placeholder={t("sections.services.fields.price.placeholder")} type="text" value={values[field]} /><InputGroupAddon align="inline-end"><InputGroupText>{currency}</InputGroupText></InputGroupAddon></InputGroup>;
  const nameMissing = submitted && !values.name.trim();
  const durationInvalid = submitted && !(Number.isInteger(Number(values.durationMinutes)) && Number(values.durationMinutes) > 0);
  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-md"><DialogHeader><DialogTitle>{t(editing ? "sections.services.editKnowledge" : "sections.services.addKnowledge")}</DialogTitle><DialogDescription>{t(editing ? "sections.services.editKnowledgeDescription" : "sections.services.addKnowledgeDescription")}</DialogDescription></DialogHeader><form className="flex min-h-0 flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!pending && values.name.trim() && Number.isInteger(Number(values.durationMinutes)) && Number(values.durationMinutes) > 0 && priceValid) void save(values); }}><div className="-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1"><FieldGroup><Field data-invalid={nameMissing || undefined}><FieldContent><FieldLabel htmlFor={titleId}>{t("sections.services.fields.title.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.title.hint")}</FieldDescription></FieldContent><Input aria-describedby={nameMissing ? `${titleId}-error` : undefined} aria-invalid={nameMissing || undefined} id={titleId} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} placeholder={t("sections.services.fields.title.placeholder")} value={values.name} />{nameMissing ? <FieldError id={`${titleId}-error`}>{t("sections.services.fields.title.required")}</FieldError> : null}</Field><Field data-invalid={durationInvalid || undefined}><FieldContent><FieldLabel htmlFor={durationId}>{t("sections.services.fields.duration.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.duration.hint")}</FieldDescription></FieldContent><DurationPicker aria-describedby={durationInvalid ? `${durationId}-error` : undefined} className="w-40" columnLabels={{ hours: t("sections.services.fields.duration.hours"), minutes: t("sections.services.fields.duration.minutes") }} columnTitles={{ hours: t("sections.services.fields.duration.hoursTitle"), minutes: t("sections.services.fields.duration.minutesTitle") }} id={durationId} invalid={durationInvalid} locale={intlLocale(i18n.language)} onChange={(minutes) => setValues((current) => ({ ...current, durationMinutes: String(minutes) }))} value={Number(values.durationMinutes) || 0} />{durationInvalid ? <FieldError id={`${durationId}-error`}>{t("sections.services.fields.duration.required")}</FieldError> : null}</Field><Field data-invalid={priceInvalid || undefined}><FieldContent><FieldLabel htmlFor={priceId}>{t("sections.services.fields.price.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.price.hint")}</FieldDescription></FieldContent><div className="flex flex-col gap-2"><Select items={servicePriceTypes.map((type) => ({ value: type, label: t(`sections.services.fields.price.types.${type}`) }))} onValueChange={(value) => setValues((current) => ({ ...current, priceType: value as ServicePriceType }))} value={values.priceType}><SelectTrigger className="w-full" id={priceId}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{servicePriceTypes.map((type) => <SelectItem key={type} value={type}>{t(`sections.services.fields.price.types.${type}`)}</SelectItem>)}</SelectGroup></SelectContent></Select>{values.priceType === "range" ? <div className="flex items-center gap-2">{amountInput("price", t("sections.services.fields.price.lowest"))}<span aria-hidden="true" className="text-muted-foreground">–</span>{amountInput("priceMax", t("sections.services.fields.price.highest"))}</div> : values.priceType === "in_person" ? null : amountInput("price", t("sections.services.fields.price.amount"))}</div>{values.priceType === "in_person" ? null : <div className="flex min-h-9 items-center gap-3"><Switch checked={values.discountEnabled} id={discountId} onCheckedChange={(discountEnabled) => { setValues((current) => ({ ...current, discountEnabled })); if (discountEnabled) requestAnimationFrame(() => discountInputRef.current?.select()); }} /><FieldLabel className="font-normal" htmlFor={discountId}>{t("sections.services.fields.price.discount")}</FieldLabel>{values.discountEnabled ? <InputGroup className="ml-auto w-28"><InputGroupInput aria-invalid={priceInvalid && "error" in price && price.error === "discountInvalid" || undefined} aria-label={t("sections.services.fields.price.discountPercent")} className="tabular-nums" inputMode="decimal" maxLength={6} onChange={(event) => setValues((current) => ({ ...current, discount: event.target.value.replace(/,/gu, ".").replace(/[^\d.]/gu, "").replace(/(?<=\..*)\./gu, "") }))} placeholder="10" ref={discountInputRef} type="text" value={values.discount} /><InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon></InputGroup> : null}</div>}{discountPreview ? <FieldDescription aria-live="polite" className="tabular-nums">{discountPreview}</FieldDescription> : null}{values.priceType === "in_person" ? <FieldDescription>{t("sections.services.fields.price.inPersonHint")}</FieldDescription> : null}{priceInvalid && "error" in price ? <FieldError id={`${priceId}-error`}>{t(`sections.services.fields.price.errors.${price.error}`)}</FieldError> : null}</Field><Field><FieldContent><FieldLabel htmlFor={descriptionId}>{t("sections.services.fields.content.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.content.hint")}</FieldDescription></FieldContent><Textarea className="min-h-40" id={descriptionId} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} placeholder={t("sections.services.fields.content.placeholder")} value={values.description} /></Field><Field orientation="horizontal"><FieldContent><FieldLabel htmlFor={activeId}>{t("sections.services.fields.active.label")}</FieldLabel><FieldDescription>{t("sections.services.fields.active.hint")}</FieldDescription></FieldContent><Switch checked={values.active} id={activeId} onCheckedChange={(active) => setValues((current) => ({ ...current, active }))} /></Field></FieldGroup></div><DialogFooter><Button disabled={pending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("actions.cancel")}</Button><Button disabled={pending} type="submit">{pending ? t("actions.saving") : t(editing ? "actions.save" : "actions.add")}</Button></DialogFooter></form></DialogContent></Dialog>;
}
