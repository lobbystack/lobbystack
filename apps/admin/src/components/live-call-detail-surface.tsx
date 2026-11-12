"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  FileText,
  Headphones,
  Info,
  Phone,
  XCircle,
} from "lucide-react";
import { useUrlState } from "@/hooks/use-url-state";
import { useTranslation } from "react-i18next";

import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { BackLink, DetailSection, MetadataField, truncateId, useCopiedField } from "@/components/detail-fields";
import { canEditContacts, EditableContactName } from "@/components/editable-contact-name";
import { HiddenTextSkeleton, SectionSkeleton } from "@/components/loading-skeletons";
import { SectionBlock } from "@/components/section-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { CancelAppointmentButton } from "@/components/cancel-appointment-button";
import { MoveAppointmentButton } from "@/components/move-appointment-dialog";
import { RescheduleAppointmentButton } from "@/components/reschedule-appointment-button";
import { appointmentRequestKind, cancellationRequestDetails, isAppointmentRequest, parseFollowUpTaskBody, type RequestedCancellation } from "@/lib/follow-up-task";
import { formatDuration } from "@/lib/duration";
import { requestJson } from "@/lib/request-json";
import { getChannelLabel, getContactDisplayName, hasDisplayablePhone, normalizeChannel } from "@/lib/contact-display";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useTelemetry } from "@/components/product-analytics";
import { formatDateTime } from "@/lib/locale";
import { Status } from "@/components/ui/status";
import { CONTACT_STATUS_VARIANTS } from "@/lib/status-variants";

type Detail = {
  call: {
    id: string;
    legacyConvexId: string | null;
    providerCallId: string;
    provider: string;
    transport: string;
    status: string;
    disposition: string | null;
    transferState: string | null;
    startedAt: string;
    endedAt: string | null;
    providerDurationSeconds: number | null;
    gatewaySessionId: string | null;
  };
  contact: { id: string; name: string | null; phone: string | null; email: string | null; blockedAt: string | null } | null;
  outcome: string | null;
  timeline: Array<{ type: string; at: string | null; status: string }>;
  transcript: Array<{ id: string; sequence: number; speaker: string; text: string; confidence: number | null; final: boolean; createdAt: string }>;
  recording: { state: "available" | "pending" | "expired" | "missing"; objectId?: string; contentType?: string };
  appointments: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; serviceName: string; staffName: string }>;
  followUpTasks: Array<{ id: string; title: string; body: string; status: string; request?: string | null; requested?: RequestedCancellation | null; appointment?: { id: string; startsAt: string; timezone: string; status: string; serviceName: string | null; contactName: string | null } | null; createdAt: string; updatedAt: string }>;
};

const CALL_TABS = ["details", "transcript", "recording"] as const;
type CallTab = (typeof CALL_TABS)[number];

function tabFromUrl(): CallTab {
  if (typeof window === "undefined") return "details";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return CALL_TABS.find((candidate) => candidate === tab) ?? "details";
}

/** Keeps the query out for the default tab. */
function writeTab(tab: CallTab, url: URL): void {
  if (tab === "details") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
}

