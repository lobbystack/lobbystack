"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Copy,
  FileText,
  Headphones,
  Info,
  Phone,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CallRecordingPlayer } from "@/components/audio/call-recording-player";
import { SectionBlock } from "@/components/section-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { selectActiveBusiness } from "@/lib/active-business";

type Business = { businessId: string; active: boolean };
type Detail = {
  call: {
    id: string;
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
  timeline: Array<{ type: string; at: string; status: string }>;
  transcript: Array<{ id: string; sequence: number; speaker: string; text: string; confidence: number | null; final: boolean; createdAt: string }>;
  recording: { state: "available" | "pending" | "expired" | "missing"; objectId?: string; contentType?: string };
  appointments: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; serviceName: string; staffName: string }>;
  followUpTasks: Array<Record<string, unknown>>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to load call details.");
  }
  return await response.json() as T;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function truncateId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-5)}` : value;
}

export function LiveCallDetailSurface({ callId }: { callId: string }) {
  const { i18n, t } = useTranslation("calls");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const businesses = useQuery({
    queryKey: ["businesses"],
    queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses"),
  });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const detail = useQuery({
    queryKey: ["call", business?.businessId, callId],
    queryFn: () => getJson<Detail>(`/api/calls/${encodeURIComponent(callId)}?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });
  const recording = useQuery({
    queryKey: ["call-recording", callId],
    queryFn: () => getJson<{ url: string }>(`/api/calls/${encodeURIComponent(callId)}/recording`),
    enabled: detail.data?.recording.state === "available",
  });

  function copyToClipboard(text: string, field: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1_500);
    });
  }

  if (businesses.isLoading || detail.isLoading) return <DetailPageSkeleton />;
  if (businesses.isError || detail.isError || !detail.data) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <BackLink label={t("detail.backToList")} />
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Phone className="size-8 text-muted-foreground/40" />
          <p className="type-empty-title">{t("detail.notFound")}</p>
          <p className="type-empty-description">{t("detail.notFoundDescription")}</p>
        </div>
      </div>
    );
  }

  const { call, contact } = detail.data;
  const callerName = contact?.name ?? contact?.phone ?? t("detail.unknownCaller");
  const callerPhone = contact?.phone ?? t("detail.noNumber");
  const blocked = Boolean(contact?.blockedAt) || call.disposition?.includes("blocked");

  return (
    <div className="flex flex-1 flex-col gap-6">
      <BackLink label={t("detail.backToList")} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="type-page-title">{callerName}</h1>
          {blocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">{t("detail.blocking.badge")}</Badge>
              <span className="type-body-muted">{t("detail.blocking.blockedAtInline", { time: formatDate(contact?.blockedAt ?? call.endedAt ?? call.startedAt, i18n.language) })}</span>
            </div>
          ) : null}
        </div>
        <Badge variant="outline">{call.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetadataField copiedField={copiedField} fieldKey="from" label={t("detail.metadata.from")} onCopy={copyToClipboard} value={callerPhone} />
        <MetadataField fieldKey="duration" label={t("detail.metadata.duration")} value={formatDuration(call.providerDurationSeconds)} />
        <MetadataField fieldKey="started" label={t("detail.metadata.started")} value={formatDate(call.startedAt, i18n.language)} />
        <MetadataField copiedField={copiedField} fieldKey="id" label={t("detail.metadata.id")} onCopy={copyToClipboard} rawValue={call.id} value={truncateId(call.id)} />
      </div>

      <Separator />

      <SectionBlock title={t("detail.events.title")}>
        <Surface className="px-4">
          <div className="flex min-w-max items-start py-5">
            {detail.data.timeline.map((event, index) => (
              <div className="flex flex-1 items-start" key={`${event.type}-${event.at}`}>
                <div className="flex min-w-28 flex-col items-center text-center">
                  <span className="grid size-8 place-items-center rounded-full border bg-background">
                    {index === detail.data.timeline.length - 1 ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-3 fill-primary text-primary" />}
                  </span>
                  <span className="type-item-title mt-2 capitalize">{event.type}</span>
                  <span className="type-meta mt-1">{formatDate(event.at, i18n.language)}</span>
                </div>
                {index < detail.data.timeline.length - 1 ? <div className="mt-4 h-px min-w-10 flex-1 bg-border" /> : null}
              </div>
            ))}
          </div>
        </Surface>
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
          <DetailsTab detail={detail.data} locale={i18n.language} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return <Link className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground" href="/calls"><ArrowLeft className="size-4" />{label}</Link>;
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
                  <p className="type-body whitespace-pre-wrap">{segment.text}</p>
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
  return <div className="py-4"><Card size="sm"><CallRecordingPlayer className="px-4 py-0" downloadLabel={t("actions.download")} initialDurationSeconds={detail.call.providerDurationSeconds ?? 0} pauseLabel={t("actions.pause")} playLabel={t("actions.play")} src={src} /></Card></div>;
}

function DetailsTab({ detail, locale }: { detail: Detail; locale: string }) {
  const { t } = useTranslation("calls");
  return (
    <div className="py-4">
      <Surface className="flex flex-col">
        <DetailSection title={t("detail.details.outcomeTitle")}><p className="type-body-muted">{detail.outcome ?? t("detail.details.noDisposition")}</p></DetailSection>
        <DetailSection className="border-t border-border" title={t("detail.details.followUpTitle")}><p className="type-body-muted">{detail.followUpTasks.length ? String(detail.followUpTasks[0]?.title ?? t("detail.details.followUpTitle")) : t("detail.details.noFollowUp")}</p></DetailSection>
        <DetailSection className="border-t border-border" title={t("detail.details.callInfoTitle")}>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
            <dt className="type-meta">{t("detail.details.twilioCallSid")}</dt><dd className="type-technical-value truncate">{detail.call.providerCallId}</dd>
            {detail.call.gatewaySessionId ? <><dt className="type-meta">{t("detail.details.gatewaySession")}</dt><dd className="type-technical-value truncate">{detail.call.gatewaySessionId}</dd></> : null}
            <dt className="type-meta">{t("detail.metadata.started")}</dt><dd className="type-body">{formatDate(detail.call.startedAt, locale)}</dd>
          </dl>
        </DetailSection>
      </Surface>
    </div>
  );
}

function DetailSection({ children, className, title }: { children: React.ReactNode; className?: string; title: string }) {
  return <section className={cn("flex flex-col gap-4 px-4 py-4", className)}><h3 className="font-heading text-base font-medium">{title}</h3>{children}</section>;
}

function MetadataField({ copiedField, fieldKey, label, onCopy, rawValue, value }: { copiedField?: string | null; fieldKey: string; label: string; onCopy?: (text: string, field: string) => void; rawValue?: string; value: string }) {
  const { t } = useTranslation("calls");
  const copied = copiedField === fieldKey;
  return (
    <div className="flex flex-col gap-1">
      <span className="type-meta">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="type-body truncate">{value}</span>
        {onCopy ? <button aria-label={t("actions.copy")} className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground", copied && "text-emerald-500")} onClick={() => onCopy(rawValue ?? value, fieldKey)} type="button">{copied ? <CheckCircle2 className="size-3" /> : <Copy className="size-3" />}</button> : null}
      </div>
    </div>
  );
}

function DetailPageSkeleton() {
  return <div className="flex flex-1 flex-col gap-6"><Skeleton className="h-5 w-24" /><Skeleton className="h-9 w-64" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
}
