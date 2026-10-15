"use client";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  useTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { CalendarDays, ChevronDown, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { enUS, es, fr, srLatn } from "react-day-picker/locale";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTablePagination, paginationFeatures } from "@/components/data-table/pagination";
import { DATA_TABLE_ROW_ACTIONS_CELL_CLASS, DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS, DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS, DataTableRowActions } from "@/components/data-table/row-controls";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, intlLocale } from "@/lib/locale";
import { formatPhoneNumberDisplay, getDefaultPhoneCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

type Vacation = { startsOn: string; endsOn: string };

type Employee = {
  id: string;
  name: string;
  phone: string | null;
  serviceIds: string[];
  vacation: Vacation | null;
  status: "working" | "on_vacation" | "no_services";
  createdAt: string;
  updatedAt: string;
};

type ServiceOption = { id: string; name: string };

const PICKER_TRIGGER_CLASS = "flex h-9 w-full items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-invalid:border-destructive data-invalid:ring-[3px] data-invalid:ring-destructive/20 enabled:hover:bg-input/50";
const DAY_PICKER_LOCALES = { en: enUS, fr, es, sr: srLatn } as const;

// Vacation days are calendar dates, YYYY-MM-DD, read and written in local time so they don't shift a day.
function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date!);
}

function toDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "short", day: "numeric" }).format(parseDay(day));
}

function formatVacation(vacation: Vacation, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).formatRange(parseDay(vacation.startsOn), parseDay(vacation.endsOn));
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
}

