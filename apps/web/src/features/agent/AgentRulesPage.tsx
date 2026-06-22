import { Fragment, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { MoreHorizontal, Pause, Play, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { AgentLayoutOutletContext } from "./AgentLayout";
import { AgentRuleDialog } from "./AgentRuleDialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { DataTablePagination } from "@/components/data-table/pagination";
import {
  DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
  DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS,
  DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS,
  DataTableRowActions,
} from "@/components/data-table/row-controls";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { captureAnalyticsException } from "@/lib/analytics";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import { cn } from "@/lib/utils";

type AgentRulesPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
};

type AgentRuleRow = Doc<"agent_rules">;

function summarizeText(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function summarizeTableTitle(text: string): string {
  return summarizeText(text, 32);
}

function summarizeTablePreview(text: string): string {
  return summarizeText(text, 72);
}

export function AgentRulesPage({ businessId, canManageTenant }: AgentRulesPageProps) {
  const { i18n, t } = useTranslation("agent");
  const outletContext = useOutletContext<AgentLayoutOutletContext | null>();
  const headerActions = outletContext?.headerActions;
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const setRuleActive = useObservedMutation(api.ai.context.rules.setRuleActive, {
    reportFailures: false,
  });
  const deleteRule = useObservedMutation(api.ai.context.rules.deleteRule);
  const backfillLegacyRulesForBusiness = useObservedAction(
    api.ai.context.rules.backfillLegacyRulesForBusiness,
    { reportFailures: false },
  );
  const { data: rules, isInitialLoading: isLoadingRules } = useRememberedConvexQuery(
    api.ai.context.rules.listRules,
    { businessId },
  );
  const [searchValue, setSearchValue] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [editingRule, setEditingRule] = useState<AgentRuleRow | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AgentRuleRow | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [togglingRuleIds, setTogglingRuleIds] = useState<string[]>([]);
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!canManageTenant) {
      return;
    }

    void backfillLegacyRulesForBusiness({ businessId }).catch((error) => {
      captureAnalyticsException(error, {
        source: "agent-rules-legacy-backfill",
        businessId: String(businessId),
      });
    });
  }, [backfillLegacyRulesForBusiness, businessId, canManageTenant]);

  const rows = useMemo(
    () =>
      ((rules ?? []) as Array<AgentRuleRow>)
        .filter((rule) => !optimisticDeletedIds.includes(String(rule._id)))
        .slice()
        .sort((left, right) => left.order - right.order || left._creationTime - right._creationTime),
    [optimisticDeletedIds, rules],
  );
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) =>
      [row.title, row.content].join(" ").toLowerCase().includes(query),
    );
  }, [rows, searchValue]);

  useEffect(() => {
    setOptimisticDeletedIds((current) =>
      current.filter((id) => (rules ?? []).some((rule) => String(rule._id) === id)),
    );
  }, [rules]);

  useEffect(() => {
    if (editingRule && !filteredRows.some((rule) => rule._id === editingRule._id)) {
      setEditingRule(null);
    }
  }, [editingRule, filteredRows]);

  useEffect(() => {
    setPagination((current) => {
      const pageCount = Math.max(1, Math.ceil(filteredRows.length / current.pageSize));
      if (current.pageIndex <= pageCount - 1) {
        return current;
      }

      return { ...current, pageIndex: pageCount - 1 };
    });
  }, [filteredRows.length]);

  async function handleSetRuleActive(rule: AgentRuleRow, active: boolean): Promise<void> {
    if (!canManageTenant) {
      return;
    }

    const ruleId = String(rule._id);
    setTogglingRuleIds((current) => [...current, ruleId]);
    try {
      await setRuleActive({
        businessId,
        ruleId: rule._id,
        active,
      });
    } catch (error) {
      captureAnalyticsException(error, {
        source: "agent-rule-toggle-active",
        businessId: String(businessId),
        ruleId,
      });
    } finally {
      setTogglingRuleIds((current) => current.filter((candidateId) => candidateId !== ruleId));
    }
  }

  async function handleDelete(rule: AgentRuleRow): Promise<void> {
    if (!canManageTenant) {
      return;
    }

    const ruleId = String(rule._id);
    setDeletingRuleId(ruleId);
    setOptimisticDeletedIds((current) => (current.includes(ruleId) ? current : [...current, ruleId]));
    if (editingRule?._id === rule._id) {
      setEditingRule(null);
    }

    try {
      await deleteRule({
        businessId,
        ruleId: rule._id,
      });
    } catch (error) {
      setOptimisticDeletedIds((current) => current.filter((id) => id !== ruleId));
      throw error;
    } finally {
      setDeletingRuleId(null);
    }
  }

  const columns = useMemo<Array<ColumnDef<AgentRuleRow>>>(
    () => [
      {
        accessorFn: (row) => row.title,
        id: "title",
        header: () => t("table.title"),
        cell: ({ row }) => (
          <span
            className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium"
            title={row.original.title}
          >
            {summarizeTableTitle(row.original.title)}
          </span>
        ),
      },
      {
        accessorFn: (row) => summarizeTablePreview(row.content),
        id: "preview",
        header: () => t("table.preview"),
        cell: ({ row }) => (
          <span
            className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground"
            title={row.original.content}
          >
            {summarizeTablePreview(row.original.content)}
          </span>
        ),
      },
      {
        accessorFn: (row) => (row.active ? "active" : "disabled"),
        id: "status",
        header: () => t("table.status"),
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="secondary">{t("sections.rules.status.indexed")}</Badge>
          ) : (
            <Badge variant="outline">{t("table.disabled")}</Badge>
          ),
      },
      {
        accessorFn: (row) =>
          formatDateTime(row._creationTime, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        id: "added",
        header: () => (
          <span className={`relative block text-right ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}>
            {t("table.added")}
          </span>
        ),
        cell: ({ row }) => (
          <span
            className={`relative block truncate text-right text-sm text-muted-foreground ${DATA_TABLE_ROW_TRAILING_VALUE_OFFSET_CLASS}`}
          >
            {formatDateTime(row.original._creationTime, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => (
          <DataTableRowActions>
            {canManageTenant ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label={t("actions.moreOptions")}
                      disabled={deletingRuleId === String(row.original._id)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      size="icon-sm"
                      title={t("actions.moreOptions")}
                      type="button"
                      variant="ghost"
                    >
                      <MoreHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="end"
                  className="min-w-0 w-fit p-1"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  side="bottom"
                  sideOffset={8}
                >
                  <DropdownMenuItem
                    className="gap-2.5 px-3 py-2"
                    disabled={togglingRuleIds.includes(String(row.original._id))}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSetRuleActive(row.original, !row.original.active);
                    }}
                  >
                    {row.original.active ? <Pause /> : <Play />}
                    <span>{row.original.active ? t("actions.disable") : t("actions.enable")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2.5 px-3 py-2"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteCandidate(row.original);
                    }}
                    variant="destructive"
                  >
                    <Trash2 />
                    <span>{t("actions.delete")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </DataTableRowActions>
        ),
        meta: {
          className: DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
        },
      },
    ],
    [canManageTenant, deletingRuleId, locale, t, togglingRuleIds],
  );

  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: { pagination },
  });
  const emptyMessage =
    searchValue.trim().length > 0 ? t("table.empty") : t("sections.rules.emptyState");

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("table.searchPlaceholder")}
            value={searchValue}
          />
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{headerActions}</div>
        ) : null}
      </div>

      {isLoadingRules ? (
        <TableCardSkeleton columns={5} />
      ) : (
        <>
          <TableCard>
            <Table className="min-w-[60rem] w-full table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[42%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className={DATA_TABLE_ROW_ACTIONS_COLGROUP_CLASS} />
              </colgroup>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const className =
                        header.column.id === "added" || header.column.id === "actions"
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
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn("h-12 cursor-pointer data-[state=selected]:bg-muted/40")}
                      data-state={editingRule?._id === row.original._id ? "selected" : undefined}
                      onClick={() => {
                        if (!canManageTenant) {
                          return;
                        }
                        setEditingRule(row.original);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const className =
                          cell.column.id === "title"
                            ? "max-w-0 overflow-hidden"
                            : cell.column.id === "preview"
                              ? "max-w-0 overflow-hidden"
                              : cell.column.id === "added"
                                ? "w-0 max-w-0 text-right whitespace-nowrap"
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
                  </Fragment>
                ))}
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                      {emptyMessage}
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
            cancelLabel={t("actions.deleteCancel")}
            confirmLabel={t("actions.delete")}
            description={t("actions.deleteDescription")}
            onConfirm={async () => {
              if (!deleteCandidate) {
                return;
              }
              await handleDelete(deleteCandidate);
            }}
            onOpenChange={(open) => {
              if (!open && !deletingRuleId) {
                setDeleteCandidate(null);
              }
            }}
            open={deleteCandidate !== null}
            pending={deleteCandidate !== null && deletingRuleId === String(deleteCandidate._id)}
            title={t("actions.deleteTitle")}
          />
        </>
      )}

      {canManageTenant ? (
        <AgentRuleDialog
          businessId={businessId}
          mode="edit"
          onOpenChange={(open) => {
            if (!open) {
              setEditingRule(null);
            }
          }}
          open={editingRule !== null}
          rule={editingRule}
        />
      ) : null}
    </div>
  );
}
