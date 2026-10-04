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
import { useTranslation } from "react-i18next";

import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { BackLink, DetailSection, MetadataField, truncateId, useCopiedField } from "@/components/detail-fields";
import { SectionBlock } from "@/components/section-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatDuration } from "@/lib/duration";
import { requestJson } from "@/lib/request-json";
import { getChannelLabel, getContactDisplayName, hasDisplayablePhone, normalizeChannel } from "@/lib/contact-display";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useTelemetry } from "@/components/product-analytics";
import { formatDateTime } from "@/lib/locale";

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
  followUpTasks: Array<{ id: string; title: string; body: string; status: string; createdAt: string; updatedAt: string }>;
};

function formatDate(value: string, locale: string): string {
  return formatDateTime(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

function CallEventTimeline({ events, locale }: { events: Detail["timeline"]; locale: string }) {
  const { t } = useTranslation("calls");
  return (
    <div className="flex items-start gap-0 overflow-x-auto px-2 py-4">
      {events.map((event, index) => {
        const reached = event.status !== "pending";
        const failed = event.status === "failed";
        return (
          <div className="flex items-start" key={`${event.type}-${event.at}`}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex size-8 items-center justify-center">
                {failed ? <XCircle className="size-5 text-destructive" /> : reached ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-muted-foreground/40" />}
              </div>
              <span className={cn("type-body whitespace-nowrap", reached ? failed ? "text-destructive" : "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {t(`detail.events.${event.type}`)}
              </span>
              <span className="type-meta">
                {event.at ? <>{formatDateTime(event.at, locale, { month: "short", day: "numeric" })}{", "}{formatDateTime(event.at, locale, { hour: "numeric", minute: "2-digit" })}</> : <>&nbsp;</>}
              </span>
            </div>
            {index < events.length - 1 ? <div className="mt-3.5 h-px w-12 self-start bg-border sm:w-20" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function LiveCallDetailSurface({ callId }: { callId: string }) {
  const { i18n, t } = useTranslation("calls");
  const telemetry = useTelemetry();
  const queryClient = useQueryClient();
  const { copiedField, copy } = useCopiedField();
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
  const completeFollowUp = useMutation({ mutationFn: (_inboxItemId: string) => requestJson<{ completed: number }>(`/api/calls/${encodeURIComponent(callId)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ action: "complete_follow_up" }) }), onSuccess: async (_, inboxItemId) => { if (business) telemetry.track("web.voice.follow_up_completed", { businessId: business.businessId, callId, inboxItemId }); await Promise.all([queryClient.invalidateQueries({ queryKey: ["call", business?.businessId, callId] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]); } });

  if (businesses.isLoading || detail.isLoading) return <DetailPageSkeleton />;
  if (businesses.isError || detail.isError || !detail.data) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <BackLink href="/calls" label={t("detail.backToList")} />
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BackLink href="/calls" label={t("detail.backToList")} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="type-page-title ph-mask">{callerName}</h1>
          {blocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">{t("detail.blocking.badge")}</Badge>
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

      <Tabs defaultValue="transcript">
        <TabsList variant="pills">
          <TabsTrigger value="transcript"><FileText className="size-4" />{t("detail.tabs.transcript")}</TabsTrigger>
          <TabsTrigger value="recording"><Headphones className="size-4" />{t("detail.tabs.recording")}</TabsTrigger>
          <TabsTrigger value="details"><Info className="size-4" />{t("detail.tabs.details")}</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript">
          <TranscriptTab detail={detail.data} />
        </TabsContent>
        <TabsContent value="recording">
          <RecordingTab detail={detail.data} src={recording.data?.url ?? null} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab detail={detail.data} markingDone={completeFollowUp.isPending} onCompleteFollowUp={(inboxItemId) => completeFollowUp.mutate(inboxItemId)} />
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
    return <div className="py-4"><Card className="ph-no-capture" size="sm"><CallRecordingPlayer className="px-4 py-0" downloadLabel={t("actions.download")} initialDurationSeconds={detail.call.providerDurationSeconds ?? 0} pauseLabel={t("actions.pause")} playLabel={t("actions.play")} src={src} /></Card></div>;
}

function DetailsTab({ detail, markingDone, onCompleteFollowUp }: { detail: Detail; markingDone: boolean; onCompleteFollowUp: (inboxItemId: string) => void }) {
  const { t } = useTranslation("calls");
  const openFollowUp = detail.followUpTasks.find((item) => item.status === "open");
  return (
    <div className="py-4">
      <Surface className="flex flex-col">
        <DetailSection title={t("detail.details.followUpTitle")}>{openFollowUp ? <div className="flex flex-col gap-3"><p className="type-item-title">{openFollowUp.title}</p><p className="type-body-muted whitespace-pre-line">{openFollowUp.body}</p><div className="flex items-center gap-2 pt-1"><Button disabled={markingDone} onClick={() => onCompleteFollowUp(openFollowUp.id)} size="sm" variant="outline">{markingDone ? t("detail.details.markingDone") : t("detail.details.markDone")}</Button></div></div> : <p className="type-body-muted">{t("detail.details.noFollowUp")}</p>}</DetailSection>
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

function DetailPageSkeleton() {
  return <div className="flex flex-1 flex-col gap-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-64" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
}
