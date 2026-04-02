import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDot,
  Copy,
  FileText,
  Headphones,
  Info,
  Loader2,
  Phone,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatDateTime, resolveLocale } from "@/lib/locale";
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

export function callReachedConnectedStep(call: CallRow): boolean {
  if (call.status === "in_progress") {
    return true;
  }

  if (call.status === "open") {
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

function statusBadgeVariant(
  status: "in_progress" | "completed" | "failed",
): "default" | "secondary" | "destructive" {
  switch (status) {
    case "in_progress":
      return "secondary";
    case "completed":
      return "default";
    case "failed":
      return "destructive";
  }
}

type CallEvent = {
  key: string;
  labelKey: string;
  timestamp: string | null;
  reached: boolean;
  isFinal: boolean;
  failed: boolean;
};

function buildCallEvents(call: CallRow): CallEvent[] {
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

function formatOutcomeLabel(
  outcome: CallRow["outcome"],
  locale: string,
  t: TFunction<"calls">,
): string {
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
      return outcome.disposition ?? t("outcome.none");
    default:
      return t("outcome.none");
  }
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
                  "text-xs font-medium whitespace-nowrap",
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
                <span className="text-xs text-muted-foreground">
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
                <span className="text-xs text-muted-foreground">&nbsp;</span>
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
  const transcript = useQuery(api.voice.runtime.getCallTranscript, {
    businessId,
    callId,
  }) as Array<Doc<"transcripts">> | undefined;

  if (transcript === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <FileText className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {t("detail.transcript.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
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
                "max-w-[80%] rounded-xl px-4 py-2.5",
                isCaller
                  ? "rounded-bl-sm bg-muted"
                  : "rounded-br-sm bg-primary/10 dark:bg-primary/20",
              )}
            >
              <p
                className={cn(
                  "mb-1 text-xs font-medium",
                  isCaller
                    ? "text-muted-foreground"
                    : "text-primary/80 dark:text-primary/60",
                )}
              >
                {isCaller
                  ? t("detail.transcript.caller")
                  : t("detail.transcript.assistant")}
              </p>
              <p className="text-sm leading-relaxed">{segment.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecordingTab({ call }: { call: CallRow }) {
  const { t } = useTranslation("calls");

  if (!call.recordingUrl) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Headphones className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {call.recordingStorageId
            ? t("detail.recording.pending")
            : t("detail.recording.unavailable")}
        </p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <CallRecordingPlayer
          className="px-4 py-3"
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
      </div>
    </div>
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
  const completeFollowUp = useMutation(
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
    <div className="flex flex-col gap-6 py-4">
      {/* Outcome */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.outcomeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">
            {formatOutcomeLabel(call.outcome, locale, t)}
          </p>
        </CardContent>
      </Card>

      {/* Follow-up task */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.followUpTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {call.followUpTask ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">{call.followUpTask.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
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
            <p className="text-sm text-muted-foreground">
              {t("detail.details.noFollowUp")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Raw call info */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("detail.details.callInfoTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">
              {t("detail.details.twilioCallSid")}
            </dt>
            <dd className="truncate font-mono text-xs">
              {call.twilioCallSid}
            </dd>

            {call.gatewaySessionId && (
              <>
                <dt className="text-muted-foreground">
                  {t("detail.details.gatewaySession")}
                </dt>
                <dd className="truncate font-mono text-xs">
                  {call.gatewaySessionId}
                </dd>
              </>
            )}

            <dt className="text-muted-foreground">
              {t("detail.details.disposition")}
            </dt>
            <dd>{call.disposition ?? t("detail.details.noDisposition")}</dd>

            {call.providerCallStatus && (
              <>
                <dt className="text-muted-foreground">
                  {t("detail.details.providerStatus")}
                </dt>
                <dd>{call.providerCallStatus}</dd>
              </>
            )}

            {durationSeconds !== undefined && (
              <>
                <dt className="text-muted-foreground">
                  {t("detail.metadata.duration")}
                </dt>
                <dd>{formatDuration(durationSeconds)}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
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

  const call = useQuery(
    api.voice.runtime.getCallForDashboard,
    businessId && callId
      ? { businessId, callId: callId as Id<"calls"> }
      : "skip",
  ) as CallRow | null | undefined;

  const [copiedField, setCopiedField] = useState<string | null>(null);

  function copyToClipboard(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }

  if (!businessId) {
    return <BusinessSetupCard />;
  }

  // Loading state
  if (call === undefined) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not found
  if (call === null) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          to="/calls"
        >
          <ArrowLeft className="size-4" />
          {t("detail.backToList")}
        </Link>
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Phone className="size-8 text-muted-foreground/40" />
          <p className="font-medium">{t("detail.notFound")}</p>
          <p className="text-sm text-muted-foreground">
            {t("detail.notFoundDescription")}
          </p>
        </div>
      </div>
    );
  }

  const status = resolveCallStatus(call);
  const events = buildCallEvents(call);
  const callerName = call.contactName ? (
    call.contactName
  ) : call.contactPhone ? (
    <span className="flex items-baseline gap-2">
      {formatPhoneNumberDisplay(call.contactPhone, locale)}
      <span className="text-base font-medium text-muted-foreground">
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Back navigation */}
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        to="/calls"
      >
        <ArrowLeft className="size-4" />
        {t("detail.backToList")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col justify-center">
          <h1 className="text-2xl font-bold tracking-tight">{callerName}</h1>
        </div>

        <Badge
          className="w-fit"
          variant={statusBadgeVariant(status)}
        >
          {status === "in_progress" && (
            <CircleDot className="size-3" />
          )}
          {t(`detail.status.${status}`)}
        </Badge>
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
      <div className="overflow-hidden rounded-lg border bg-card px-4">
        <CallEventTimeline events={events} locale={locale} />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="transcript">
        <TabsList variant="line">
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
  const copyable = Boolean(onCopy);
  const isCopied = copiedField === fieldKey;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm">{value}</span>
        {copyable && (
          <button
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground",
              isCopied && "text-emerald-500 hover:text-emerald-500",
            )}
            onClick={() => onCopy?.(rawValue ?? value, fieldKey)}
            title="Copy"
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
