import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { TFunction } from "i18next";
import { Pause, Phone, Play, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { PageHeader } from "@/components/page-header";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, resolveLocale } from "@/lib/locale";

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
  const calls = useQuery(
    api.voice.runtime.listRecentCalls,
    businessId ? { businessId, limit: 50 } : "skip",
  ) as Array<CallRow> | undefined;
  const summary = useQuery(
    api.dashboard.overview.getHomeSummary,
    businessId ? { businessId, locale } : "skip",
  );
  const [searchValue, setSearchValue] = useState("");
  const [activeRecordingCallId, setActiveRecordingCallId] = useState<Id<"calls"> | null>(null);

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

  useEffect(() => {
    if (activeRecordingCallId && !rows.some((call) => call._id === activeRecordingCallId)) {
      setActiveRecordingCallId(null);
    }
  }, [activeRecordingCallId, rows]);

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader
        actions={
          <div className="inline-flex shrink-0 items-center gap-2">
            <span className="text-base font-semibold leading-none">
              {summary?.liveCalls?.toLocaleString(i18n.language) ?? "0"}
            </span>
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/45" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          </div>
        }
        description={t("page.description")}
        title={
          <span className="flex min-w-0 items-center gap-2">
            {t("page.title")}
            <Phone className="size-5" />
          </span>
        }
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

      {activeRecordingCall?.recordingUrl ? (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {activeRecordingCall.contactName ?? t("table.unknownCaller")}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {activeRecordingCall.contactPhone ?? t("table.noNumber")}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(activeRecordingCall.startedAt, i18n.language, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <CallRecordingPlayer
            className="px-4 py-3"
            downloadLabel={t("actions.download")}
            initialDurationSeconds={
              activeRecordingCall.recordingDurationMs
                ? activeRecordingCall.recordingDurationMs / 1000
                : (activeRecordingCall.providerCallDurationSeconds ?? 0)
            }
            key={String(activeRecordingCall._id)}
            pauseLabel={t("actions.pause")}
            playLabel={t("actions.play")}
            src={activeRecordingCall.recordingUrl}
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.caller")}</TableHead>
              <TableHead>{t("table.number")}</TableHead>
              <TableHead className="min-w-80">{t("table.purpose")}</TableHead>
              <TableHead>{t("table.time")}</TableHead>
              <TableHead>{t("table.play")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((call) => {
              const hasRecording = Boolean(call.recordingUrl);
              const isActive = call._id === activeRecordingCallId;

              return (
                <TableRow data-state={isActive ? "selected" : undefined} key={String(call._id)}>
                  <TableCell className="font-medium">
                    {call.contactName ?? t("table.unknownCaller")}
                  </TableCell>
                  <TableCell>{call.contactPhone ?? t("table.noNumber")}</TableCell>
                  <TableCell className="max-w-0 whitespace-normal text-sm text-muted-foreground">
                    {formatCallPurpose(call, i18n.language, t)}
                  </TableCell>
                  <TableCell>
                    {formatDateTime(call.startedAt, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    {hasRecording ? (
                      <Button
                        onClick={() =>
                          setActiveRecordingCallId((current) => (current === call._id ? null : call._id))
                        }
                        size="sm"
                        variant={isActive ? "secondary" : "outline"}
                      >
                        {isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                        {isActive ? t("actions.pause") : t("actions.play")}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("actions.audioPending")}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                  {t("table.empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
