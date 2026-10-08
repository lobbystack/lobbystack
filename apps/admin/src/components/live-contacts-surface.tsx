"use client";

import { requestJson } from "@/lib/request-json";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  useTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { Ellipsis, Search, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { DataTablePagination, paginationFeatures } from "@/components/data-table/pagination";
import { PageHeader } from "@/components/page-header";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCard, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContactChannelIcons } from "@/components/contact-channel-icons";
import { getChannelLabel, getContactChannels, getContactDisplayName, getContactSecondaryDetails } from "@/lib/contact-display";
import { formatDateTime } from "@/lib/locale";
import { useTelemetry } from "@/components/product-analytics";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channels?: string[];
  operatorBlockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastInteractionAt?: string;
  callCount: number;
  messageCount: number;
  appointmentCount: number;
};
type PendingBlock = { contact: Contact; nextBlocked: boolean };

export function LiveContactsSurface() {
  const { i18n, t } = useTranslation("contacts");
  const router = useRouter();
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [pendingBlock, setPendingBlock] = useState<PendingBlock | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const { businesses, business } = useActiveBusiness();
  const contacts = useQuery({
    queryKey: ["contacts", business?.businessId, search.trim(), pagination.pageIndex, pagination.pageSize],
    queryFn: () => requestJson<{ contacts: Contact[]; pagination: { total: number } }>(`/api/contacts?businessId=${encodeURIComponent(business!.businessId)}&limit=${pagination.pageSize}&offset=${pagination.pageIndex * pagination.pageSize}&search=${encodeURIComponent(search.trim())}`),
    enabled: Boolean(business),
  });
  const updateBlock = useMutation({
    mutationFn: ({ contact, nextBlocked }: PendingBlock) => requestJson(`/api/contacts/${encodeURIComponent(contact.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ smsBlocked: nextBlocked }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contacts", business?.businessId] }),
  });
  const remove = useMutation({
    onError: error => toast.error(error instanceof Error ? error.message : t("table.actions.deleteFailed")),
    mutationFn: (contact: Contact) => requestJson(`/api/contacts/${encodeURIComponent(contact.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["contacts", business?.businessId] }),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["contacts", business?.businessId], ["call.completed", "message.upserted", "conversation.updated"]);
  }, [business?.businessId, queryClient]);

  const rows = contacts.data?.contacts ?? [];
  const total = contacts.data?.pagination.total ?? 0;
  const canMutate = business ? ["business_owner", "business_admin"].includes(business.role) : false;

  useEffect(() => {
    if (!contacts.data) return;
    setPagination((current) => {
      const finalPage = Math.max(0, Math.ceil(total / current.pageSize) - 1);
      return current.pageIndex > finalPage ? { ...current, pageIndex: finalPage } : current;
    });
  }, [total, contacts.data]);

  const columns = useMemo<Array<ColumnDef<typeof paginationFeatures, Contact>>>(() => [
    {
      id: "contact",
      accessorFn: (contact) => getContactDisplayName(contact, i18n.language, t),
      header: () => t("table.contact"),
      cell: ({ row }) => {
        const details = getContactSecondaryDetails(row.original, i18n.language);
        return <div className="flex min-w-0 flex-col gap-1"><div className="flex min-w-0 items-center gap-2"><span className="ph-mask truncate font-semibold">{getContactDisplayName(row.original, i18n.language, t)}</span>{row.original.operatorBlockedAt ? <Badge variant="destructive">{t("table.status.blocked")}</Badge> : null}</div>{details.length ? <div className="ph-no-capture flex min-w-0 flex-col">{details.map((detail) => <span className="truncate text-sm text-muted-foreground" key={detail} title={detail}>{detail}</span>)}</div> : null}</div>;
      },
    },
    {
      id: "channels",
      accessorFn: (contact) => getContactChannels(contact.channels).map((channel) => getChannelLabel(channel, t)).join(" "),
      header: () => t("table.channels"),
      cell: ({ row }) => <ContactChannelIcons channels={row.original.channels} />,
    },
    {
      id: "activity",
      accessorFn: (contact) => `${contact.messageCount} ${contact.callCount}`,
      header: () => t("table.activity"),
      cell: ({ row }) => <div className="flex min-w-0 flex-wrap gap-2 text-sm"><Badge variant="secondary">{t("table.messages", { count: row.original.messageCount })}</Badge><Badge variant="secondary">{t("table.calls", { count: row.original.callCount })}</Badge></div>,
    },
    {
      id: "appointments",
      accessorKey: "appointmentCount",
      header: () => <span className="block text-center">{t("table.appointments")}</span>,
      cell: ({ row }) => <span className="block text-center">{row.original.appointmentCount}</span>,
    },
    {
      id: "lastInteraction",
      accessorKey: "lastInteractionAt",
      header: () => <span className="relative block translate-x-12 text-right">{t("table.lastInteraction")}</span>,
      cell: ({ row }) => <span className="relative block translate-x-12 truncate text-right text-sm text-muted-foreground">{formatDateTime(row.original.lastInteractionAt ?? row.original.updatedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</span>,
    },
    {
      id: "actions",
      header: () => null,
      cell: ({ row }) => (
        <div className="flex w-16 justify-end pr-0" data-slot="data-table-row-actions"><DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={t("table.actions.moreOptions")} size="icon-sm" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canMutate} onClick={() => setPendingBlock({ contact: row.original, nextBlocked: !row.original.operatorBlockedAt })}>{row.original.operatorBlockedAt ? <ShieldCheck /> : <ShieldBan />}{row.original.operatorBlockedAt ? t("table.actions.unblockContact") : t("table.actions.blockContact")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMutate} onClick={() => setPendingDelete(row.original)} variant="destructive"><Trash2 />{t("table.actions.deleteContact")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu></div>
      ),
    },
  ], [canMutate, i18n.language, t]);

  const table = useTable({ features: paginationFeatures, columns, data: rows, manualPagination: true, rowCount: total, onPaginationChange: setPagination, state: { pagination } });

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
              <colgroup><col className="w-[30%]" /><col className="w-[14%]" /><col className="w-[20%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[8%]" /></colgroup>
              <TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead className={header.column.id === "lastInteraction" || header.column.id === "actions" ? "text-right" : header.column.id === "contact" ? "min-w-[12rem]" : header.column.id === "channels" ? "min-w-[8rem]" : header.column.id === "activity" ? "min-w-[10rem]" : header.column.id === "appointments" ? "min-w-[7rem] text-center" : undefined} key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => <TableRow className="h-12 cursor-pointer transition-colors hover:bg-muted/40" key={row.id} onClick={() => { if (business) telemetry.track("web.contacts.contact_opened", { businessId: business.businessId, contactId: row.original.id }); router.push(`/contacts/${row.original.id}`); }}>{row.getAllCells().map((cell) => <TableCell className={cell.column.id === "lastInteraction" ? "min-w-[11rem] max-w-0 whitespace-nowrap text-right" : cell.column.id === "actions" ? "w-16 text-right" : cell.column.id === "contact" ? "min-w-[12rem]" : cell.column.id === "channels" ? "min-w-[8rem]" : cell.column.id === "activity" ? "min-w-[10rem]" : cell.column.id === "appointments" ? "min-w-[7rem] text-center" : undefined} key={cell.id} onClick={cell.column.id === "actions" ? (event) => event.stopPropagation() : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
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
      <ConfirmActionDialog confirmVariant="destructive" cancelLabel={t("table.actions.deleteCancel")} confirmLabel={t("table.actions.deleteConfirm")} description={t("table.actions.deleteDescription")} onConfirm={async () => { if (pendingDelete) await remove.mutateAsync(pendingDelete); }} onOpenChange={(open) => { if (!open && !remove.isPending) setPendingDelete(null); }} open={Boolean(pendingDelete)} pending={remove.isPending} title={t("table.actions.deleteTitle")} />
    </div>
  );
}
