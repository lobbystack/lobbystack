import { useQuery } from "convex/react";
import { Fragment, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { MoreHorizontal, Plus, Search } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { useObservedAction } from "@/lib/observed-convex";
import { cn } from "@/lib/utils";

type ServiceRow = Doc<"services">;

type ServiceFormState = {
  name: string;
  description: string;
  durationMinutes: string;
  active: boolean;
};

const DEFAULT_DURATION_MINUTES = 30;

const EMPTY_SERVICE_FORM: ServiceFormState = {
  name: "",
  description: "",
  durationMinutes: String(DEFAULT_DURATION_MINUTES),
  active: true,
};

function summarizeText(text: string, maxLength = 72): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function summarizeTableTitle(text: string): string {
  return summarizeText(text, 32);
}

function buildServiceSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "service"
  );
}

function buildFormFromService(service: ServiceRow): ServiceFormState {
  return {
    name: service.name,
    description: service.description ?? "",
    durationMinutes: String(service.durationMinutes),
    active: service.active,
  };
}

function normalizeDurationMinutes(value: string): number | null {
  const durationMinutes = Number(value);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return durationMinutes;
}

function RowActionsMenu({
  disabled,
  onEdit,
  onToggleActive,
  toggleActiveLabel,
}: {
  disabled?: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  toggleActiveLabel: string;
}) {
  const { t } = useTranslation("agent");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("actions.moreOptions")}
            disabled={disabled}
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
        <DropdownMenuItem className="gap-2.5 px-3 py-2" onClick={onEdit}>
          <span>{t("sections.services.editKnowledge")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5 px-3 py-2" onClick={onToggleActive}>
          <span>{toggleActiveLabel}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ServiceDialog({
  businessId,
  mode,
  service,
  open,
  onOpenChange,
}: {
  businessId: Id<"businesses">;
  mode: "create" | "edit";
  service?: ServiceRow | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation("agent");
  const upsertService = useObservedAction(api.businesses.catalog.upsertService);
  const isControlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_SERVICE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const nameId = useId();
  const descriptionId = useId();
  const durationId = useId();
  const activeId = useId();
  const isDialogOpen = isControlled ? open : internalOpen;
  const dialogTitle =
    mode === "edit"
      ? t("sections.services.editKnowledge")
      : t("sections.services.addKnowledge");
  const dialogDescription =
    mode === "edit"
      ? t("sections.services.editKnowledgeDescription")
      : t("sections.services.addKnowledgeDescription");
  const submitLabel = mode === "edit" ? t("actions.saveChanges") : t("actions.save");

  useEffect(() => {
    if (!isDialogOpen) {
      setForm(EMPTY_SERVICE_FORM);
      setIsSaving(false);
      return;
    }

    setForm(service ? buildFormFromService(service) : EMPTY_SERVICE_FORM);
  }, [isDialogOpen, service]);

  function setDialogOpen(nextOpen: boolean): void {
    onOpenChange?.(nextOpen);
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = form.name.trim();
    const durationMinutes = normalizeDurationMinutes(form.durationMinutes);
    if (!name || durationMinutes === null) {
      return;
    }

    setIsSaving(true);
    try {
      await upsertService({
        businessId,
        ...(mode === "edit" && service ? { serviceId: service._id } : {}),
        name,
        localizedNames: {
          en: service?.localizedNames?.en ?? name,
          fr: service?.localizedNames?.fr ?? name,
        },
        slug: service?.slug ?? buildServiceSlug(name),
        description: form.description.trim(),
        durationMinutes,
        active: form.active,
      });
      setDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  const trigger =
    mode === "create" && !isControlled ? (
      <Button>
        <Plus data-icon="inline-start" />
        {t("sections.services.addKnowledge")}
      </Button>
    ) : null;

  return (
    <Dialog onOpenChange={setDialogOpen} open={isDialogOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={nameId}>{t("sections.services.fields.title.label")}</FieldLabel>
                <FieldDescription>{t("sections.services.fields.title.hint")}</FieldDescription>
              </FieldContent>
              <Input
                id={nameId}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder={t("sections.services.fields.title.placeholder")}
                value={form.name}
              />
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor={durationId}>{t("sections.services.fields.duration.label")}</FieldLabel>
                <FieldDescription>{t("sections.services.fields.duration.hint")}</FieldDescription>
              </FieldContent>
              <Input
                id={durationId}
                inputMode="numeric"
                min={1}
                onChange={(event) =>
                  setForm((current) => ({ ...current, durationMinutes: event.target.value }))
                }
                placeholder={t("sections.services.fields.duration.placeholder")}
                step={1}
                type="number"
                value={form.durationMinutes}
              />
            </Field>

            <Field>
              <FieldContent>
                <FieldLabel htmlFor={descriptionId}>{t("sections.services.fields.content.label")}</FieldLabel>
                <FieldDescription>{t("sections.services.fields.content.hint")}</FieldDescription>
              </FieldContent>
              <Textarea
                className="min-h-40"
                id={descriptionId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={t("sections.services.fields.content.placeholder")}
                value={form.description}
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                aria-label={t("sections.services.fields.active.label")}
                checked={form.active}
                id={activeId}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, active: checked }))}
              />
              <FieldContent>
                <FieldLabel htmlFor={activeId}>{t("sections.services.fields.active.label")}</FieldLabel>
                <FieldDescription>{t("sections.services.fields.active.hint")}</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button className="w-full" disabled={isSaving} type="submit">
              {isSaving ? t("actions.saving") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgentServicesPage({
  businessId,
  canManageTenant,
}: {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
}) {
  const { i18n, t } = useTranslation("agent");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const configuration = useQuery(api.businesses.catalog.getBusinessConfiguration, {
    businessId,
  });
  const upsertService = useObservedAction(api.businesses.catalog.upsertService);
  const [searchValue, setSearchValue] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [editingService, setEditingService] = useState<ServiceRow | null>(null);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const services = useMemo(
    () => [...(configuration?.services ?? [])].sort((left, right) => right._creationTime - left._creationTime),
    [configuration?.services],
  );
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return services.filter((service) => {
      const haystack = [service.name, service.description ?? "", `${service.durationMinutes} min`]
        .join(" ")
        .toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [searchValue, services]);

  async function handleSetServiceActive(service: ServiceRow, active: boolean): Promise<void> {
    if (!canManageTenant) {
      return;
    }

    setTogglingServiceId(String(service._id));
    try {
      await upsertService({
        businessId,
        serviceId: service._id,
        name: service.name,
        localizedNames: service.localizedNames ?? {
          en: service.name,
          fr: service.name,
        },
        slug: service.slug,
        description: service.description ?? "",
        durationMinutes: service.durationMinutes,
        active,
      });
    } finally {
      setTogglingServiceId(null);
    }
  }

  const columns = useMemo<Array<ColumnDef<ServiceRow>>>(
    () => [
      {
        accessorFn: (row) => row.name,
        id: "title",
        header: () => t("table.title"),
        cell: ({ row }) => (
          <span
            className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium"
            title={row.original.name}
          >
            {summarizeTableTitle(row.original.name)}
          </span>
        ),
      },
      {
        accessorFn: (row) => row.description ?? "",
        id: "preview",
        header: () => t("table.preview"),
        cell: ({ row }) => {
          const preview = row.original.description?.trim()
            ? row.original.description.trim()
            : t("sections.services.durationValue", { count: row.original.durationMinutes });
          return (
            <span
              className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted-foreground"
              title={preview}
            >
              {summarizeText(preview)}
            </span>
          );
        },
      },
      {
        accessorFn: (row) => (row.active ? "active" : "disabled"),
        id: "status",
        header: () => t("table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "secondary" : "outline"}>
            {row.original.active ? t("sections.services.status.indexed") : t("table.disabled")}
          </Badge>
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
              <RowActionsMenu
                disabled={togglingServiceId === String(row.original._id)}
                onEdit={() => setEditingService(row.original)}
                onToggleActive={() => {
                  void handleSetServiceActive(row.original, !row.original.active);
                }}
                toggleActiveLabel={row.original.active ? t("actions.disable") : t("actions.enable")}
              />
            ) : null}
          </DataTableRowActions>
        ),
        meta: {
          className: DATA_TABLE_ROW_ACTIONS_CELL_CLASS,
        },
      },
    ],
    [canManageTenant, locale, t, togglingServiceId],
  );

  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  useEffect(() => {
    setPagination((current) => {
      const pageCount = Math.max(1, Math.ceil(filteredRows.length / current.pageSize));
      if (current.pageIndex <= pageCount - 1) {
        return current;
      }

      return {
        ...current,
        pageIndex: pageCount - 1,
      };
    });
  }, [filteredRows.length]);

  useEffect(() => {
    if (editingService && !services.some((service) => service._id === editingService._id)) {
      setEditingService(null);
    }
  }, [editingService, services]);

  const emptyMessage =
    searchValue.trim().length > 0 ? t("table.empty") : t("sections.services.emptyState");

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
        {canManageTenant ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ServiceDialog businessId={businessId} mode="create" />
          </div>
        ) : null}
      </div>

      {configuration === undefined ? (
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
                      className={cn(
                        canManageTenant
                          ? "h-12 cursor-pointer data-[state=selected]:bg-muted/40"
                          : "h-12 data-[state=selected]:bg-muted/40",
                      )}
                      data-state={editingService?._id === row.original._id ? "selected" : undefined}
                      onClick={() => {
                        if (canManageTenant) {
                          setEditingService(row.original);
                        }
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
        </>
      )}

      {canManageTenant ? (
        <ServiceDialog
          businessId={businessId}
          mode="edit"
          onOpenChange={(open) => {
            if (!open) {
              setEditingService(null);
            }
          }}
          open={editingService !== null}
          service={editingService}
        />
      ) : null}
    </div>
  );
}