function formatDate(value: string, locale: string): string {
  return formatDateTime(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function CallEventTimeline({ events, locale }: { events: Detail["timeline"]; locale: string }) {
  const { t } = useTranslation("calls");
  return (
    // One equal column per event, so the timeline always fits its card: a narrow card wraps the labels and dates instead of cutting them off.
    <div className="grid py-4" data-slot="call-timeline" style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}>
      {events.map((event, index) => {
        const reached = event.status !== "pending";
        const failed = event.status === "failed";
        return (
          <div className="relative flex min-w-0 flex-col items-center gap-1.5 px-1 text-center" key={`${event.type}-${event.at}`}>
            {index < events.length - 1 ? <div aria-hidden="true" className="absolute top-4 left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] h-px bg-border" /> : null}
              <div className="flex size-8 items-center justify-center">
                {failed ? <XCircle className="size-5 text-destructive" /> : reached ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-muted-foreground/40" />}
              </div>
              <span className={cn("type-body", reached ? failed ? "text-destructive" : "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {t(`detail.events.${event.type}`)}
              </span>
              <span className="type-meta">
                {event.at ? <>{formatDateTime(event.at, locale, { month: "short", day: "numeric" })}{", "}{formatDateTime(event.at, locale, { hour: "numeric", minute: "2-digit" })}</> : <>&nbsp;</>}
              </span>
          </div>
        );
      })}
    </div>
  );
}

/** The Inbox with its phone calls, which the back link returns to. */
const CALLS_HREF = "/inbox?channel=phone_call";

/** One call. `embedded` puts it inside the Inbox, which has its own way back and its own page title. */
export function LiveCallDetailSurface({ callId, embedded = false }: { callId: string; embedded?: boolean }) {
  const { i18n, t } = useTranslation("calls");
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { copiedField, copy } = useCopiedField();
  const { setValue: setTab, value: tab } = useUrlState({ initial: "details", read: tabFromUrl, resetKey: callId, write: writeTab });
  const selectTab = (value: unknown) => setTab(CALL_TABS.find((candidate) => candidate === value) ?? "details");
  const { businesses, business } = useActiveBusiness();
  const detail = useQuery({
    queryKey: ["call", business?.businessId, callId],
    queryFn: () => requestJson<Detail>(`/api/calls/${encodeURIComponent(callId)}?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });
  const recording = useQuery({
    queryKey: ["call-recording", callId],
    queryFn: () => requestJson<{ url: string }>(`/api/calls/${encodeURIComponent(callId)}/recording`),
    enabled: detail.data?.recording.state === "available",
  });
  const completeFollowUp = useMutation({ mutationFn: (inboxItemId: string) => requestJson<{ completed: number }>(`/api/calls/${encodeURIComponent(callId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ action: "complete_follow_up", inboxItemId }) }), onSuccess: async (_, inboxItemId) => { if (business) telemetry.track("web.voice.follow_up_completed", { businessId: business.businessId, callId, inboxItemId }); await Promise.all([queryClient.invalidateQueries({ queryKey: ["call", business?.businessId, callId] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] }), queryClient.invalidateQueries({ queryKey: ["inbox", business?.businessId] })]); } });

  if (businesses.isLoading || detail.isLoading) return <DetailPageSkeleton embedded={embedded} t={t} />;
  if (businesses.isError || detail.isError || !detail.data) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        {embedded ? null : <BackLink href={CALLS_HREF} label={t("detail.backToList")} />}
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Phone className="size-8 text-muted-foreground/40" />
          <p className="type-empty-title">{t("detail.notFound")}</p>
          <p className="type-empty-description">{t("detail.notFoundDescription")}</p>
        </div>
      </div>
    );
  }

  const { call, contact } = detail.data;
  const callerName = getContactDisplayName({ name: contact?.name, phone: contact?.phone, email: contact?.email, channels: [call.transport] }, i18n.language, t);
  const hasPhone = hasDisplayablePhone(contact?.phone);
  const callerPhone = hasPhone ? formatPhoneNumberDisplay(contact?.phone, i18n.language) : normalizeChannel(call.transport) === "web_call" ? getChannelLabel(call.transport, t) : t("detail.noNumber");
  const blocked = Boolean(contact?.blockedAt) || call.disposition?.includes("blocked");
  const name = <EditableContactName businessId={business?.businessId} canEdit={canEditContacts(business?.role)} contactId={contact?.id} displayName={callerName} />;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {embedded ? null : <BackLink href={CALLS_HREF} label={t("detail.backToList")} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          {embedded ? <h2 className="type-page-title ph-mask">{name}</h2> : <h1 className="type-page-title ph-mask">{name}</h1>}
          {blocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <Status variant={CONTACT_STATUS_VARIANTS.blocked}>{t("detail.blocking.badge")}</Status>
              <span className="type-body-muted">{t("detail.blocking.blockedAtInline", { time: formatDate(contact?.blockedAt ?? call.endedAt ?? call.startedAt, i18n.language) })}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetadataField copied={copiedField === "from"} copyLabel={t("actions.copy")} label={t("detail.metadata.from")} maskValue {...(hasPhone ? { onCopy: () => copy(callerPhone, "from") } : {})} value={callerPhone} />
        <MetadataField label={t("detail.metadata.duration")} value={formatDuration(call.providerDurationSeconds)} />
        <MetadataField label={t("detail.metadata.started")} value={formatDate(call.startedAt, i18n.language)} />
        <MetadataField copied={copiedField === "id"} copyLabel={t("actions.copy")} label={t("detail.metadata.id")} onCopy={() => copy(call.legacyConvexId ?? call.id, "id")} value={truncateId(call.legacyConvexId ?? call.id)} />
      </div>

      <Separator />

      <SectionBlock title={t("detail.events.title")}>
        <Surface className="px-4"><CallEventTimeline events={detail.data.timeline} locale={i18n.language} /></Surface>
      </SectionBlock>

      <Tabs onValueChange={selectTab} value={tab}>
        <TabsList variant="pills">
          <TabsTrigger value="details"><Info className="size-4" />{t("detail.tabs.details")}</TabsTrigger>
          <TabsTrigger value="transcript"><FileText className="size-4" />{t("detail.tabs.transcript")}</TabsTrigger>
          <TabsTrigger value="recording"><Headphones className="size-4" />{t("detail.tabs.recording")}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <DetailsTab detail={detail.data} marking={completeFollowUp.isPending ? completeFollowUp.variables : undefined} onCompleteFollowUp={(inboxItemId) => completeFollowUp.mutate(inboxItemId)} />
        </TabsContent>
        <TabsContent value="transcript">
          <TranscriptTab detail={detail.data} />
        </TabsContent>
        <TabsContent value="recording">
          <RecordingTab detail={detail.data} src={recording.data?.url ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TranscriptTab({ detail }: { detail: Detail }) {
  const { t } = useTranslation("calls");
  return (
    <div className="py-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 pt-0">
          {detail.transcript.length ? detail.transcript.map((segment) => {
            const caller = segment.speaker === "caller" || segment.speaker === "user";
            return (
              <div className={cn("flex", caller ? "justify-start" : "justify-end")} key={segment.id}>
                <div className={cn("max-w-[80%] px-4 py-2.5", caller ? "rounded-[16px_16px_16px_0] bg-muted" : "rounded-[16px_16px_0_16px] bg-primary/10 dark:bg-primary/20")}>
                  <p className={cn("type-meta mb-1", caller ? "text-muted-foreground" : "text-primary/80 dark:text-primary/60")}>{caller ? t("detail.transcript.caller") : t("detail.transcript.assistant")}</p>
                  <p className="type-body ph-mask whitespace-pre-wrap">{segment.text}</p>
                </div>
              </div>
            );
          }) : <div className="flex flex-col items-center gap-2 py-16 text-center"><FileText className="size-8 text-muted-foreground/40" /><p className="type-empty-description">{t("detail.transcript.empty")}</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}

function RecordingTab({ detail, src }: { detail: Detail; src: string | null }) {
  const { t } = useTranslation("calls");
  if (!src) {
    return <div className="flex flex-col items-center gap-2 py-16 text-center"><Headphones className="size-8 text-muted-foreground/40" /><p className="type-empty-description">{detail.recording.state === "pending" ? t("detail.recording.pending") : t("detail.recording.unavailable")}</p></div>;
  }
    return <div className="py-4"><Card className="ph-no-capture" size="sm"><CallRecordingPlayer className="px-4 py-0" downloadLabel={t("actions.download")} initialDurationSeconds={detail.call.providerDurationSeconds ?? 0} pauseLabel={t("actions.pause")} playLabel={t("actions.play")} seekLabel={t("detail.recording.seek")} src={src} waveform /></Card></div>;
}

// The stored title and body are English text the agent tool wrote, so the labels are rebuilt here in the dashboard language.
const URGENCY_VALUES = ["low", "normal", "urgent"];
function FollowUpDetails({ followUp }: { followUp: Detail["followUpTasks"][number] }) {
  const { i18n, t } = useTranslation("calls");
  const details = parseFollowUpTaskBody(followUp.body);
  const caller = followUp.title.match(/^Voice message from (.+)$/i)?.[1]?.trim();
  const title = caller ? t("followUp.fromCaller", { name: caller.toLowerCase() === "unknown caller" ? t("followUp.unknownCaller") : caller }) : followUp.title;
  const urgency = details.urgency && URGENCY_VALUES.includes(details.urgency.toLowerCase()) ? t(`followUp.urgency.${details.urgency.toLowerCase()}`) : details.urgency;
  const callbackWindow = details.callbackWindow?.toLowerCase() === "not specified" ? t("followUp.notSpecified") : details.callbackWindow;
  if (isAppointmentRequest(followUp.request)) {
    const request = cancellationRequestDetails(followUp, i18n.language);
    const reschedule = appointmentRequestKind(followUp.request) === "reschedule";
    const name = caller && caller.toLowerCase() === "unknown caller" ? t("followUp.unknownCaller") : caller;
    return <>
      <p className="type-item-title">{name ? t(reschedule ? "followUp.rescheduleFromCaller" : "followUp.cancellationFromCaller", { name }) : t(reschedule ? "followUp.rescheduleRequest" : "followUp.cancellationRequest")}</p>
      {request.requested ? <p className="type-body-muted">{t("followUp.requested", { details: request.requested })}</p> : null}
      {reschedule && request.newTime ? <p className="type-body-muted">{t("followUp.newTime", { time: request.newTime })}</p> : null}
      {request.notes ? <p className="type-body-muted">{t("followUp.notes", { notes: request.notes })}</p> : null}
    </>;
  }
  const fields = [[t("followUp.fields.callback"), details.callbackPhone], [t("followUp.fields.urgency"), urgency], [t("followUp.fields.callbackWindow"), callbackWindow]].filter((field): field is [string, string] => Boolean(field[1]));
  return <>
    <p className="type-item-title">{title}</p>
    {fields.length ? <div className="flex flex-col gap-1">{fields.map(([label, value]) => <p className="type-body-muted" key={label}>{t("followUp.field", { label, value })}</p>)}</div> : null}
    {details.message ? <p className="type-body-muted">{details.message}</p> : null}
  </>;
}

/** Approves a caller's request to cancel or move the appointment it matched, or picks another time to move it to. Nothing shows for a request that matched none, or whose appointment is already cancelled. */
function ApproveFollowUpRequest({ followUp }: { followUp: Detail["followUpTasks"][number] }) {
  const { appointment } = followUp;
  if (!appointment || appointment.status === "canceled" || !isAppointmentRequest(followUp.request)) return null;
  const linked = { ...appointment, contactName: appointment.contactName ?? "" };
  if (appointmentRequestKind(followUp.request) === "reschedule") {
    const newStartsAt = followUp.requested?.newStartsAt;
    return <span className="flex gap-2">{newStartsAt ? <RescheduleAppointmentButton appointment={linked} newStartsAt={newStartsAt} /> : null}<MoveAppointmentButton appointment={linked} otherTime={Boolean(newStartsAt)} requested={newStartsAt} /></span>;
  }
  return <CancelAppointmentButton appointment={linked} approve variant="destructive" />;
}

function DetailsTab({ detail, marking, onCompleteFollowUp }: { detail: Detail; marking: string | undefined; onCompleteFollowUp: (inboxItemId: string) => void }) {
  const { t } = useTranslation("calls");
  // Grouped like Home: the call's messages are one follow-up, the newest
  // standing for imported duplicates, and each request is its own.
  const open = detail.followUpTasks.filter((item) => item.status === "open");
  const followUps = open.filter((item) => item.request || item === open.find((other) => !other.request));
  return (
    <div className="py-4">
      <Surface className="flex flex-col">
        <DetailSection title={t("detail.details.followUpTitle", { count: Math.max(1, followUps.length) })}>{followUps.length ? <div className="flex flex-col gap-6">{followUps.map((followUp) => <div className="flex flex-col gap-3" key={followUp.id}><FollowUpDetails followUp={followUp} /><div className="flex items-center gap-2 pt-1"><ApproveFollowUpRequest followUp={followUp} /><Button disabled={marking !== undefined} onClick={() => onCompleteFollowUp(followUp.id)} size="sm" variant="outline">{marking === followUp.id ? t("detail.details.markingDone") : t("detail.details.markDone")}</Button></div></div>)}</div> : <p className="type-body-muted">{t("detail.details.noFollowUp")}</p>}</DetailSection>
        <DetailSection className="border-t border-border" title={t("detail.details.callInfoTitle")}>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
            <dt className="type-meta">{t("detail.details.twilioCallSid")}</dt><dd className="type-technical-value truncate">{detail.call.providerCallId}</dd>
            {detail.call.gatewaySessionId ? <><dt className="type-meta">{t("detail.details.gatewaySession")}</dt><dd className="type-technical-value truncate">{detail.call.gatewaySessionId}</dd></> : null}
            {detail.call.providerDurationSeconds !== null ? <><dt className="type-meta">{t("detail.metadata.duration")}</dt><dd className="type-body">{formatDuration(detail.call.providerDurationSeconds)}</dd></> : null}
          </dl>
        </DetailSection>
      </Surface>
    </div>
  );
}

/**
 * The call page while it loads: the back link stays real, since it needs no data, and the rest takes the real
 * page's shape. Fixed text is a placeholder holding its real text, hidden, so each is as wide as the text.
 */
function DetailPageSkeleton({ embedded, t }: { embedded: boolean; t: (key: string) => string }) {
  const metadata = ["from", "duration", "started", "id"] as const;
  const events = ["received", "connected", "completed"] as const;
  const tabs = [["details", Info], ["transcript", FileText], ["recording", Headphones]] as const;
  return (
    <div aria-busy="true" className="flex flex-1 flex-col gap-6">
      {embedded ? null : <BackLink href={CALLS_HREF} label={t("detail.backToList")} />}

      <div className="flex h-[37.5px] items-center"><Skeleton className="h-8 w-64 max-w-full" /></div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metadata.map((field) => (
          <div className="flex flex-col gap-1" key={field}>
            <HiddenTextSkeleton className="type-meta">{t(`detail.metadata.${field}`)}</HiddenTextSkeleton>
            <div className="flex h-6 items-center"><Skeleton className="h-4 w-28 max-w-full" /></div>
          </div>
        ))}
      </div>

      <Separator />

      <SectionSkeleton title={t("detail.events.title")}>
        <Surface className="px-4">
          <div className="grid py-4" style={{ gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))` }}>
            {events.map((event, index) => (
              <div className="relative flex min-w-0 flex-col items-center gap-1.5 px-1 text-center" key={event}>
                {index < events.length - 1 ? <div aria-hidden="true" className="absolute top-4 left-[calc(50%+1.25rem)] right-[calc(-50%+1.25rem)] h-px bg-border" /> : null}
                <div className="flex size-8 items-center justify-center"><Skeleton className="size-5 rounded-full" /></div>
                <HiddenTextSkeleton className="type-body" skeletonClassName="w-fit max-w-full">{t(`detail.events.${event}`)}</HiddenTextSkeleton>
                <div className="flex h-4 max-w-full items-center"><Skeleton className="h-3 w-20 max-w-full" /></div>
              </div>
            ))}
          </div>
        </Surface>
      </SectionSkeleton>

      <div>
        <div className="scroll-row items-center gap-2">
          {tabs.map(([tab, Icon]) => (
            <Skeleton aria-hidden="true" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 type-title whitespace-nowrap" key={tab}>
              <Icon className="invisible size-4" />
              <span className="invisible">{t(`detail.tabs.${tab}`)}</span>
            </Skeleton>
          ))}
        </div>
        <div className="py-4">
          <Surface className="flex flex-col">
            <section className="flex flex-col gap-4 px-4 py-4">
              <HiddenTextSkeleton className="type-card-title">{t("detail.details.followUpTitle_one")}</HiddenTextSkeleton>
              <Skeleton className="h-4 w-2/3" />
            </section>
            <section className="flex flex-col gap-4 border-t border-border px-4 py-4">
              <HiddenTextSkeleton className="type-card-title">{t("detail.details.callInfoTitle")}</HiddenTextSkeleton>
              <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
                <HiddenTextSkeleton className="type-meta">{t("detail.details.twilioCallSid")}</HiddenTextSkeleton>
                <Skeleton className="h-4 w-48 max-w-full" />
              </div>
            </section>
          </Surface>
        </div>
      </div>
    </div>
  );
}
