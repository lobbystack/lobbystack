"use client";

import { subscribeRealtimeQuery } from "@/lib/realtime-query";

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
import { Pause, Play, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { DataTablePagination } from "@/components/data-table/pagination";
import { TableCardSkeleton } from "@/components/loading-skeletons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CallOutcome } from "../../../../packages/domain/src/server/callOutcome";
import { formatCallOutcomeSummary } from "@/lib/call-outcome";
import { formatDateTime } from "@/lib/locale";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type Business = { businessId: string; active: boolean };
type Call = {
  outcome: CallOutcome;
  id: string;
  providerCallId: string;
  status: string;
  disposition: string | null;
  reason: string | null;
  startedAt: string;
  providerDurationSeconds: number | null;
  contactName: string | null;
  contactPhone: string | null;
  recordingState: "available" | "pending" | "expired" | "missing";
  transcriptPreview: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load live call data.");
  return await response.json() as T;
}

export function LiveCallsSurface() {
  const { i18n, t } = useTranslation("calls");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses"),
  });
  const business = businesses.data?.businesses.find((item) => item.active) ?? businesses.data?.businesses[0];
  const calls = useQuery({
    queryKey: ["calls", business?.businessId],
    queryFn: () => getJson<{ calls: Call[] }>("/api/calls?limit=50"),
    enabled: Boolean(business),
  });
  const recording = useQuery({
    queryKey: ["call-recording", activeRecordingId],
    queryFn: () => getJson<{ url: string }>(`/api/calls/${encodeURIComponent(activeRecordingId!)}/recording`),
    enabled: Boolean(activeRecordingId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["calls", business?.businessId], ["call.started", "call.updated", "call.completed", "recording.available"]);
  }, [business?.businessId, queryClient]);

  const rows = calls.data?.calls ?? [];
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((call) => (
      [call.contactName, call.contactPhone, call.reason, call.disposition, call.transcriptPreview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    ));
  }, [rows, search]);

  useEffect(() => {
    setPagination((current) => {
      const finalPage = Math.max(0, Math.ceil(filteredRows.length / current.pageSize) - 1);
      return current.pageIndex > finalPage ? { ...current, pageIndex: finalPage } : current;
    });
  }, [filteredRows.length]);

  const columns = useMemo<Array<ColumnDef<Call>>>(() => [
    {
      id: "caller",
      accessorFn: (call) => call.contactName ?? t("table.unknownCaller"),
      header: () => t("table.caller"),
      cell: ({ row }) => <span className="ph-mask font-medium">{row.original.contactName ?? t("table.unknownCaller")}</span>,
    },
    {
      id: "number",
      accessorFn: (call) => call.contactPhone ?? t("table.noNumber"),
      header: () => t("table.number"),
      cell: ({ row }) => <span className="ph-mask">{row.original.contactPhone ? formatPhoneNumberDisplay(row.original.contactPhone, i18n.language) : t("table.noNumber")}</span>,
    },
    {
      id: "purpose",
      accessorFn: (call) => call.reason ?? t("outcome.none"),
      header: () => t("table.purpose"),
      cell: ({ row }) => <span className="type-body-muted">{row.original.outcome?.kind !== "none" ? formatCallOutcomeSummary(row.original.outcome, i18n.language, t) : row.original.transcriptPreview?.trim() || t("outcome.none")}</span>,
    },
    {
      id: "time",
      accessorFn: (call) => call.startedAt,
      header: () => <span className="block text-right">{t("table.time")}</span>,
      cell: ({ row }) => <span className="block text-right">{formatDateTime(row.original.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</span>,
    },
    {
      id: "play",
      header: () => null,
      cell: ({ row }) => {
        const call = row.original;
        if (call.recordingState !== "available") {
          return <span className="type-body-muted">{call.recordingState === "pending" ? t("actions.audioPending") : t("actions.audioUnavailable")}</span>;
        }
        const active = call.id === activeRecordingId;
        return (
          <Button
            aria-label={active ? t("actions.pause") : t("actions.play")}
            onClick={(event) => {
              event.stopPropagation();
              setActiveRecordingId((current) => current === call.id ? null : call.id);
            }}
            size="icon-sm"
            title={active ? t("actions.pause") : t("actions.play")}
            variant="ghost"
          >
            {active ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        );
      },
    },
  ], [activeRecordingId, i18n.language, t]);

  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: { pagination },
  });
  const liveCalls = rows.filter((call) => call.status === "started").length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        actions={
          <div className="inline-flex shrink-0 items-center gap-2">
            {calls.isLoading ? <Skeleton className="h-6 w-8" /> : <span className="text-base font-semibold leading-none">{liveCalls.toLocaleString(i18n.language)}</span>}
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/45" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
        }
        title={t("page.title")}
      />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
          placeholder={t("filters.searchPlaceholder")}
          value={search}
        />
      </div>
      <CallRecordingPlayer
        autoPlay
        downloadLabel={t("actions.download")}
        initialDurationSeconds={rows.find((call) => call.id === activeRecordingId)?.providerDurationSeconds ?? 0}
        onEnded={() => setActiveRecordingId(null)}
        pauseLabel={t("actions.pause")}
        playLabel={t("actions.play")}
        src={recording.data?.url ?? null}
        variant="hidden"
      />
      {businesses.isLoading || calls.isLoading ? <TableCardSkeleton columns={5} /> : (
        <>
          <TableCard>
            <Table className="min-w-[56rem]">
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead className={header.column.id === "purpose" ? "min-w-80" : header.column.id === "play" ? "w-12 text-right" : undefined} key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    className="h-12 cursor-pointer"
                    data-state={row.original.id === activeRecordingId ? "selected" : undefined}
                    key={row.id}
                    onClick={() => router.push(`/calls/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className={cell.column.id === "purpose" ? "max-w-0 whitespace-normal" : cell.column.id === "play" ? "w-12 text-right" : undefined} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {table.getRowModel().rows.length === 0 ? <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>{t("table.empty")}</TableCell></TableRow> : null}
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
    </div>
  );
}
