import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { DataTablePagination } from "@/components/data-table/pagination";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatDateTime } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type ContactsPageProps = {
  businessId?: Id<"businesses">;
};

type ContactRow = {
  id: Id<"contacts">;
  name: string | null;
  phone: string;
  email: string | null;
  messageCount: number;
  callCount: number;
  appointmentCount: number;
  lastInteractionAt: number;
};

export function ContactsPage({ businessId }: ContactsPageProps) {
  const { i18n, t } = useTranslation("contacts");
  const contacts = useQuery(
    api.dashboard.contacts.listContacts,
    businessId ? { businessId } : "skip",
  ) as Array<ContactRow> | undefined;
  const [searchValue, setSearchValue] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<Id<"contacts"> | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const isLoadingContacts = contacts === undefined;

  const rows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return (contacts ?? []).filter((contact: ContactRow) => {
      const haystack = [contact.name, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [contacts, searchValue]);

  const columns = useMemo<Array<ColumnDef<ContactRow>>>(
    () => [
      {
        accessorFn: (contact) => contact.name ?? t("table.unknownContact"),
        id: "contact",
        header: () => t("table.contact"),
        cell: ({ row }) => (
          <span className="font-semibold">{row.original.name ?? t("table.unknownContact")}</span>
        ),
      },
      {
        accessorFn: (contact) => [contact.phone, contact.email].filter(Boolean).join(" "),
        id: "channels",
        header: () => t("table.channels"),
        cell: ({ row }) => (
            <div className="flex flex-wrap items-center gap-2">
            <span>{formatPhoneNumberDisplay(row.original.phone, i18n.language)}</span>
            {row.original.email ? <Badge variant="outline">{row.original.email}</Badge> : null}
          </div>
        ),
      },
      {
        accessorFn: (contact) => `${contact.messageCount} ${contact.callCount}`,
        id: "activity",
        header: () => t("table.activity"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{t("table.messages", { count: row.original.messageCount })}</Badge>
            <Badge variant="secondary">{t("table.calls", { count: row.original.callCount })}</Badge>
          </div>
        ),
      },
      {
        accessorKey: "appointmentCount",
        id: "appointments",
        header: () => t("table.appointments"),
      },
      {
        accessorFn: (contact) =>
          formatDateTime(contact.lastInteractionAt, i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        id: "lastInteraction",
        header: () => t("table.lastInteraction"),
        cell: ({ row }) =>
          formatDateTime(row.original.lastInteractionAt, i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
      },
    ],
    [i18n.language, t],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  useEffect(() => {
    setPagination((current) => {
      const pageCount = Math.max(1, Math.ceil(rows.length / current.pageSize));
      if (current.pageIndex <= pageCount - 1) {
        return current;
      }

      return {
        ...current,
        pageIndex: pageCount - 1,
      };
    });
  }, [rows.length]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader description={t("page.description")} title={t("page.title")} />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={t("page.searchPlaceholder")}
          value={searchValue}
        />
      </div>

      {isLoadingContacts ? (
        <TableCardSkeleton columns={5} />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="h-12 cursor-pointer data-[state=selected]:bg-muted/40"
                    data-state={selectedContactId === row.original.id ? "selected" : undefined}
                    key={row.id}
                    onClick={() => {
                      if (selectedContactId === row.original.id) {
                        return;
                      }
                      setSelectedContactId(row.original.id);
                      captureAnalyticsEvent("web.contacts.contact_opened", {
                        businessId: businessId ? String(businessId) : undefined,
                        contactId: String(row.original.id),
                        messageCount: row.original.messageCount,
                        callCount: row.original.callCount,
                        appointmentCount: row.original.appointmentCount,
                      });
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                      {t("table.empty")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <DataTablePagination
            labels={{
              rowsPerPage: t("pagination.rowsPerPage"),
              pageOf: (page, total) => t("pagination.pageOf", { page, total }),
              firstPage: t("pagination.firstPage"),
              previousPage: t("pagination.previousPage"),
              nextPage: t("pagination.nextPage"),
              lastPage: t("pagination.lastPage"),
              goToPage: (page) => t("pagination.goToPage", { page }),
            }}
            table={table}
          />
        </>
      )}
    </div>
  );
}
