"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Ellipsis, Search, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DataTablePagination } from "@/components/data-table/pagination";
import { PageHeader } from "@/components/page-header";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { selectActiveBusiness } from "@/lib/active-business";

type Business = { businessId: string; active: boolean; role: string };
type Contact = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  operatorBlockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  callCount: number;
  messageCount: number;
  appointmentCount: number;
};
type PendingBlock = { contact: Contact; nextBlocked: boolean };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error("Unable to load contacts.");
  return await response.json() as T;
}

export function LiveContactsSurface() {
  const { i18n, t } = useTranslation("contacts");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses"),
  });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const contacts = useQuery({
    queryKey: ["contacts", business?.businessId],
    queryFn: () => getJson<{ contacts: Contact[] }>("/api/contacts?limit=100"),
    enabled: Boolean(business),
  });
  const updateBlock = useMutation({
    mutationFn: ({ contact, nextBlocked }: PendingBlock) => getJson(`/api/contacts/${encodeURIComponent(contact.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ smsBlocked: nextBlocked }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contacts", business?.businessId] }),
  });
  const remove = useMutation({
    mutationFn: (contact: Contact) => getJson(`/api/contacts/${encodeURIComponent(contact.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contacts", business?.businessId] }),
  });

  useEffect(() => {
    if (!business) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["contacts", business.businessId] });
    for (const event of ["call.completed", "message.upserted", "conversation.updated"]) source.addEventListener(event, refresh);
    return () => source.close();
  }, [business, queryClient]);

  const allRows = contacts.data?.contacts ?? [];
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allRows;
    return allRows.filter((contact) => [contact.name, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [allRows, search]);
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;

  useEffect(() => {
    setPagination((current) => {
      const finalPage = Math.max(0, Math.ceil(rows.length / current.pageSize) - 1);
      return current.pageIndex > finalPage ? { ...current, pageIndex: finalPage } : current;
    });
  }, [rows.length]);

  const columns = useMemo<Array<ColumnDef<Contact>>>(() => [
    {
      id: "contact",
      accessorFn: (contact) => contact.name ?? t("table.unknownContact"),
      header: () => t("table.contact"),
      cell: ({ row }) => <div className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{row.original.name ?? t("table.unknownContact")}</span>{row.original.operatorBlockedAt ? <Badge variant="destructive">{t("table.status.blocked")}</Badge> : null}</div>,
    },
    {
      id: "channels",
      accessorFn: (contact) => [contact.phone, contact.email].filter(Boolean).join(" "),
      header: () => t("table.channels"),
      cell: ({ row }) => <div className="flex min-w-0 flex-col gap-2"><span className="truncate" title={row.original.phone}>{row.original.phone}</span>{row.original.email ? <Badge className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={row.original.email} variant="outline">{row.original.email}</Badge> : null}</div>,
    },
    {
      id: "activity",
      accessorFn: (contact) => `${contact.messageCount} ${contact.callCount}`,
      header: () => t("table.activity"),
      cell: ({ row }) => <div className="flex min-w-0 flex-wrap gap-2"><Badge variant="secondary">{t("table.messages", { count: row.original.messageCount })}</Badge><Badge variant="secondary">{t("table.calls", { count: row.original.callCount })}</Badge></div>,
    },
    {
      id: "appointments",
      accessorKey: "appointmentCount",
      header: () => <span className="block text-center">{t("table.appointments")}</span>,
      cell: ({ row }) => <span className="block text-center">{row.original.appointmentCount}</span>,
    },
    {
      id: "lastInteraction",
      accessorKey: "updatedAt",
      header: () => <span className="block text-right">{t("table.lastInteraction")}</span>,
      cell: ({ row }) => <span className="block truncate text-right text-sm text-muted-foreground">{formatDateTime(row.original.updatedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</span>,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={t("table.actions.moreOptions")} size="icon-sm" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canMutate} onClick={() => setPendingBlock({ contact: row.original, nextBlocked: !row.original.operatorBlockedAt })}>{row.original.operatorBlockedAt ? <ShieldCheck /> : <ShieldBan />}{row.original.operatorBlockedAt ? t("table.actions.unblockContact") : t("table.actions.blockContact")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMutate} onClick={() => setPendingDelete(row.original)} variant="destructive"><Trash2 />{t("table.actions.deleteContact")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [canMutate, i18n.language, t]);

  const table = useReactTable({ columns, data: rows, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), onPaginationChange: setPagination, state: { pagination } });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader title={t("page.title")} />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-10" onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, pageIndex: 0 })); }} placeholder={t("page.searchPlaceholder")} value={search} />
      </div>
      {businesses.isLoading || contacts.isLoading ? <TableCardSkeleton columns={6} /> : (
        <>
          <TableCard>
            <Table className="min-w-[52rem] w-full table-fixed">
              <colgroup><col className="w-[24%]" /><col className="w-[20%]" /><col className="w-[20%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-12" /></colgroup>
              <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead className={header.column.id === "actions" ? "w-12" : undefined} key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => <TableRow className="h-14 cursor-pointer" key={row.id} onClick={() => router.push(`/contacts/${row.original.id}`)}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} onClick={cell.column.id === "actions" ? (event) => event.stopPropagation() : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
                {table.getRowModel().rows.length === 0 ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>{t("table.empty")}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </TableCard>
          <DataTablePagination labels={{ rowsPerPage: t("pagination.rowsPerPage"), pageOf: (page, total) => t("pagination.pageOf", { page, total }), firstPage: t("pagination.firstPage"), previousPage: t("pagination.previousPage"), nextPage: t("pagination.nextPage"), lastPage: t("pagination.lastPage"), goToPage: (page) => t("pagination.goToPage", { page }) }} table={table} />
        </>
      )}
      <ConfirmActionDialog
        cancelLabel={t("table.actions.blockCancel")}
        confirmLabel={pendingBlock?.nextBlocked ? t("table.actions.blockConfirm") : t("table.actions.unblockConfirm")}
        confirmVariant={pendingBlock?.nextBlocked ? "destructive" : "default"}
        description={pendingBlock?.nextBlocked ? t("table.actions.blockDescription") : t("table.actions.unblockDescription")}
        onConfirm={async () => { if (pendingBlock) await updateBlock.mutateAsync(pendingBlock); }}
        onOpenChange={(open) => { if (!open && !updateBlock.isPending) setPendingBlock(null); }}
        open={Boolean(pendingBlock)}
        pending={updateBlock.isPending}
        title={pendingBlock?.nextBlocked ? t("table.actions.blockTitle") : t("table.actions.unblockTitle")}
      />
      <ConfirmDeleteDialog cancelLabel={t("table.actions.deleteCancel")} confirmLabel={t("table.actions.deleteConfirm")} description={t("table.actions.deleteDescription")} onConfirm={async () => { if (pendingDelete) await remove.mutateAsync(pendingDelete); }} onOpenChange={(open) => { if (!open && !remove.isPending) setPendingDelete(null); }} open={Boolean(pendingDelete)} pending={remove.isPending} title={t("table.actions.deleteTitle")} />
    </div>
  );
}
