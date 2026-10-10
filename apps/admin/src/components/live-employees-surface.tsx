"use client";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";

import { useEffect, useId, useMemo, useState } from "react";
import {
  flexRender,
  useTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import type { Country } from "react-phone-number-input/input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTablePagination, paginationFeatures } from "@/components/data-table/pagination";
import { DATA_TABLE_ROW_ACTIONS_CELL_CLASS, DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS, DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS, DataTableRowActions } from "@/components/data-table/row-controls";
import { PageHeader } from "@/components/page-header";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { formatPhoneNumberDisplay, getDefaultPhoneCountry, getPhoneCountryOptions, inferPhoneCountry } from "@/lib/phone";

type Employee = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    queryFn: () => requestJson<{ employees: Employee[]; pagination: { total: number } }>(`/api/employees?businessId=${encodeURIComponent(business!.businessId)}&limit=${pagination.pageSize}&offset=${pagination.pageIndex * pagination.pageSize}&search=${encodeURIComponent(search.trim())}`),
    enabled: Boolean(business),
  });
  const remove = useMutation({
    onError: error => toast.error(error instanceof Error ? error.message : t("table.actions.deleteFailed")),
    mutationFn: (employee: Employee) => requestJson(`/api/employees/${encodeURIComponent(employee.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["employees", business?.businessId] }),
  });

  const rows = employees.data?.employees ?? [];
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
  ], [canMutate, locale, t]);

  const table = useTable({ features: paginationFeatures, columns, data: rows, manualPagination: true, rowCount: total, onPaginationChange: setPagination, state: { pagination } });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("page.title")} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, pageIndex: 0 })); }} placeholder={t("page.searchPlaceholder")} value={search} />
        </div>
        {canMutate ? <div className="flex shrink-0 flex-wrap items-center gap-2"><Button onClick={() => openEditor(null)}><Plus data-icon="inline-start" />{t("add.button")}</Button></div> : null}
      </div>
      {businesses.isLoading || employees.isLoading ? <TableCardSkeleton columns={4} /> : (
        <>
          <TableCard>
            <Table className="min-w-[60rem] w-full table-fixed">
              <colgroup><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[56%]" /><col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} /></colgroup>
              <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead className={header.column.id === "added" || header.column.id === "actions" ? "text-right" : undefined} key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => <TableRow className={canMutate ? "h-12 cursor-pointer transition-colors hover:bg-muted/40" : "h-12 transition-colors hover:bg-muted/40"} key={row.id} onClick={() => { if (canMutate) openEditor(row.original); }}>{row.getAllCells().map((cell) => <TableCell className={cell.column.id === "added" ? "w-0 max-w-0 text-right whitespace-nowrap" : cell.column.id === "actions" ? DATA_TABLE_ROW_ACTIONS_CELL_CLASS : "max-w-0"} key={cell.id} onClick={cell.column.id === "actions" ? (event) => event.stopPropagation() : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
                {table.getRowModel().rows.length === 0 ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>{search.trim() ? t("table.empty") : t("table.emptyState")}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </TableCard>
          <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} />
        </>
      )}
      {business ? <EmployeeDialog businessId={business.businessId} employee={editingEmployee} onOpenChange={setDialogOpen} open={dialogOpen} /> : null}
      <ConfirmActionDialog confirmVariant="destructive" cancelLabel={t("table.actions.deleteCancel")} confirmLabel={t("table.actions.deleteConfirm")} description={t("table.actions.deleteDescription")} onConfirm={async () => { if (!pendingDelete) return; await remove.mutateAsync(pendingDelete); setPendingDelete(null); toast.success(t("table.actions.deleted")); }} onOpenChange={(open) => { if (!open && !remove.isPending) setPendingDelete(null); }} open={Boolean(pendingDelete)} pending={remove.isPending} title={t("table.actions.deleteTitle")} />
    </div>
  );
}

function EmployeeDialog({ businessId, employee, open, onOpenChange }: { businessId: string; employee: Employee | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { i18n, t } = useTranslation("employees");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const queryClient = useQueryClient();
  const defaultCountry = getDefaultPhoneCountry(locale) as Country;
  const countries = useMemo(() => getPhoneCountryOptions(locale), [locale]);
  const nameId = useId();
  const phoneId = useId();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [phone, setPhone] = useState("");
  // What was typed, so a blank phone (allowed) can be told apart from an incomplete one.
  const [phoneDraft, setPhoneDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(employee?.name ?? ""); setPhone(employee?.phone ?? ""); setPhoneDraft(employee?.phone ?? ""); setCountry(employee ? (inferPhoneCountry(employee.phone, defaultCountry) ?? defaultCountry) as Country : defaultCountry); setSubmitted(false); setPhoneExists(false);
  }, [defaultCountry, employee, open]);

  const save = useMutation({
    mutationFn: () => {
      const query = `businessId=${encodeURIComponent(businessId)}`;
      const body = JSON.stringify({ name: name.trim(), phone: phone || null });
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
      if (errorCode(error) === "employee_phone_exists") setPhoneExists(true);
      else toast.error(t(employee ? "edit.failed" : "add.failed"));
    },
  });

  const nameMissing = submitted && !name.trim();
  const phoneIncomplete = /\d/.test(phoneDraft) && !phone;
  const phoneError = submitted && phoneIncomplete ? t("add.fields.phone.invalid") : phoneExists ? t("add.fields.phone.exists") : null;
  const selected = countries.find((option) => option.code === country) ?? countries[0];

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{t(employee ? "edit.title" : "add.title")}</DialogTitle><DialogDescription>{t(employee ? "edit.description" : "add.description")}</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!save.isPending && name.trim() && !phoneIncomplete) save.mutate(); }}>
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
        </FieldGroup>
        <DialogFooter><Button className="w-full" disabled={save.isPending} type="submit">{save.isPending ? t("add.saving") : t(employee ? "edit.save" : "add.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
