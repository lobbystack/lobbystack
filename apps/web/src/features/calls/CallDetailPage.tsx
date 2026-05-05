import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Copy,
  FileText,
  Headphones,
  Info,
  Loader2,
  Phone,
  XCircle,
} from "lucide-react";
import { useObservedMutation } from "@/lib/observed-convex";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { DetailPageSkeleton } from "@/components/loading-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionBlock } from "@/components/section-block";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import { cn } from "@/lib/utils";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type CallDetailPageProps = {
  businessId?: Id<"businesses">;
};

type CallRow = Doc<"calls"> & {
  recordingUrl: string | null;
  transcriptReady: boolean;
  transcriptPreview: string | null;
  contactName: string | null;
  contactPhone: string | null;
  outcome: {
    kind:
      | "booked"
      | "booking_in_progress"
      | "message_taking"
      | "summary"
      | "disposition"
      | "none";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
  }
  return `${remainingSeconds}s`;
}

export function resolveCallStatus(
  call: CallRow,
): "in_progress" | "completed" | "failed" {
  if (call.status === "in_progress" || call.status === "open") {
    return "in_progress";
  }

  const disposition = call.disposition?.trim().toLowerCase() ?? "";
  if (
    disposition.includes("failed") ||
    disposition.includes("busy") ||
    disposition.includes("canceled") ||
    disposition.includes("cancelled") ||
    disposition.includes("no_answer") ||
    disposition.includes("missed") ||
    disposition.includes("stream_start_failed") ||
    disposition.includes("openai_handshake_failed")
  ) {
    return "failed";
  }

  return "completed";
}

export function isContactBlockedCall(call: { disposition?: string }): boolean {
  return call.disposition?.trim().toLowerCase().includes("contact_blocked") ?? false;
}

export function callReachedConnectedStep(call: CallRow): boolean {
  if (call.status === "in_progress") {
    return true;
  }

  if (call.status === "open") {
    return false;
  }

  if (isContactBlockedCall(call)) {
    return false;
  }

  const disposition = call.disposition?.trim().toLowerCase() ?? "";
  if (
    disposition.includes("busy") ||
    disposition.includes("canceled") ||
    disposition.includes("cancelled") ||
    disposition.includes("no_answer") ||
    disposition.includes("missed")
  ) {
    return false;
  }

  return true;
}

type CallEvent = {
  key: string;
  labelKey: string;
  timestamp: string | null;
  reached: boolean;
  isFinal: boolean;
  failed: boolean;
};

export function buildCallEvents(call: CallRow): CallEvent[] {
  const events: CallEvent[] = [];
  const status = resolveCallStatus(call);
  const reachedConnectedStep = callReachedConnectedStep(call);

  events.push({
    key: "received",
    labelKey: "detail.events.received",
    timestamp: call.startedAt,
    reached: true,
    isFinal: false,
    failed: false,
  });

  if (isContactBlockedCall(call)) {
    events.push({
      key: "blocked",
      labelKey: "detail.events.blocked",
      timestamp: call.endedAt ?? call.startedAt,
      reached: true,
      isFinal: true,
      failed: true,
    });
    return events;
  }

  events.push({
    key: "connected",
    labelKey: "detail.events.connected",
    timestamp: reachedConnectedStep ? call.startedAt : null,
    reached: reachedConnectedStep,
    isFinal: false,
    failed: false,
  });

  if (
    call.transferState &&
    call.transferState !== "none" &&
    call.transferState !== "idle"
  ) {
    events.push({
      key: "transferred",
      labelKey: "detail.events.transferred",
      timestamp: null,
      reached: true,
      isFinal: false,
      failed: call.transferState.includes("failed") ||
        call.transferState.includes("busy"),
    });
  }

  if (status === "failed") {
    events.push({
      key: "failed",
      labelKey: "detail.events.failed",
      timestamp: call.endedAt ?? null,
      reached: true,
      isFinal: true,
      failed: true,
    });
  } else {
    events.push({
      key: "completed",
      labelKey: "detail.events.completed",
      timestamp: call.endedAt ?? null,
      reached: status === "completed",
      isFinal: true,
      failed: false,
    });
  }

  return events;
}

