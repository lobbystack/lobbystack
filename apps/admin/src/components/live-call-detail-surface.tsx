"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Download, MessageSquareText, PhoneCall, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { PageSurface } from "./page-surface";
import { selectActiveBusiness } from "@/lib/active-business";

type Business = { businessId: string; active: boolean };
type Detail = {
  call: { id: string; providerCallId: string; provider: string; transport: string; status: string; disposition: string | null; transferState: string | null; startedAt: string; endedAt: string | null; providerDurationSeconds: number | null; gatewaySessionId: string | null };
  contact: { id: string; name: string | null; phone: string; email: string | null; blockedAt: string | null } | null;
  outcome: string | null;
  timeline: Array<{ type: string; at: string; status: string }>;
  transcript: Array<{ id: string; sequence: number; speaker: string; text: string; confidence: number | null; final: boolean; createdAt: string }>;
  recording: { state: "available" | "pending" | "expired" | "missing"; objectId?: string; contentType?: string };
  appointments: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; serviceName: string; staffName: string }>;
  followUpTasks: Array<Record<string, unknown>>;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Unable to load call details.");
  return await response.json() as T;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LiveCallDetailSurface({ callId }: { callId: string }) {
  const { i18n, t } = useTranslation("calls");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => getJson<{ businesses: Business[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const detail = useQuery({
    queryKey: ["call", business?.businessId, callId],
    queryFn: () => getJson<Detail>(`/api/calls/${encodeURIComponent(callId)}?businessId=${encodeURIComponent(business!.businessId)}`),
    enabled: Boolean(business?.businessId),
  });

  async function openRecording() {
    if (!business || detail.data?.recording.state !== "available") return;
    setRecordingError(null);
    try {
      const response = await getJson<{ url: string }>(`/api/calls/${encodeURIComponent(callId)}/recording?businessId=${encodeURIComponent(business.businessId)}`);
      setRecordingUrl(response.url);
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : "Unable to open the recording.");
    }
  }

  if (businesses.isLoading || detail.isLoading) return <PageSurface title={t("detail.callLabel")} description=""><Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Loading call details...</CardContent></Card></PageSurface>;
  if (businesses.isError || detail.isError || !detail.data) return <PageSurface title={t("detail.notFound")} description=""><Card><CardContent className="space-y-3 py-16 text-center text-sm text-muted-foreground"><p>{t("detail.notFoundDescription")}</p><Button render={<Link href="/calls" />}>{t("detail.backToList")}</Button></CardContent></Card></PageSurface>;

  const { call, contact, recording } = detail.data;
  return <PageSurface title={`${t("detail.callLabel")} · ${contact?.name ?? t("detail.unknownCaller")}`} description="">
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" href="/calls"><ArrowLeft className="size-4" />{t("detail.backToList")}</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
           {contact ? <Link className="text-sm text-muted-foreground underline-offset-4 hover:underline" href={`/contacts/${encodeURIComponent(contact.id)}`}>{contact.name ?? contact.phone}</Link> : <p className="text-sm text-muted-foreground">{t("detail.noNumber")}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(call.startedAt, i18n.language)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button disabled={recording.state !== "available"} onClick={() => void openRecording()} variant="outline"><Download className="size-4" />{t("actions.download")}</Button>
          <span className="rounded-full bg-muted px-3 py-2 text-sm capitalize text-muted-foreground">{call.status}</span>
        </div>
      </div>
      {recordingError ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{recordingError}</p> : null}
      {recordingUrl ? <audio className="w-full" controls src={recordingUrl} /> : null}
      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>{t("detail.details.outcomeTitle")}</CardTitle></CardHeader><CardContent className="space-y-3"><Info icon={PhoneCall} label={t("detail.details.disposition")} value={detail.data.outcome ?? t("detail.details.noDisposition")} /><Info icon={PhoneCall} label={t("detail.metadata.duration")} value={formatDuration(call.providerDurationSeconds)} /><Info icon={UserRound} label={t("detail.metadata.from")} value={contact?.phone ?? t("detail.noNumber")} /></CardContent></Card>
          <Card><CardHeader><CardTitle>{t("detail.events.title")}</CardTitle></CardHeader><CardContent className="space-y-4">{detail.data.timeline.map((event) => <div className="flex items-center justify-between gap-4 text-sm" key={`${event.type}-${event.at}`}><span className="capitalize text-muted-foreground">{event.type}</span><span>{formatDate(event.at, i18n.language)}</span></div>)}</CardContent></Card>
           <Card><CardHeader><CardTitle>{t("detail.tabs.recording")}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p className="capitalize">{recording.state === "available" ? t("actions.listen") : recording.state === "pending" ? t("detail.recording.pending") : recording.state === "expired" ? "Recording expired" : t("detail.recording.unavailable")}</p>{recording.contentType ? <p>{recording.contentType}</p> : null}</CardContent></Card>
          {detail.data.appointments.length ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" />Appointments</CardTitle></CardHeader><CardContent className="space-y-4">{detail.data.appointments.map((appointment) => <div key={appointment.id}><p className="font-medium">{appointment.serviceName}</p><p className="text-sm text-muted-foreground">{appointment.staffName} · {formatDate(appointment.startsAt, i18n.language)} · {appointment.status}</p></div>)}</CardContent></Card> : null}
        </div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareText className="size-4" />{t("detail.tabs.transcript")}</CardTitle><CardDescription>{formatDate(call.startedAt, i18n.language)}</CardDescription></CardHeader><CardContent className="space-y-5">{detail.data.transcript.length ? detail.data.transcript.map((segment) => <div className="flex gap-3" key={segment.id}><span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{segment.speaker.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{segment.speaker}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{segment.text}</p></div></div>) : <p className="py-12 text-center text-sm text-muted-foreground">{t("detail.transcript.empty")}</p>}</CardContent></Card>
      </div>
    </div>
  </PageSurface>;
}

function Info({ icon: Icon, label, value }: { icon: typeof PhoneCall; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3"><Icon className="size-4 text-primary" /><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div></div>;
}
