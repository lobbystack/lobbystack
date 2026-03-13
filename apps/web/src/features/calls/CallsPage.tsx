import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Play, Search } from "lucide-react";
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

type CallsPageProps = {
  businessId?: Id<"businesses">;
};

type CallRow = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
  contactName: string | null;
  contactPhone: string | null;
};

export function CallsPage({ businessId }: CallsPageProps) {
  const { i18n, t } = useTranslation("calls");
  const calls = useQuery(api.voice.runtime.listRecentCalls, businessId ? { businessId, limit: 50 } : "skip");
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const selectedCall = rows.find((call) => call._id === selectedCallId);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  const statuses = ["all", ...new Set(rows.map((call) => call.status))];

  return (
    <>
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
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
                <SelectValue placeholder={t("filters.status")} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all" ? t("filters.allStatuses") : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
              {filteredRows.map((call) => (
                <TableRow key={String(call._id)}>
                  <TableCell className="font-medium">
                    {formatDateTime(call.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{call.contactName ?? t("table.unknownCaller")}</span>
                      <span className="text-xs text-muted-foreground">
                        {call.contactPhone ?? call.twilioCallSid}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{call.status}</Badge>
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
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                    {t("table.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
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
