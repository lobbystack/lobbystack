import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Play, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { cn, getPageNumbers } from "@/lib/utils";

type CallsPageProps = {
  businessId?: Id<"businesses">;
};

type CallRow = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
  contactName: string | null;
  contactPhone: string | null;
};

function formatStatusLabel(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CallsPage({ businessId }: CallsPageProps) {
  const { i18n, t } = useTranslation("calls");
  const calls = useQuery(api.voice.runtime.listRecentCalls, businessId ? { businessId, limit: 50 } : "skip");
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  const transcript = useQuery(
    api.voice.runtime.getCallTranscript,
    businessId && selectedCallId ? { businessId, callId: selectedCallId } : "skip",
  );
  const transcriptSegments = (transcript ?? []) as Array<Doc<"transcripts">>;

  const rows = (calls ?? []) as Array<CallRow>;
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return rows.filter((call) => {
      const matchesStatus = statusFilter === "all" || call.status === statusFilter;
      const searchText = [
        call.contactName,
        call.contactPhone,
        call.status,
        call.disposition,
        call.twilioCallSid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (query.length === 0 || searchText.includes(query));
    });
  }, [rows, searchValue, statusFilter]);
  const rowsPerPageValue = Number(rowsPerPage);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPageValue));
  const currentPage = Math.min(page, pageCount);
  const pageNumbers = getPageNumbers(currentPage, pageCount);
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPageValue;
    return filteredRows.slice(startIndex, startIndex + rowsPerPageValue);
  }, [currentPage, filteredRows, rowsPerPageValue]);

  const selectedCall = rows.find((call) => call._id === selectedCallId);

  useEffect(() => {
    setPage(1);
  }, [searchValue, statusFilter, rowsPerPage]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const statuses = ["all", ...new Set(rows.map((call) => call.status))];

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 pb-6 sm:gap-6 md:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("page.title")}</h2>
            <p className="text-muted-foreground">{t("page.description")}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full pl-9 sm:w-72"
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={t("filters.searchPlaceholder")}
                value={searchValue}
              />
            </div>
            <Select onValueChange={(value) => setStatusFilter(value ?? "all")} value={statusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t("filters.status")}>
                  {statusFilter === "all" ? t("filters.allStatuses") : formatStatusLabel(statusFilter)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all" ? t("filters.allStatuses") : formatStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.startedAt")}</TableHead>
                <TableHead>{t("table.caller")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.disposition")}</TableHead>
                <TableHead>{t("table.transcript")}</TableHead>
                <TableHead className="text-right">{t("table.audio")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((call) => (
                <TableRow key={String(call._id)}>
                  <TableCell className="font-medium">
                    {formatDateTime(call.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">
                        {call.contactName ?? t("table.unknownCaller")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {call.contactPhone ?? call.twilioCallSid}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{formatStatusLabel(call.status)}</Badge>
                  </TableCell>
                  <TableCell>{call.disposition ?? t("table.noDisposition")}</TableCell>
                  <TableCell>
                    <Button onClick={() => setSelectedCallId(call._id)} size="sm" variant="secondary">
                      {call.transcriptReady ? t("actions.viewTranscript") : t("actions.pendingTranscript")}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    {call.recordingUrl ? (
                      <Button
                        render={
                          <a href={call.recordingUrl} rel="noreferrer" target="_blank" />
                        }
                        size="sm"
                        variant="outline"
                      >
                        <Play data-icon="inline-start" />
                        {t("actions.listen")}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("actions.audioPending")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                    {t("table.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <div
          className={cn(
            "flex items-center justify-between overflow-clip px-2",
            "@max-2xl/content:flex-col-reverse @max-2xl/content:gap-4"
          )}
          style={{ overflowClipMargin: 1 }}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex w-[100px] items-center justify-center text-sm font-medium @2xl/content:hidden">
              {t("pagination.pageOf", { page: currentPage, total: pageCount })}
            </div>
            <div className="flex items-center gap-2 @max-2xl/content:flex-row-reverse">
              <Select onValueChange={(value) => setRowsPerPage(value ?? "10")} value={rowsPerPage}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 40, 50].map((option) => (
                    <SelectItem key={option} value={`${option}`}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="hidden text-sm font-medium sm:block">{t("pagination.rowsPerPage")}</p>
            </div>
          </div>

          <div className="flex items-center gap-6 lg:gap-8">
            <div className="flex w-[100px] items-center justify-center text-sm font-medium @max-3xl/content:hidden">
              {t("pagination.pageOf", { page: currentPage, total: pageCount })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="size-8 p-0 @max-md/content:hidden"
                disabled={currentPage === 1}
                onClick={() => setPage(1)}
                variant="outline"
              >
                <span className="sr-only">{t("pagination.firstPage")}</span>
                <ChevronsLeft />
              </Button>
              <Button
                className="size-8 p-0"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                variant="outline"
              >
                <span className="sr-only">{t("pagination.previousPage")}</span>
                <ChevronLeft />
              </Button>

              {pageNumbers.map((pageNumber, index) => (
                <div className="flex items-center" key={`${pageNumber}-${index}`}>
                  {pageNumber === "..." ? (
                    <span className="px-1 text-sm text-muted-foreground">...</span>
                  ) : (
                    <Button
                      className="h-8 min-w-8 px-2"
                      onClick={() => setPage(pageNumber)}
                      variant={currentPage === pageNumber ? "default" : "outline"}
                    >
                      <span className="sr-only">
                        {t("pagination.goToPage", { page: pageNumber })}
                      </span>
                      {pageNumber}
                    </Button>
                  )}
                </div>
              ))}

              <Button
                className="size-8 p-0"
                disabled={currentPage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                variant="outline"
              >
                <span className="sr-only">{t("pagination.nextPage")}</span>
                <ChevronRight />
              </Button>
              <Button
                className="size-8 p-0 @max-md/content:hidden"
                disabled={currentPage === pageCount}
                onClick={() => setPage(pageCount)}
                variant="outline"
              >
                <span className="sr-only">{t("pagination.lastPage")}</span>
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Sheet onOpenChange={(open) => !open && setSelectedCallId(undefined)} open={selectedCallId !== undefined}>
        <SheetContent className="w-full sm:max-w-2xl" side="right">
          <SheetHeader>
            <SheetTitle>{t("transcript.title")}</SheetTitle>
            <SheetDescription>
              {selectedCall
                ? t("transcript.description", {
                    date: formatDateTime(selectedCall.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })
                : t("transcript.emptyDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 pb-6">
            {transcriptSegments.map((segment) => (
              <div className="rounded-xl border bg-muted/30 p-4" key={String(segment._id)}>
                <div className="mb-2 text-xs font-medium tracking-[0.24em] text-muted-foreground uppercase">
                  {segment.speaker}
                </div>
                <p className="text-sm leading-6">{segment.text}</p>
              </div>
            ))}
            {selectedCallId && transcript && transcriptSegments.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                {t("transcript.noSegments")}
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
