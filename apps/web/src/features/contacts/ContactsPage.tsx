import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { useObservedMutation } from "@/lib/observed-convex";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DataTablePagination } from "@/components/data-table/pagination";
import {
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS,
  DataTableRowActions,
} from "@/components/data-table/row-controls";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { ContactActionsMenu } from "@/features/contacts/ContactActionsMenu";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatDateTime } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

type ContactsPageProps = {
  businessId?: Id<"businesses">;
};

type ContactRow = {
  id: Id<"contacts">;
  name: string | null;
  phone: string;
  email: string | null;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedByName: string | null;
  messageCount: number;
  callCount: number;
  appointmentCount: number;
  lastInteractionAt: number;
};

export function ContactsPage({ businessId }: ContactsPageProps) {
  const { i18n, t } = useTranslation("contacts");
  const { data: contacts, isInitialLoading: isLoadingContacts } = useRememberedConvexQuery(
    api.dashboard.contacts.listContacts,
    businessId ? { businessId } : "skip",
  );
  const blockContact = useObservedMutation(api.dashboard.contacts.blockContact);
  const deleteContact = useObservedMutation(api.dashboard.contacts.deleteContact);
  const unblockContact = useObservedMutation(api.dashboard.contacts.unblockContact);
  const [searchValue, setSearchValue] = useState("");
  const navigate = useNavigate();
  const [contactPendingDelete, setContactPendingDelete] = useState<ContactRow | null>(null);
  const [contactPendingBlockToggle, setContactPendingBlockToggle] = useState<{
    contact: ContactRow;
    nextBlockedState: boolean;
  } | null>(null);
  const [blockingContactId, setBlockingContactId] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const rows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return (contacts ?? []).filter((contact: ContactRow) => {
      const haystack = [contact.name, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [contacts, searchValue]);

  const openContact = useCallback((row: ContactRow) => {
    captureAnalyticsEvent("web.contacts.contact_opened", {
      businessId: businessId ? String(businessId) : undefined,
      contactId: String(row.id),
      messageCount: row.messageCount,
      callCount: row.callCount,
      appointmentCount: row.appointmentCount,
    });
    navigate(`/contacts/${row.id}`);
  }, [businessId, navigate]);

  const handleDeleteContact = useCallback(async () => {
    if (!businessId || !contactPendingDelete) {
      return;
    }

    const contactId = String(contactPendingDelete.id);
    setDeletingContactId(contactId);
    try {
      await deleteContact({
        businessId,
        contactId: contactPendingDelete.id,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("table.actions.deleteFailed"));
      throw error;
    } finally {
      setDeletingContactId((current) => (current === contactId ? null : current));
    }
  }, [businessId, contactPendingDelete, deleteContact, t]);

  const handleToggleBlock = useCallback(async () => {
    if (!businessId || !contactPendingBlockToggle) {
      return;
    }

    const contactId = String(contactPendingBlockToggle.contact.id);
    setBlockingContactId(contactId);
    try {
      if (contactPendingBlockToggle.nextBlockedState) {
        await blockContact({
          businessId,
          contactId: contactPendingBlockToggle.contact.id,
        });
        toast.success(t("table.actions.blockSuccess"));
      } else {
        await unblockContact({
          businessId,
          contactId: contactPendingBlockToggle.contact.id,
        });
        toast.success(t("table.actions.unblockSuccess"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("table.actions.updateFailed"));
      throw error;
    } finally {
      setBlockingContactId((current) => (current === contactId ? null : current));
    }
  }, [blockContact, businessId, contactPendingBlockToggle, t, unblockContact]);

  const columns = useMemo<Array<ColumnDef<ContactRow>>>(
    () => [
      {
        accessorFn: (contact) => contact.name ?? t("table.unknownContact"),
        id: "contact",
        header: () => t("table.contact"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="truncate font-semibold"
              title={row.original.name ?? t("table.unknownContact")}
            >
              {row.original.name ?? t("table.unknownContact")}
            </span>
            {row.original.isBlocked ? (
              <Badge className="shrink-0" variant="destructive">
                {t("table.status.blocked")}
              </Badge>
            ) : null}
          </div>
        ),
        meta: {
          className: "min-w-[12rem]",
        },
      },
      {
        accessorFn: (contact) => [contact.phone, contact.email].filter(Boolean).join(" "),
        id: "channels",
        header: () => t("table.channels"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-2">
            <span
              className="truncate"
              title={formatPhoneNumberDisplay(row.original.phone, i18n.language)}
            >
              {formatPhoneNumberDisplay(row.original.phone, i18n.language)}
            </span>
            {row.original.email ? (
              <Badge
                className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                title={row.original.email}
                variant="outline"
              >
                {row.original.email}
              </Badge>
            ) : null}
          </div>
        ),
        meta: {
          className: "min-w-[11rem]",
        },
      },
      {
        accessorFn: (contact) => `${contact.messageCount} ${contact.callCount}`,
        id: "activity",
        header: () => t("table.activity"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{t("table.messages", { count: row.original.messageCount })}</Badge>
            <Badge variant="secondary">{t("table.calls", { count: row.original.callCount })}</Badge>
          </div>
        ),
        meta: {
          className: "min-w-[10rem]",
        },
      },
      {
        accessorKey: "appointmentCount",
        id: "appointments",
        header: () => <span className="block text-center">{t("table.appointments")}</span>,
        cell: ({ row }) => <span className="block text-center">{row.original.appointmentCount}</span>,
        meta: {
          className: "min-w-[7rem] text-center",
        },
      },
      {
        accessorFn: (contact) =>
          formatDateTime(contact.lastInteractionAt, i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        id: "lastInteraction",
        header: () => (
          <span className={`relative block text-right ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>
            {t("table.lastInteraction")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className={`relative block truncate text-right text-sm text-muted-foreground ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}
            title={formatDateTime(row.original.lastInteractionAt, i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          >
            {formatDateTime(row.original.lastInteractionAt, i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ),
        meta: {
          className: "min-w-[11rem] text-right",
        },
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => (
          <DataTableRowActions>
            <ContactActionsMenu
              blocking={blockingContactId === String(row.original.id)}
              deleting={deletingContactId === String(row.original.id)}
              isBlocked={row.original.isBlocked}
              onDelete={() => {
                setContactPendingDelete(row.original);
              }}
              onToggleBlock={() => {
                setContactPendingBlockToggle({
                  contact: row.original,
                  nextBlockedState: !row.original.isBlocked,
                });
              }}
            />
          </DataTableRowActions>
        ),
        meta: {
          className: DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
        },
      },
    ],
    [deletingContactId, i18n.language, t],
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
        <TableCardSkeleton columns={6} />
      ) : (
        <>
          <TableCard>
            <Table className="min-w-[52rem] w-full table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} />
              </colgroup>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const className =
                        header.column.id === "lastInteraction" || header.column.id === "actions"
                          ? "text-right"
                          : header.column.columnDef.meta &&
                              typeof header.column.columnDef.meta === "object" &&
                              "className" in header.column.columnDef.meta
                            ? String(header.column.columnDef.meta.className)
                            : undefined;

                      return (
                        <TableHead className={className} key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="h-12 cursor-pointer transition-colors hover:bg-muted/40"
                    key={row.id}
                    onClick={() => {
                      openContact(row.original);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const className =
                        cell.column.id === "lastInteraction"
                          ? "min-w-[11rem] max-w-0 text-right whitespace-nowrap"
                          : cell.column.id === "actions"
                            ? DATA_TABLE_ROW_ACTIONS_CELL_CLASS
                            : cell.column.columnDef.meta &&
                                typeof cell.column.columnDef.meta === "object" &&
                                "className" in cell.column.columnDef.meta
                              ? String(cell.column.columnDef.meta.className)
                              : undefined;

                      return (
                        <TableCell className={className} key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                      {t("table.empty")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableCard>
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
          <ConfirmDeleteDialog
            cancelLabel={t("table.actions.deleteCancel")}
            confirmLabel={t("table.actions.deleteConfirm")}
            description={t("table.actions.deleteDescription")}
            onConfirm={handleDeleteContact}
            onOpenChange={(open) => {
              if (!open && !deletingContactId) {
                setContactPendingDelete(null);
              }
            }}
            open={contactPendingDelete !== null}
            pending={
              contactPendingDelete !== null &&
              deletingContactId === String(contactPendingDelete.id)
            }
            title={t("table.actions.deleteTitle")}
          />
          <ConfirmActionDialog
            cancelLabel={t("table.actions.blockCancel")}
            confirmLabel={
              contactPendingBlockToggle?.nextBlockedState
                ? t("table.actions.blockConfirm")
                : t("table.actions.unblockConfirm")
            }
            confirmVariant={
              contactPendingBlockToggle?.nextBlockedState ? "destructive" : "default"
            }
            description={
              contactPendingBlockToggle?.nextBlockedState
                ? t("table.actions.blockDescription")
                : t("table.actions.unblockDescription")
            }
            onConfirm={handleToggleBlock}
            onOpenChange={(open) => {
              if (!open && !blockingContactId) {
                setContactPendingBlockToggle(null);
              }
            }}
            open={contactPendingBlockToggle !== null}
            pending={
              contactPendingBlockToggle !== null &&
              blockingContactId === String(contactPendingBlockToggle.contact.id)
            }
            title={
              contactPendingBlockToggle?.nextBlockedState
                ? t("table.actions.blockTitle")
                : t("table.actions.unblockTitle")
            }
          />
        </>
      )}
    </div>
  );
}