export function LiveEmployeesSurface() {
  const { i18n, t } = useTranslation("employees");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const { businesses, business } = useActiveBusiness();
  const employees = useQuery({
    queryKey: ["employees", business?.businessId, search.trim(), pagination.pageIndex, pagination.pageSize],
    queryFn: () => requestJson<{ employees: Employee[]; services: ServiceOption[]; today: string; pagination: { total: number } }>(`/api/employees?businessId=${encodeURIComponent(business!.businessId)}&limit=${pagination.pageSize}&offset=${pagination.pageIndex * pagination.pageSize}&search=${encodeURIComponent(search.trim())}`),
    enabled: Boolean(business),
  });
  const remove = useMutation({
    onError: error => toast.error(error instanceof Error ? error.message : t("table.actions.deleteFailed")),
    mutationFn: (employee: Employee) => requestJson(`/api/employees/${encodeURIComponent(employee.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["employees", business?.businessId] }),
  });

  const rows = employees.data?.employees ?? [];
  const services = useMemo(() => employees.data?.services ?? [], [employees.data?.services]);
  const today = employees.data?.today ?? toDay(new Date());
  const total = employees.data?.pagination.total ?? 0;
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;

  useEffect(() => {
    if (!employees.data) return;
    setPagination((current) => {
      const finalPage = Math.max(0, Math.ceil(total / current.pageSize) - 1);
      return current.pageIndex > finalPage ? { ...current, pageIndex: finalPage } : current;
    });
  }, [total, employees.data]);

  const openEditor = (employee: Employee | null) => { setEditingEmployee(employee); setDialogOpen(true); };

  const columns = useMemo<Array<ColumnDef<typeof paginationFeatures, Employee>>>(() => [
    {
      id: "name",
      accessorKey: "name",
      header: () => t("table.name"),
      cell: ({ row }) => <div className="flex min-w-0 items-center gap-2"><UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="ph-mask block truncate font-semibold" title={row.original.name}>{row.original.name}</span></div>,
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: () => t("table.phone"),
      cell: ({ row }) => <span className="ph-no-capture block truncate text-sm text-muted-foreground">{row.original.phone ? formatPhoneNumberDisplay(row.original.phone, locale) : "—"}</span>,
    },
    {
      id: "services",
      accessorKey: "serviceIds",
      header: () => t("table.services"),
      cell: ({ row }) => {
        const label = serviceSummary(row.original.serviceIds, services, t("table.allServices"));
        return <span className="block truncate text-sm text-muted-foreground" title={label}>{label || "—"}</span>;
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: () => t("table.status"),
      cell: ({ row }) => {
        const { status, vacation } = row.original;
        const detail = status === "on_vacation" && vacation
          ? t("table.statusDetail.until", { date: formatDay(vacation.endsOn, locale) })
          : status === "no_services" ? t("table.statusDetail.noServices")
            : vacation ? t("table.statusDetail.vacationFrom", { date: formatDay(vacation.startsOn, locale) }) : "";
        const tooltip = vacation ? t("table.statusTooltip.vacation", { dates: formatVacation(vacation, locale) }) : status === "no_services" ? t("table.statusTooltip.noServices") : "";
        const content = <>
          <Badge className="shrink-0" variant={status === "working" ? "secondary" : status === "on_vacation" ? "outline" : "destructive"}>{t(`table.statuses.${status}`)}</Badge>
          {detail ? <span className="truncate text-sm text-muted-foreground">{detail}</span> : null}
        </>;
        return tooltip
          ? <Tooltip><TooltipTrigger render={<div className="flex w-fit max-w-full min-w-0 items-center gap-2" />}>{content}</TooltipTrigger><TooltipContent>{tooltip}</TooltipContent></Tooltip>
          : <div className="flex min-w-0 items-center gap-2">{content}</div>;
      },
    },
    {
      id: "added",
      accessorKey: "createdAt",
      header: () => <span className={`relative block text-right ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>{t("table.added")}</span>,
      cell: ({ row }) => <span className={`relative block truncate text-right text-sm text-muted-foreground ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>{formatDateTime(row.original.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}</span>,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <DataTableRowActions><DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={t("table.actions.moreOptions")} size="icon-sm" title={t("table.actions.moreOptions")} type="button" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-0 w-fit p-1" side="bottom" sideOffset={8}>
            <DropdownMenuItem disabled={!canMutate} onClick={() => openEditor(row.original)}><Pencil />{t("table.actions.editEmployee")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canMutate} onClick={() => setPendingDelete(row.original)} variant="destructive"><Trash2 />{t("table.actions.deleteEmployee")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu></DataTableRowActions>
      ),
    },
  ], [canMutate, locale, services, t]);

  const table = useTable({ features: paginationFeatures, columns, data: rows, manualPagination: true, rowCount: total, onPaginationChange: setPagination, state: { pagination } });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, pageIndex: 0 })); }} placeholder={t("page.searchPlaceholder")} value={search} />
        </div>
        {canMutate ? <div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={() => openEditor(null)}><Plus data-icon="inline-start" />{t("add.button")}</Button></div> : null}
      </div>
      {businesses.isLoading || employees.isLoading ? <TableCardSkeleton columns={6} /> : (
        <>
          <TableCard>
            <Table className="min-w-[60rem] w-full table-fixed">
              <colgroup><col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[21%]" /><col className="w-[25%]" /><col className="w-[19%]" /><col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} /></colgroup>
              <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead className={header.column.id === "added" || header.column.id === "actions" ? "text-right" : undefined} key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => <TableRow className={canMutate ? "h-12 cursor-pointer transition-colors hover:bg-muted/40" : "h-12 transition-colors hover:bg-muted/40"} key={row.id} onClick={() => { if (canMutate) openEditor(row.original); }}>{row.getAllCells().map((cell) => <TableCell className={cell.column.id === "added" ? "w-0 max-w-0 text-right whitespace-nowrap" : cell.column.id === "actions" ? DATA_TABLE_ROW_ACTIONS_CELL_CLASS : "max-w-0"} key={cell.id} onClick={cell.column.id === "actions" ? (event) => event.stopPropagation() : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
                {table.getRowModel().rows.length === 0 ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>{search.trim() ? t("table.empty") : t("table.emptyState")}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </TableCard>
          <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} />
        </>
      )}
      {business ? <EmployeeDialog businessId={business.businessId} employee={editingEmployee} onOpenChange={setDialogOpen} open={dialogOpen} services={services} today={today} /> : null}
      <ConfirmActionDialog confirmVariant="destructive" cancelLabel={t("table.actions.deleteCancel")} confirmLabel={t("table.actions.deleteConfirm")} description={t("table.actions.deleteDescription")} onConfirm={async () => { if (!pendingDelete) return; await remove.mutateAsync(pendingDelete); setPendingDelete(null); toast.success(t("table.actions.deleted")); }} onOpenChange={(open) => { if (!open && !remove.isPending) setPendingDelete(null); }} open={Boolean(pendingDelete)} pending={remove.isPending} title={t("table.actions.deleteTitle")} />
    </div>
  );
}

function ServicesPicker({ id, invalid, label, onChange, services, value }: { id: string; invalid: boolean; label: string; onChange: (value: string[]) => void; services: ServiceOption[]; value: string[] }) {
  const { t } = useTranslation("employees");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const chosen = new Set(value);
  const visible = services.filter((service) => service.name.toLowerCase().includes(query.trim().toLowerCase()));
  const allVisibleChosen = visible.length > 0 && visible.every((service) => chosen.has(service.id));
  // Select all applies to the services the filter shows, so a search can narrow it.
  const toggleVisible = () => {
    const visibleIds = new Set(visible.map((service) => service.id));
    onChange(allVisibleChosen ? value.filter((serviceId) => !visibleIds.has(serviceId)) : services.filter((service) => chosen.has(service.id) || visibleIds.has(service.id)).map((service) => service.id));
  };
  const toggle = (serviceId: string, checked: boolean) => onChange(services.filter((service) => service.id === serviceId ? checked : chosen.has(service.id)).map((service) => service.id));

  return <Popover onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }} open={open}>
    <PopoverTrigger render={<button aria-describedby={invalid ? `${id}-error` : undefined} className={PICKER_TRIGGER_CLASS} data-invalid={invalid || undefined} id={id} type="button" />}>
      <span className={label ? "min-w-0 flex-1 truncate text-left" : "min-w-0 flex-1 truncate text-left text-muted-foreground"}>{label || t("add.fields.services.placeholder")}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-(--anchor-width) gap-0 p-0" initialFocus={searchRef}>
      <div className="relative border-b p-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={t("add.fields.services.search")} className="pl-9" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder={t("add.fields.services.search")} ref={searchRef} value={query} />
      </div>
      {visible.length ? <div className="flex max-h-64 flex-col overflow-y-auto p-1">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 font-medium hover:bg-muted/60">
          <Checkbox checked={allVisibleChosen} onCheckedChange={toggleVisible} />{t(allVisibleChosen ? "add.fields.services.unselectAll" : "add.fields.services.selectAll")}
        </label>
        <div className="mx-3 my-1 border-t" />
        {visible.map((service) => <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/60" key={service.id}>
          <Checkbox checked={chosen.has(service.id)} onCheckedChange={(checked) => toggle(service.id, checked)} /><span className="min-w-0 truncate">{service.name}</span>
        </label>)}
      </div> : <p className="px-3 py-6 text-center text-muted-foreground">{t("add.fields.services.noMatches")}</p>}
    </PopoverContent>
  </Popover>;
}

function VacationPicker({ invalid, label, locale, onChange, today, value }: { invalid: boolean; label: string; locale: string; onChange: (value: Vacation | null) => void; today: string; value: Vacation | null }) {
  const { t } = useTranslation("employees");
  const selected: DateRange | undefined = value ? { from: parseDay(value.startsOn), to: parseDay(value.endsOn) } : undefined;
  // Turning vacation on with no dates yet goes straight to the calendar.
  return <Popover defaultOpen={!value}>
    <PopoverTrigger render={<button aria-label={label} className={PICKER_TRIGGER_CLASS} data-invalid={invalid || undefined} type="button" />}>
      <span className={value ? "min-w-0 flex-1 truncate text-left" : "min-w-0 flex-1 truncate text-left text-muted-foreground"}>{value ? formatVacation(value, locale) : t("add.fields.vacation.placeholder")}</span>
      <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0">
      <Calendar defaultMonth={selected?.from ?? parseDay(today)} disabled={{ before: parseDay(today) }} locale={DAY_PICKER_LOCALES[locale as keyof typeof DAY_PICKER_LOCALES] ?? enUS} mode="range" onSelect={(range: DateRange | undefined) => onChange(range?.from ? { startsOn: toDay(range.from), endsOn: toDay(range.to ?? range.from) } : null)} selected={selected} />
    </PopoverContent>
  </Popover>;
}

function serviceSummary(serviceIds: string[], services: ServiceOption[], allLabel: string): string {
  const chosen = new Set(serviceIds);
  if (services.length > 1 && services.every((service) => chosen.has(service.id))) return allLabel;
  return services.filter((service) => chosen.has(service.id)).map((service) => service.name).join(", ");
}

function EmployeeDialog({ businessId, employee, open, onOpenChange, services, today }: { businessId: string; employee: Employee | null; open: boolean; onOpenChange: (open: boolean) => void; services: ServiceOption[]; today: string }) {
  const { i18n, t } = useTranslation("employees");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const queryClient = useQueryClient();
  const defaultCountry = getDefaultPhoneCountry(locale) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const nameId = useId();
  const phoneId = useId();
  const servicesId = useId();
  const vacationId = useId();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState("");
  // What was typed, so a blank phone (allowed) can be told apart from an incomplete one.
  const [phoneDraft, setPhoneDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [serviceInvalid, setServiceInvalid] = useState(false);
  const [vacation, setVacation] = useState<Vacation | null>(null);
  // Off keeps the picked dates, so turning it back on in the same dialog restores them.
  const [vacationOn, setVacationOn] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? ""); setPhone(employee?.phone ?? ""); setPhoneDraft(employee?.phone ?? ""); setCountry(employee ? (inferPhoneCountry(employee.phone, defaultCountry) ?? defaultCountry) as Country : defaultCountry); setSubmitted(false); setPhoneExists(false); setServiceInvalid(false);
    // A new employee starts with every service; anyone can be narrowed down from there.
    setServiceIds(employee ? employee.serviceIds : services.map((service) => service.id));
    setVacation(employee?.vacation ?? null);
    setVacationOn(Boolean(employee?.vacation));
  }, [defaultCountry, employee, open, services]);

  const save = useMutation({
    mutationFn: () => {
      const query = `businessId=${encodeURIComponent(businessId)}`;
      const body = JSON.stringify({ name: name.trim(), phone: phone || null, serviceIds, vacation: vacationOn ? vacation : null });
      return employee
        ? requestJson(`/api/employees/${encodeURIComponent(employee.id)}?${query}`, { method: "PATCH", body })
        : requestJson(`/api/employees?${query}`, { method: "POST", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employees", businessId] });
      toast.success(t(employee ? "edit.updated" : "add.created"));
      onOpenChange(false);
    },
    onError: (error) => {
      const code = errorCode(error);
      if (code === "employee_phone_exists") setPhoneExists(true);
      else if (code === "employee_service_invalid") { setServiceInvalid(true); void queryClient.invalidateQueries({ queryKey: ["employees", businessId] }); }
      else toast.error(t(employee ? "edit.failed" : "add.failed"));
    },
  });

  const nameMissing = submitted && !name.trim();
  const phoneIncomplete = /\d/.test(phoneDraft) && !phone;
  const phoneError = submitted && phoneIncomplete ? t("add.fields.phone.invalid") : phoneExists ? t("add.fields.phone.exists") : null;
  const knownServiceIds = serviceIds.filter((id) => services.some((service) => service.id === id));
  const servicesError = submitted && !knownServiceIds.length && services.length ? t("add.fields.services.required") : serviceInvalid ? t("add.fields.services.invalid") : null;
  const servicesLabel = serviceSummary(knownServiceIds, services, t("table.allServices"));
  const vacationMissing = submitted && vacationOn && !vacation;
  const selected = countries.find((option) => option.code === country) ?? countries[0];

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t(employee ? "edit.title" : "add.title")}</DialogTitle><DialogDescription>{t(employee ? "edit.description" : "add.description")}</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!save.isPending && name.trim() && !phoneIncomplete && knownServiceIds.length && (!vacationOn || vacation)) save.mutate(); }}>
        <FieldGroup>
          <Field data-invalid={nameMissing || undefined}>
            <FieldLabel htmlFor={nameId}>{t("add.fields.name.label")}</FieldLabel>
            <Input aria-describedby={nameMissing ? `${nameId}-error` : undefined} aria-invalid={nameMissing || undefined} id={nameId} maxLength={200} onChange={(event) => setName(event.target.value)} placeholder={t("add.fields.name.placeholder")} value={name} />
            {nameMissing ? <FieldError id={`${nameId}-error`}>{t("add.fields.name.required")}</FieldError> : null}
          </Field>
          <Field data-invalid={phoneError ? true : undefined}>
            <FieldContent><FieldLabel htmlFor={phoneId}>{t("add.fields.phone.label")}</FieldLabel><FieldDescription>{t("add.fields.phone.hint")}</FieldDescription></FieldContent>
            <div className="flex min-w-0">
              <Select onValueChange={(value) => { if (value && value !== country) { setCountry(value as Country); setPhone(""); setPhoneDraft(""); setPhoneExists(false); } }} value={country}>
                <SelectTrigger aria-label={t("add.fields.phone.country")} className="w-20 shrink-0 rounded-r-none px-4 font-medium text-muted-foreground" data-phone-country-prefix><span>{selected?.callingCode ?? ""}</span></SelectTrigger>
                <SelectContent className="min-w-72"><SelectGroup>{countries.map((option) => <SelectItem key={option.code} value={option.code}><span>{option.label}</span><span className="text-muted-foreground">{option.callingCode}</span></SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <PhoneInput aria-describedby={phoneError ? `${phoneId}-error` : undefined} aria-invalid={phoneError ? true : undefined} className="rounded-l-none border-l-0" containerClassName="min-w-0 flex-1" country={country} id={phoneId} limitNationalDigits locale={locale} onChange={(value) => { setPhone(value ?? ""); setPhoneExists(false); }} onRawValueChange={(raw) => { setPhoneDraft(raw); if (raw.trim().startsWith("+")) { const inferred = inferPhoneCountry(raw, country); if (inferred && inferred !== country) setCountry(inferred as Country); } }} value={phone} />
            </div>
            {phoneError ? <FieldError id={`${phoneId}-error`}>{phoneError}</FieldError> : null}
          </Field>
          <Field data-invalid={servicesError ? true : undefined}>
            <FieldContent><FieldLabel htmlFor={servicesId}>{t("add.fields.services.label")}</FieldLabel><FieldDescription>{t(services.length ? "add.fields.services.hint" : "add.fields.services.empty")}</FieldDescription></FieldContent>
            {services.length ? (
              <ServicesPicker id={servicesId} invalid={Boolean(servicesError)} label={servicesLabel} onChange={(value) => { setServiceIds(value); setServiceInvalid(false); }} services={services} value={knownServiceIds} />
            ) : (
              <Button className="w-fit" nativeButton={false} render={<Link href="/agent/services" />} variant="outline">{t("add.fields.services.goToServices")}</Button>
            )}
            {servicesError ? <FieldError id={`${servicesId}-error`}>{servicesError}</FieldError> : null}
          </Field>
          <div className="flex flex-col gap-3">
            <Field orientation="horizontal">
              <FieldContent><FieldLabel htmlFor={vacationId}>{t("add.fields.vacation.label")}</FieldLabel><FieldDescription>{t("add.fields.vacation.hint")}</FieldDescription></FieldContent>
              <Switch checked={vacationOn} id={vacationId} onCheckedChange={setVacationOn} />
            </Field>
            {vacationOn ? <Field data-invalid={vacationMissing || undefined}>
              <VacationPicker invalid={vacationMissing} label={t("add.fields.vacation.dates")} locale={locale} onChange={setVacation} today={today} value={vacation} />
              {vacationMissing ? <FieldError>{t("add.fields.vacation.required")}</FieldError> : null}
            </Field> : null}
          </div>
        </FieldGroup>
        <DialogFooter><Button disabled={save.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">{t("add.cancel")}</Button><Button disabled={save.isPending || !services.length} type="submit">{save.isPending ? t("add.saving") : t(employee ? "edit.save" : "add.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