function truncateId(id: string, maxLength = 16): string {
  if (id.length <= maxLength) return id;
  return `${id.slice(0, maxLength)}…`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CallEventTimeline({
  events,
  locale,
}: {
  events: CallEvent[];
  locale: string;
}) {
  const { t } = useTranslation("calls");
  return (
    <div className="flex items-start gap-0 overflow-x-auto px-2 py-4">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        return (
          <div key={event.key} className="flex items-start">
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex size-8 items-center justify-center">
                {event.failed ? (
                  <XCircle className="size-5 text-destructive" />
                ) : event.reached ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : (
                  <Circle className="size-5 text-muted-foreground/40" />
                )}
              </div>
              <span
                className={cn(
                  "type-body whitespace-nowrap",
                  event.reached
                    ? event.failed
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {t(event.labelKey)}
              </span>
              {event.timestamp ? (
                <span className="type-meta">
                  {formatDateTime(event.timestamp, locale, {
                    month: "short",
                    day: "numeric",
                  })}
                  {", "}
                  {formatDateTime(event.timestamp, locale, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span className="type-meta">&nbsp;</span>
              )}
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="mt-3.5 h-px w-12 self-start bg-border sm:w-20" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TranscriptTab({
  businessId,
  callId,
}: {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
}) {
  const { t } = useTranslation("calls");
  const rememberedTranscript =
    useRememberedConvexQuery(api.voice.runtime.getCallTranscript, {
      businessId,
      callId,
    });
  const transcript = rememberedTranscript.data as Array<Doc<"transcripts">> | undefined;
  const isLoadingTranscript = rememberedTranscript.isInitialLoading;

  if (isLoadingTranscript) {
    return (
      <div className="py-4">
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 pt-0">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                className={`max-w-[80%] px-4 py-3 ${index % 2 === 0 ? "self-start rounded-[16px_16px_16px_0] bg-muted" : "self-end rounded-[16px_16px_0_16px] bg-primary/10 dark:bg-primary/20"}`}
                key={index}
              >
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-4 w-52" />
                <Skeleton className="mt-2 h-4 w-36" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (transcript === undefined) {
    return null;
  }

  if (transcript.length === 0) {
    return (
      <div className="py-4">
        <Card size="sm">
          <CardContent className="pt-0">
            <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileText className="size-8 text-muted-foreground/40" />
            <p className="type-empty-description">
              {t("detail.transcript.empty")}
            </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 pt-0">
          {transcript.map((segment) => {
            const isCaller =
              segment.speaker === "caller" || segment.speaker === "user";
            return (
              <div
                key={segment._id}
                className={cn("flex", isCaller ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[80%] px-4 py-2.5",
                    isCaller
                      ? "rounded-[16px_16px_16px_0] bg-muted"
                      : "rounded-[16px_16px_0_16px] bg-primary/10 dark:bg-primary/20",
                  )}
                >
                  <p
                    className={cn(
                      "type-meta mb-1",
                      isCaller
                        ? "text-muted-foreground"
                        : "text-primary/80 dark:text-primary/60",
                    )}
                  >
                    {isCaller
                      ? t("detail.transcript.caller")
                      : t("detail.transcript.assistant")}
                  </p>
                  <p className="type-body">{segment.text}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function RecordingTab({ call }: { call: CallRow }) {
  const { t } = useTranslation("calls");

  if (!call.recordingUrl) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Headphones className="size-8 text-muted-foreground/40" />
        <p className="type-empty-description">
          {call.recordingStorageId
            ? t("detail.recording.pending")
            : t("detail.recording.unavailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <Card size="sm">
        <CallRecordingPlayer
          className="px-4 py-0"
          downloadLabel={t("actions.download")}
          initialDurationSeconds={
            call.recordingDurationMs
              ? call.recordingDurationMs / 1000
              : (call.providerCallDurationSeconds ?? 0)
          }
          pauseLabel={t("actions.pause")}
          playLabel={t("actions.play")}
          src={call.recordingUrl}
        />
      </Card>
    </div>
  );
}

function DetailSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 px-4 py-4", className)}>
      <h3 className="font-heading text-base font-medium">{title}</h3>
      {children}
    </section>
  );
}

function DetailsTab({
  call,
  businessId,
  locale,
}: {
  call: CallRow;
  businessId: Id<"businesses">;
  locale: string;
}) {
  const { t } = useTranslation("calls");
  const completeFollowUp = useObservedMutation(
    api.voice.runtime.completeVoiceFollowUpTask,
  );
  const [isMarkingDone, setIsMarkingDone] = useState(false);

  async function handleMarkDone(inboxItemId: Id<"inbox_items">) {
    setIsMarkingDone(true);
    try {
      await completeFollowUp({ businessId, inboxItemId });
      captureAnalyticsEvent("web.voice.follow_up_completed", {
        businessId: String(businessId),
        inboxItemId: String(inboxItemId),
        callId: String(call._id),
      });
    } finally {
      setIsMarkingDone(false);
    }
  }

  const durationSeconds =
    call.recordingDurationMs !== undefined
      ? call.recordingDurationMs / 1000
      : call.providerCallDurationSeconds;

  return (
    <div className="py-4">
      <Surface className="flex flex-col">
        <DetailSection title={t("detail.details.followUpTitle")}>
          {call.followUpTask ? (
            <div className="flex flex-col gap-3">
              <p className="type-item-title">{call.followUpTask.title}</p>
              <p className="type-body-muted whitespace-pre-line">
                {call.followUpTask.body}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  disabled={isMarkingDone}
                  onClick={() => void handleMarkDone(call.followUpTask!.id)}
                  size="sm"
                  variant="outline"
                >
                  {isMarkingDone
                    ? t("detail.details.markingDone")
                    : t("detail.details.markDone")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="type-body-muted">
              {t("detail.details.noFollowUp")}
            </p>
          )}
        </DetailSection>

        <DetailSection
          className="border-t border-border"
          title={t("detail.details.callInfoTitle")}
        >
          <dl className="grid items-baseline grid-cols-[auto_1fr] gap-x-6 gap-y-3">
            <dt className="type-meta">
              {t("detail.details.twilioCallSid")}
            </dt>
            <dd className="type-technical-value truncate">
              {call.twilioCallSid}
            </dd>

            {call.gatewaySessionId && (
              <>
                <dt className="type-meta">
                  {t("detail.details.gatewaySession")}
                </dt>
                <dd className="type-technical-value truncate">
                  {call.gatewaySessionId}
                </dd>
              </>
            )}

            {durationSeconds !== undefined && (
              <>
                <dt className="type-meta">
                  {t("detail.metadata.duration")}
                </dt>
                <dd className="type-body">{formatDuration(durationSeconds)}</dd>
              </>
            )}
          </dl>
        </DetailSection>
      </Surface>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function CallDetailPage({ businessId }: CallDetailPageProps) {
  const { callId } = useParams<{ callId: string }>();
  const { i18n, t } = useTranslation("calls");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);

  const rememberedCall = useRememberedConvexQuery(
    api.voice.runtime.getCallForDashboard,
    businessId && callId
      ? { businessId, callId: callId as Id<"calls"> }
      : "skip",
  );
  const call = rememberedCall.data as CallRow | null | undefined;
  const isLoadingCall = rememberedCall.isInitialLoading;

  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  if (!businessId) {
    return null;
  }

  if (isLoadingCall) {
    return <DetailPageSkeleton />;
  }

  if (call === undefined) {
    return null;
  }

  if (call === null) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Link
          className="type-body-muted inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          to="/calls"
        >
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Phone className="size-8 text-muted-foreground/40" />
          <p className="type-empty-title">{t("detail.notFound")}</p>
          <p className="type-empty-description">
            {t("detail.notFoundDescription")}
          </p>
        </div>
      </div>
    );
  }

  const events = buildCallEvents(call);
  const callerName = call.contactName ? (
    call.contactName
  ) : call.contactPhone ? (
    <span className="flex items-baseline gap-2">
      {formatPhoneNumberDisplay(call.contactPhone, locale)}
      <span className="type-item-title text-muted-foreground">
        ({t("detail.unknownCaller")})
      </span>
    </span>
  ) : (
    t("detail.unknownCaller")
  );
  const callerPhone = call.contactPhone
    ? formatPhoneNumberDisplay(call.contactPhone, locale)
    : t("detail.noNumber");

  const durationSeconds =
    call.recordingDurationMs !== undefined
      ? call.recordingDurationMs / 1000
      : call.providerCallDurationSeconds;
  const isBlockedCall = isContactBlockedCall(call);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Back navigation */}
      <Link
        className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground"
        to="/calls"
      >
        <ArrowLeft className="size-4" />
        {t("detail.backToList")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="type-page-title">{callerName}</h1>
          {isBlockedCall ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">{t("detail.blocking.badge")}</Badge>
              <span className="type-body-muted">
                {t("detail.blocking.blockedAtInline", {
                  time: formatDateTime(call.endedAt ?? call.startedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Metadata row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetadataField
          copiedField={copiedField}
          fieldKey="from"
          label={t("detail.metadata.from")}
          onCopy={copyToClipboard}
          value={callerPhone}
        />
        <MetadataField
          fieldKey="duration"
          label={t("detail.metadata.duration")}
          value={formatDuration(durationSeconds)}
        />
        <MetadataField
          fieldKey="started"
          label={t("detail.metadata.started")}
          value={formatDateTime(call.startedAt, locale, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        />
        <MetadataField
          copiedField={copiedField}
          fieldKey="id"
          label={t("detail.metadata.id")}
          onCopy={copyToClipboard}
          rawValue={call._id}
          value={truncateId(call._id)}
        />
      </div>

      <Separator />

      {/* Call events timeline */}
      <SectionBlock title={t("detail.events.title")}>
        <Surface className="px-4">
          <CallEventTimeline events={events} locale={locale} />
        </Surface>
      </SectionBlock>

      {/* Tabbed content */}
      <Tabs defaultValue="transcript">
        <TabsList variant="pills">
          <TabsTrigger value="transcript">
            <FileText className="size-4" />
            {t("detail.tabs.transcript")}
          </TabsTrigger>
          <TabsTrigger value="recording">
            <Headphones className="size-4" />
            {t("detail.tabs.recording")}
          </TabsTrigger>
          <TabsTrigger value="details">
            <Info className="size-4" />
            {t("detail.tabs.details")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          {businessId && callId ? (
            <TranscriptTab
              businessId={businessId}
              callId={callId as Id<"calls">}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="recording">
          <RecordingTab call={call} />
        </TabsContent>

        <TabsContent value="details">
          {businessId ? (
            <DetailsTab
              businessId={businessId}
              call={call}
              locale={locale}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata field helper
// ---------------------------------------------------------------------------

function MetadataField({
  copiedField,
  fieldKey,
  label,
  onCopy,
  rawValue,
  value,
}: {
  copiedField?: string | null;
  fieldKey: string;
  label: string;
  onCopy?: (text: string, field: string) => void;
  rawValue?: string;
  value: string;
}) {
  const { t } = useTranslation("calls");
  const copyable = Boolean(onCopy);
  const isCopied = copiedField === fieldKey;

  return (
    <div className="flex flex-col gap-1">
      <span className="type-meta">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="type-body truncate">{value}</span>
        {copyable && (
          <button
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground",
              isCopied && "text-emerald-500 hover:text-emerald-500",
            )}
            aria-label={t("actions.copy")}
            onClick={() => onCopy?.(rawValue ?? value, fieldKey)}
            title={t("actions.copy")}
            type="button"
          >
            {isCopied ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
