import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { Pause, Play, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { DataTablePagination } from "@/components/data-table/pagination";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type CallsPageProps = {
  businessId?: Id<"businesses">;
};

type CallRow = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
  transcriptPreview: string | null;
  contactName: string | null;
  contactPhone: string | null;
  outcome: {
    kind: "booked" | "booking_in_progress" | "message_taking" | "summary" | "disposition" | "none";
    serviceName?: string | null;
    startsAt?: string | null;
    summary?: string | null;
    disposition?: string | null;
  };
  followUpTask: {
    id: Id<"inbox_items">;
    title: string;
    body: string;
    createdAt: string;
  } | null;
};

function formatCallDispositionSummary(
  disposition: string,
  t: TFunction<"calls">,
): string {
  const normalized = disposition.trim().toLowerCase();

  if (normalized.includes("transfer_completed")) {
    return t("outcome.transferCompleted");
  }
  if (normalized.includes("transfer_busy")) {
    return t("outcome.transferBusy");
  }
  if (normalized.includes("transfer_")) {
    return t("outcome.transferFailed");
  }
  if (normalized.includes("voicemail")) {
    return t("outcome.voicemail");
  }
  if (normalized.includes("busy")) {
    return t("outcome.busy");
  }
  if (normalized.includes("no_answer") || normalized.includes("missed")) {
    return t("outcome.noAnswer");
  }
  if (normalized.includes("stream_start_failed") || normalized.includes("openai_handshake_failed")) {
    return t("outcome.technicalIssue");
  }
  if (normalized.includes("failed")) {
    return t("outcome.technicalIssue");
  }
  if (normalized.includes("canceled") || normalized.includes("cancelled")) {
    return t("outcome.canceled");
  }
  if (normalized.includes("completed")) {
    return t("outcome.completed");
  }

  return t("outcome.none");
}

