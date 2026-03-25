import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { TFunction } from "i18next";
import { ArrowLeft, ChevronRight, Phone, Search as SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { PageHeader } from "@/components/page-header";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import {
  getFollowUpDisplayTitle,
  isUrgentFollowUpValue,
  parseFollowUpTaskBody,
} from "@/lib/follow-up-task";
import { formatDateTime, formatInboxTimestamp } from "@/lib/locale";
import { cn } from "@/lib/utils";

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

type VoiceFollowUpTaskRow = {
  id: Id<"inbox_items">;
  title: string;
  body: string;
  createdAt: string;
  callId: Id<"calls"> | null;
};

type TranscriptSegment = Doc<"transcripts">;

const CONVEX_ID_PARAM_PATTERN = /^[a-z0-9]{32}$/;

function initials(value: string | null, fallback: string): string {
  if (!value) {
    return fallback.slice(0, 2).toUpperCase();
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatStatusLabel(value: string): string {
  if (value.length === 0) {
    return value;
  }

  const normalized = value.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSpeakerLabel(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isAgentSpeaker(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ["assistant", "agent", "receptionist", "system", "ai"].some((token) =>
    normalized.includes(token),
  );
}

function isConvexIdParam(value: string | null): value is string {
  return value !== null && CONVEX_ID_PARAM_PATTERN.test(value);
}

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

function getCallFollowUpDisplayTitle(
  task: { title: string; body: string },
  t: TFunction<"calls">,
): string {
  return getFollowUpDisplayTitle({
    title: task.title,
    kind: "voice_message",
    body: task.body,
    formatWithContact: (message, name) =>
      t("followUp.titleWithContact", {
        message,
        name,
      }),
  });
}

export function CallsPage({ businessId }: CallsPageProps) {
  const { i18n, t } = useTranslation("calls");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCallId = searchParams.get("callId");
  const requestedTaskId = searchParams.get("taskId");
  const normalizedRequestedCallId = isConvexIdParam(requestedCallId)
    ? (requestedCallId as Id<"calls">)
    : null;
  const normalizedRequestedTaskId = isConvexIdParam(requestedTaskId)
    ? (requestedTaskId as Id<"inbox_items">)
    : null;
  const calls = useQuery(
    api.voice.runtime.listRecentCalls,
    businessId
      ? {
          businessId,
          limit: 50,
          ...(normalizedRequestedCallId ? { selectedCallId: normalizedRequestedCallId } : {}),
        }
      : "skip",
  );
  const summary = useQuery(
    api.dashboard.overview.getHomeSummary,
    businessId ? { businessId } : "skip",
  );
  const completeVoiceFollowUpTask = useMutation(api.voice.runtime.completeVoiceFollowUpTask);
  const [selectedCallId, setSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [mobileSelectedCallId, setMobileSelectedCallId] = useState<Id<"calls"> | undefined>();
  const [isOutcomeOpen, setIsOutcomeOpen] = useState(true);
  const [searchValue, setSearchValue] = useState("");
  const [isCompletingFollowUp, setIsCompletingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [resolvedRows, setResolvedRows] = useState<Array<CallRow>>([]);
  const selectedCallDetail = useQuery(
    api.voice.runtime.getCallForDashboard,
    businessId && normalizedRequestedCallId
      ? { businessId, callId: normalizedRequestedCallId }
      : businessId && selectedCallId
        ? { businessId, callId: selectedCallId }
      : "skip",
  ) as CallRow | null | undefined;
  const requestedFollowUpTask = useQuery(
    api.voice.runtime.getVoiceFollowUpTaskForDashboard,
    businessId && normalizedRequestedTaskId
      ? { businessId, inboxItemId: normalizedRequestedTaskId }
      : "skip",
  ) as VoiceFollowUpTaskRow | null | undefined;

  const transcript = useQuery(
    api.voice.runtime.getCallTranscript,
    businessId && selectedCallId ? { businessId, callId: selectedCallId } : "skip",
  ) as Array<TranscriptSegment> | undefined;

  useEffect(() => {
    if (
      (requestedCallId !== null && normalizedRequestedCallId === null) ||
      (requestedTaskId !== null && normalizedRequestedTaskId === null)
    ) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (requestedCallId !== null && normalizedRequestedCallId === null) {
            next.delete("callId");
          }
          if (requestedTaskId !== null && normalizedRequestedTaskId === null) {
            next.delete("taskId");
          }
          return next;
        },
        { replace: true },
      );
    }
  }, [
    normalizedRequestedCallId,
    normalizedRequestedTaskId,
    requestedCallId,
    requestedTaskId,
    setSearchParams,
  ]);

  useEffect(() => {
    if (calls !== undefined) {
      setResolvedRows(calls as Array<CallRow>);
    }
  }, [calls]);

  const rows = calls === undefined ? resolvedRows : (calls as Array<CallRow>);
  const filteredRows = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return rows.filter((call) => {
      const haystack = [
        call.contactName,
        call.contactPhone,
        call.transcriptPreview,
        call.disposition,
        call.status,
        call.twilioCallSid,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return query.length === 0 || haystack.includes(query);
    });
  }, [rows, searchValue]);

  const requestedCall = normalizedRequestedCallId
    ? rows.find((call) => String(call._id) === normalizedRequestedCallId) ??
      (selectedCallDetail === undefined ? undefined : selectedCallDetail)
    : null;
  const selectedCall =
    normalizedRequestedCallId !== null
      ? requestedCall ?? null
      : filteredRows.find((call) => call._id === selectedCallId) ??
        rows.find((call) => call._id === selectedCallId) ??
        selectedCallDetail ??
        null;
  const activeFollowUpTask =
    selectedCall?.followUpTask ??
    (selectedCall === null ? requestedFollowUpTask ?? null : null);
  const selectedCallFollowUpDetails = activeFollowUpTask
    ? parseFollowUpTaskBody(activeFollowUpTask.body)
    : null;
  const activeFollowUpDisplayTitle = activeFollowUpTask
    ? getCallFollowUpDisplayTitle(activeFollowUpTask, t)
    : null;
  const hasTaskOnlyRequest =
    normalizedRequestedCallId === null && normalizedRequestedTaskId !== null;

  useEffect(() => {
    if (hasTaskOnlyRequest) {
      if (selectedCallId !== undefined || mobileSelectedCallId !== undefined) {
        setSelectedCallId(undefined);
        setMobileSelectedCallId(undefined);
      }
      return;
    }

    const nextSelectedCall =
      normalizedRequestedCallId !== null
        ? requestedCall ?? null
        : filteredRows[0] ?? rows[0] ?? null;

    if (nextSelectedCall && selectedCallId !== nextSelectedCall._id) {
      setSelectedCallId(nextSelectedCall._id);
      setMobileSelectedCallId(nextSelectedCall._id);
    }
  }, [
    filteredRows,
    hasTaskOnlyRequest,
    mobileSelectedCallId,
    normalizedRequestedCallId,
    requestedCall,
    rows,
    selectedCallId,
  ]);

  useEffect(() => {
    if (selectedCallId) {
      setIsOutcomeOpen(true);
    }
  }, [selectedCallId]);

  function setSelectedCall(callId: Id<"calls">) {
    setSelectedCallId(callId);
    setMobileSelectedCallId(callId);
    setFollowUpError(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("callId", String(callId));
      next.delete("taskId");
      return next;
    });
  }

  async function handleMarkFollowUpDone(taskId: Id<"inbox_items">) {
    if (!businessId) {
      return;
    }

    setFollowUpError(null);
    setIsCompletingFollowUp(true);
    try {
      await completeVoiceFollowUpTask({
        businessId,
        inboxItemId: taskId,
      });
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : t("followUp.completeFailed"));
    } finally {
      setIsCompletingFollowUp(false);
    }
  }

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  return (
    <section className="flex min-w-0 h-full gap-6">
      <div className="flex min-w-0 w-full flex-col gap-3 sm:w-56 lg:w-72 2xl:w-80">
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-background px-4 py-2 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none">
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
            className="py-0"
            title={
              <span className="flex min-w-0 items-center gap-2">
                {t("page.title")}
                <Phone className="size-5" />
              </span>
            }
          />
          <label
            className={cn(
              "focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden",
              "flex h-10 w-full items-center space-x-0 rounded-md border border-border ps-3",
            )}
          >
            <SearchIcon className="me-2 stroke-slate-500" size={15} />
            <span className="sr-only">{t("filters.searchPlaceholder")}</span>
            <input
              className="w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("filters.searchPlaceholder")}
              type="text"
              value={searchValue}
            />
          </label>
        </div>

        <div className="-mx-3 no-scrollbar h-full overflow-y-auto p-3">
          {filteredRows.map((call) => {
            const isActive = call._id === selectedCallId;
            const preview =
              call.transcriptPreview ??
              call.disposition ??
              formatStatusLabel(call.status) ??
              t("page.emptyPreview");

            return (
              <Fragment key={String(call._id)}>
                <button
                  className={cn(
                    "group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm",
                    isActive && "sm:bg-muted",
                  )}
                  onClick={() => setSelectedCall(call._id)}
                  type="button"
                >
                  <div className="flex gap-2">
                    <Avatar>
                      <AvatarFallback>
                        {initials(call.contactName, call.contactPhone ?? t("page.unknownShort"))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <span className="block min-w-0 flex-1 truncate font-semibold">
                          {call.contactName ??
                            call.contactPhone ??
                            t("table.unknownCaller")}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground group-hover:text-accent-foreground/90">
                          {formatInboxTimestamp(call.startedAt, i18n.language, {
                            yesterday: t("page.yesterday"),
                          })}
                        </span>
                      </div>
                      <span className="line-clamp-2 text-ellipsis text-muted-foreground group-hover:text-accent-foreground/90">
                        {preview}
                      </span>
                    </div>
                  </div>
                </button>
                <Separator className="my-1" />
              </Fragment>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 start-full z-50 hidden min-w-0 w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md",
          mobileSelectedCallId && "start-0 flex",
        )}
      >
        {selectedCall ? (
          <>
            <div className="flex min-w-0 flex-none flex-col gap-4 bg-card p-4 shadow-lg sm:rounded-t-md xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 gap-3">
                <Button
                  className="-ms-2 h-full sm:hidden"
                  onClick={() => setMobileSelectedCallId(undefined)}
                  size="icon"
                  variant="ghost"
                >
                  <ArrowLeft className="rtl:rotate-180" />
                </Button>
                <div className="flex min-w-0 items-center gap-2 lg:gap-4">
                  <Avatar className="size-9 lg:size-11">
                    <AvatarFallback>
                      {initials(selectedCall.contactName, selectedCall.contactPhone ?? t("page.unknownShort"))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold lg:text-base">
                      {selectedCall.contactName ??
                        selectedCall.contactPhone ??
                        t("table.unknownCaller")}
                    </span>
                    <span className="block max-w-48 line-clamp-1 text-xs text-ellipsis text-muted-foreground lg:max-w-none lg:text-sm">
                      {selectedCall.contactPhone ??
                        formatDateTime(selectedCall.startedAt, i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="min-w-0 w-full xl:-me-2 xl:ms-auto xl:max-w-lg">
                {selectedCall.recordingUrl ? (
                  <CallRecordingPlayer
                    downloadLabel={t("actions.download")}
                    initialDurationSeconds={Math.max(
                      selectedCall.providerCallDurationSeconds ?? 0,
                      selectedCall.recordingDurationMs
                        ? Math.ceil(selectedCall.recordingDurationMs / 1000)
                        : 0,
                    )}
                    key={String(selectedCall._id)}
                    pauseLabel={t("actions.pause")}
                    playLabel={t("actions.play")}
                    src={selectedCall.recordingUrl}
                  />
                ) : null}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-4 rounded-md px-4 pb-4">
              {activeFollowUpTask ? (
                <div className="mt-4 flex flex-col gap-3">
                  <Item className="px-0 py-0" size="sm" variant="default">
                    <ItemContent className="min-w-0">
                      <ItemHeader>
                        <ItemTitle className="w-full min-w-0 max-w-full">
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                            {activeFollowUpDisplayTitle}
                          </span>
                        </ItemTitle>
                        <ItemActions>
                          <Button
                            disabled={isCompletingFollowUp}
                            onClick={() => void handleMarkFollowUpDone(activeFollowUpTask.id)}
                            size="sm"
                            variant="outline"
                          >
                            {isCompletingFollowUp
                              ? t("followUp.markingDone")
                              : t("followUp.markDone")}
                          </Button>
                        </ItemActions>
                      </ItemHeader>
                      {selectedCallFollowUpDetails?.callbackWindow ? (
                        <ItemDescription>
                          {selectedCallFollowUpDetails.callbackWindow}
                        </ItemDescription>
                      ) : null}
                      <ItemFooter className="text-xs text-muted-foreground">
                        <span>
                          {t("followUp.createdAt", {
                            time: formatDateTime(activeFollowUpTask.createdAt, i18n.language, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }),
                          })}
                        </span>
                        {isUrgentFollowUpValue(selectedCallFollowUpDetails?.urgency) ? (
                          <span className="font-medium text-destructive">
                            {t("followUp.urgent")}
                          </span>
                        ) : null}
                      </ItemFooter>
                    </ItemContent>
                  </Item>
                  {followUpError ? (
                    <p className="text-sm text-destructive">{followUpError}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex min-w-0 size-full flex-1">
                <div className="relative -me-4 flex min-w-0 flex-1 flex-col overflow-y-hidden">
                  <div className="flex h-40 min-w-0 w-full grow flex-col-reverse justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4">
                    <div className="flex self-stretch flex-col gap-3 pt-2">
                      <button
                        className="mx-auto flex w-full max-w-3xl items-center justify-center gap-3 text-muted-foreground"
                        onClick={() => setIsOutcomeOpen((current) => !current)}
                        type="button"
                      >
                        <span className="h-px w-64 bg-border/60 md:w-96" />
                        <span className="inline-flex items-center justify-center gap-1.5 text-sm font-medium">
                          {t("outcome.label")}
                          <ChevronRight
                            className={cn(
                              "size-3.5 transition-transform duration-200",
                              isOutcomeOpen && "rotate-90",
                            )}
                          />
                        </span>
                        <span className="h-px w-64 bg-border/60 md:w-96" />
                      </button>
                      {isOutcomeOpen ? (
                        <p className="text-center text-sm leading-6 text-muted-foreground">
                          {formatCallOutcomeSummary(selectedCall.outcome, i18n.language, t)}
                        </p>
                      ) : null}
                    </div>
                    {[...(transcript ?? [])].reverse().map((segment) => {
                      const outbound = isAgentSpeaker(segment.speaker);

                      return (
                        <div
                          className={cn(
                            "max-w-72 px-3 py-2 wrap-break-word shadow-lg",
                            outbound
                              ? "self-end rounded-[16px_16px_0_16px] bg-primary/90 text-primary-foreground"
                              : "self-start rounded-[16px_16px_16px_0] bg-muted",
                          )}
                          key={String(segment._id)}
                        >
                          <span
                            className={cn(
                              "mb-1 block text-[11px] font-semibold",
                              outbound
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatSpeakerLabel(segment.speaker)}
                          </span>
                          <p>{segment.text}</p>
                        </div>
                      );
                    })}

                    {transcript && transcript.length === 0 ? (
                      <div className="self-center rounded-xl border border-dashed px-6 py-4 text-sm text-muted-foreground">
                        {t("transcript.noSegments")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : requestedFollowUpTask ? (
          <div className="flex flex-1 flex-col gap-4 p-4">
            <div className="flex flex-col gap-3">
              <Item className="px-0 py-0" size="sm" variant="default">
                <ItemContent className="min-w-0">
                  <ItemHeader>
                    <ItemTitle className="w-full min-w-0 max-w-full">
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {activeFollowUpDisplayTitle}
                      </span>
                    </ItemTitle>
                    <ItemActions>
                      <Button
                        disabled={isCompletingFollowUp}
                        onClick={() => void handleMarkFollowUpDone(requestedFollowUpTask.id)}
                        size="sm"
                        variant="outline"
                      >
                        {isCompletingFollowUp
                          ? t("followUp.markingDone")
                          : t("followUp.markDone")}
                      </Button>
                    </ItemActions>
                  </ItemHeader>
                  {selectedCallFollowUpDetails?.callbackWindow ? (
                    <ItemDescription>
                      {selectedCallFollowUpDetails.callbackWindow}
                    </ItemDescription>
                  ) : null}
                  <ItemFooter className="text-xs text-muted-foreground">
                    <span>
                      {t("followUp.createdAt", {
                        time: formatDateTime(requestedFollowUpTask.createdAt, i18n.language, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </span>
                    {isUrgentFollowUpValue(selectedCallFollowUpDetails?.urgency) ? (
                      <span className="font-medium text-destructive">
                        {t("followUp.urgent")}
                      </span>
                    ) : null}
                  </ItemFooter>
                </ItemContent>
              </Item>
              <p className="text-sm text-muted-foreground">
                {t("followUp.callUnavailable")}
              </p>
              {followUpError ? (
                <p className="text-sm text-destructive">{followUpError}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t("page.selectCall")}
          </div>
        )}
      </div>
    </section>
  );
}