function formatCallOutcomeSummary(
  outcome: CallRow["outcome"] | undefined,
  locale: string,
  t: TFunction<"calls">,
): string {
  if (!outcome) {
    return t("outcome.none");
  }

  switch (outcome.kind) {
    case "booked":
      return t("outcome.booked", {
        serviceName: outcome.serviceName ?? t("outcome.genericService"),
        startsAt: outcome.startsAt
          ? formatDateTime(outcome.startsAt, locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : t("outcome.unspecifiedTime"),
      });
    case "booking_in_progress":
      if (outcome.serviceName && outcome.startsAt) {
        return t("outcome.schedulingWithServiceAndTime", {
          serviceName: outcome.serviceName,
          startsAt: formatDateTime(outcome.startsAt, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        });
      }
      if (outcome.serviceName) {
        return t("outcome.schedulingWithService", {
          serviceName: outcome.serviceName,
        });
      }
      return t("outcome.scheduling");
    case "message_taking":
      return t("outcome.messageTaken");
    case "summary":
      return outcome.summary ?? t("outcome.none");
    case "disposition":
      return outcome.disposition
        ? formatCallDispositionSummary(outcome.disposition, t)
        : t("outcome.none");
    default:
      return t("outcome.none");
  }
}

function formatCallPurpose(
  call: CallRow,
  locale: string,
  t: TFunction<"calls">,
): string {
  if (call.outcome.kind !== "none") {
    return formatCallOutcomeSummary(call.outcome, locale, t);
  }

  const preview = call.transcriptPreview?.trim();
  if (preview) {
    return preview;
  }

  return t("outcome.none");
}

export function CallsPage({ businessId }: CallsPageProps) {
  const { i18n, t } = useTranslation("calls");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const rememberedCalls = useRememberedConvexQuery(
    api.voice.runtime.listRecentCalls,
    businessId ? { businessId, limit: 50 } : "skip",
  );
  const calls = rememberedCalls.data as Array<CallRow> | undefined;
  const isLoadingCalls = rememberedCalls.isInitialLoading;
  const rememberedSummary = useRememberedConvexQuery(
    api.dashboard.overview.getHomeSummary,
    businessId ? { businessId, locale } : "skip",
  );
  const summary = rememberedSummary.data;
  const [searchValue, setSearchValue] = useState("");
  const [activeRecordingCallId, setActiveRecordingCallId] = useState<Id<"calls"> | null>(null);
  const navigate = useNavigate();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const rows = calls ?? [];
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return rows.filter((call) => {
      const purpose = formatCallPurpose(call, i18n.language, t);
      const haystack = [
        call.contactName,
        call.contactPhone,
        purpose,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return query.length === 0 || haystack.includes(query);
    });
  }, [i18n.language, rows, searchValue, t]);

  const activeRecordingCall = useMemo(
    () => rows.find((call) => call._id === activeRecordingCallId) ?? null,
    [activeRecordingCallId, rows],
  );

  const columns = useMemo<Array<ColumnDef<CallRow>>>(
    () => [
      {
        accessorFn: (call) => call.contactName ?? t("table.unknownCaller"),
        id: "caller",
        header: () => t("table.caller"),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.contactName ?? t("table.unknownCaller")}
          </span>
        ),
      },
      {
        accessorFn: (call) => call.contactPhone ?? t("table.noNumber"),
        id: "number",
        header: () => t("table.number"),
        cell: ({ row }) =>
          row.original.contactPhone
            ? formatPhoneNumberDisplay(row.original.contactPhone, i18n.language)
            : t("table.noNumber"),
      },
      {
        accessorFn: (call) => formatCallPurpose(call, i18n.language, t),
        id: "purpose",
        header: () => t("table.purpose"),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatCallPurpose(row.original, i18n.language, t)}
          </span>
        ),
      },
      {
        accessorFn: (call) =>
          formatDateTime(call.startedAt, i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        id: "time",
        header: () => <span className="block text-right">{t("table.time")}</span>,
        cell: ({ row }) => (
          <span className="block text-right">
            {formatDateTime(row.original.startedAt, i18n.language, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ),
      },
      {
        id: "play",
        header: () => null,
        cell: ({ row }) => {
          const call = row.original;
          const hasRecording = Boolean(call.recordingUrl);
          const isActive = call._id === activeRecordingCallId;

          if (!hasRecording) {
            return <span className="text-sm text-muted-foreground">{t("actions.audioPending")}</span>;
          }

          return (
            <Button
              aria-label={isActive ? t("actions.pause") : t("actions.play")}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveRecordingCallId((current) => (current === call._id ? null : call._id));
              }}
              size="icon-sm"
              title={isActive ? t("actions.pause") : t("actions.play")}
              variant="ghost"
            >
              {isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
          );
        },
        meta: {
          className: "w-12 text-right",
        },
      },
    ],
    [activeRecordingCallId, i18n.language, t],
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
    if (activeRecordingCallId && !rows.some((call) => call._id === activeRecordingCallId)) {
      setActiveRecordingCallId(null);
    }
  }, [activeRecordingCallId, rows]);

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

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        actions={
          <div className="inline-flex shrink-0 items-center gap-2">
            {summary === undefined ? (
              <Skeleton className="h-6 w-8" />
            ) : (
              <span className="text-base font-semibold leading-none">
                {summary.liveCalls.toLocaleString(i18n.language)}
              </span>
            )}
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/45" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
        }
        description={t("page.description")}
        title={t("page.title")}
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={t("filters.searchPlaceholder")}
          value={searchValue}
        />
      </div>

      <CallRecordingPlayer
        autoPlay
        downloadLabel={t("actions.download")}
        initialDurationSeconds={
          activeRecordingCall?.recordingDurationMs
            ? activeRecordingCall.recordingDurationMs / 1000
            : (activeRecordingCall?.providerCallDurationSeconds ?? 0)
        }
        onEnded={() => setActiveRecordingCallId(null)}
        pauseLabel={t("actions.pause")}
        playLabel={t("actions.play")}
        src={activeRecordingCall?.recordingUrl ?? null}
        variant="hidden"
      />

      {isLoadingCalls ? (
        <TableCardSkeleton columns={5} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const className =
                        header.column.id === "purpose"
                          ? "min-w-80"
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
                {table.getRowModel().rows.map((row) => {
                  const isActive = row.original._id === activeRecordingCallId;

                  return (
                    <TableRow
                      className="h-12 cursor-pointer"
                      data-state={isActive ? "selected" : undefined}
                      key={row.id}
                      onClick={() => navigate(`/calls/${row.original._id}`)}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const className =
                          cell.column.id === "purpose"
                            ? "max-w-0 whitespace-normal"
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
                  );
                })}
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
