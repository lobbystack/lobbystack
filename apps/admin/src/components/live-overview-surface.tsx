"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { MetricCardGridSkeleton } from "@/components/loading-skeletons";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { formatDateTime } from "@/lib/locale";

type DashboardSummary = {
  kpis: {
    calls: { total: number; deltaPercent: number };
    messages: { total: number; deltaPercent: number };
    appointments: { total: number; deltaPercent: number };
    averageDuration: { totalSeconds: number; deltaSeconds: number };
  };
  monthlyCalls: Array<{ monthStart: string; total: number }>;
  recentCalls: Array<{ id: string; startedAt: string; status: string; durationSeconds: number; contactName: string | null; contactPhone: string | null }>;
  actionRequired: Array<{ id: string; kind: string; title: string; body: string; createdAt: string; conversationId?: string }>;
  upcoming: Array<{ id: string; startsAt: string; timezone: string; status: string; sourceChannel: string; contactName: string | null; serviceName: string | null; staffName: string | null }>;
};

async function getSummary(): Promise<DashboardSummary> {
  const response = await fetch("/api/dashboard", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load dashboard data.");
  return await response.json() as DashboardSummary;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes === 0 ? `${remainder}s` : `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function initials(value: string | null): string {
  if (!value) return "AI";
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function LiveOverviewSurface() {
  const { i18n, t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["dashboard"], queryFn: getSummary });

  useEffect(() => {
    const source = new EventSource("/api/realtime");
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    for (const event of ["call.started", "call.updated", "call.completed", "message.upserted", "appointment.updated"]) source.addEventListener(event, refresh);
    return () => source.close();
  }, [queryClient]);

  const metrics = summary.data ? [
    { key: "calls", value: summary.data.kpis.calls.total.toLocaleString(i18n.language), description: formatDelta(summary.data.kpis.calls.deltaPercent, t) },
    { key: "messages", value: summary.data.kpis.messages.total.toLocaleString(i18n.language), description: formatDelta(summary.data.kpis.messages.deltaPercent, t) },
    { key: "appointments", value: summary.data.kpis.appointments.total.toLocaleString(i18n.language), description: formatDelta(summary.data.kpis.appointments.deltaPercent, t) },
    { key: "averageDuration", value: formatDuration(summary.data.kpis.averageDuration.totalSeconds), description: formatDurationDelta(summary.data.kpis.averageDuration.deltaSeconds, t) },
  ] as const : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("home.title")} />
      <div className="flex flex-col gap-6">
        {summary.isLoading ? <MetricCardGridSkeleton count={4} /> : (
          <Surface className="grid sm:grid-cols-2 md:grid-cols-4">
            {metrics.map((metric) => (
              <section className="border-b p-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 md:border-b-0 md:border-r md:last:border-r-0" key={metric.key}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <h2 className="type-card-title text-foreground">{t(`home.metrics.${metric.key}.title`)}</h2>
                    <p className="text-4xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p>
                  </div>
                  <p className="type-meta">{metric.description}</p>
                </div>
              </section>
            ))}
          </Surface>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <motion.section animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 10 }} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 px-1"><h2 className="type-section-title">{t("home.actionRequired.title")}</h2><Badge variant="outline">{summary.data?.actionRequired.length ?? 0}</Badge></div>
            {summary.data?.actionRequired.length ? <Card className="border-border/70"><CardContent><ItemGroup>{summary.data.actionRequired.map((item, index) => <div key={item.id}><Item className="px-1 py-1" size="sm"><ItemMedia className="size-9 rounded-full bg-muted/70" variant="icon"><UserRound className="size-4 text-muted-foreground" /></ItemMedia><ItemContent className="min-w-0"><ItemTitle>{item.title}</ItemTitle><ItemDescription className="line-clamp-2">{item.body}</ItemDescription><ItemFooter className="text-xs text-muted-foreground">{formatDateTime(item.createdAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</ItemFooter></ItemContent></Item>{index < summary.data.actionRequired.length - 1 ? <Separator className="mt-4" /> : null}</div>)}</ItemGroup></CardContent></Card> : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.actionRequired.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.actionRequired.emptyDescription")}</p></div>}
          </motion.section>
          <motion.section animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 12 }} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 px-1"><h2 className="type-section-title">{t("home.upcoming.title")}</h2><Badge variant="outline">{summary.data?.upcoming.length ?? 0}</Badge></div>
            {summary.data?.upcoming.length ? (
              <Card className="border-border/70"><CardContent className="flex flex-col gap-4">
                {summary.data.upcoming.map((appointment, index) => <div key={appointment.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="type-item-title">{appointment.contactName ?? t("home.upcoming.unknownContact")}</p><Badge variant="outline">{appointment.status}</Badge><Badge variant="secondary">{appointment.sourceChannel}</Badge></div><p className="type-body-muted mt-1">{appointment.serviceName ?? t("home.upcoming.unknownService")}</p></div>
                    <div className="shrink-0 text-left sm:text-right"><p className="type-item-title">{formatDateTime(appointment.startsAt, i18n.language, { weekday: "short", month: "short", day: "numeric", timeZone: appointment.timezone })}</p><p className="type-body-muted mt-1">{formatDateTime(appointment.startsAt, i18n.language, { hour: "numeric", minute: "2-digit", timeZone: appointment.timezone })}</p></div>
                  </div>
                  {index < summary.data.upcoming.length - 1 ? <Separator className="mt-4" /> : null}
                </div>)}
              </CardContent></Card>
            ) : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.upcoming.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.upcoming.emptyDescription")}</p></div>}
          </motion.section>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4"><CardHeader><CardTitle>{t("home.chart.title")}</CardTitle></CardHeader><CardContent className="ps-2"><ResponsiveContainer height={350} width="100%"><BarChart data={(summary.data?.monthlyCalls ?? []).map((item) => ({ name: formatDateTime(item.monthStart, i18n.language, { month: "short", timeZone: "UTC" }), total: item.total }))}><XAxis axisLine={false} dataKey="name" fontSize={12} stroke="#888888" tickLine={false} /><YAxis axisLine={false} direction="ltr" fontSize={12} stroke="#888888" tickLine={false} /><Bar className="fill-primary" dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
          <Card className="col-span-1 lg:col-span-3"><CardHeader><CardTitle>{t("home.recentCalls.title")}</CardTitle><CardDescription>{t("home.recentCalls.description", { count: summary.data?.recentCalls.length ?? 0 })}</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-6">{(summary.data?.recentCalls ?? []).map((call) => <div className="flex items-center gap-4" key={call.id}><Avatar className="h-9 w-9"><AvatarFallback>{initials(call.contactName)}</AvatarFallback></Avatar><div className="flex flex-1 flex-wrap items-center justify-between"><div className="flex flex-col gap-1"><p className="type-item-title leading-none">{call.contactName ?? t("home.recentCalls.unknownCaller")}</p><p className="type-body-muted">{call.contactPhone ?? formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="type-item-title">{call.durationSeconds ? t("home.recentCalls.durationValue", { value: call.durationSeconds }) : call.status}</div></div></div>)}</div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

function formatDelta(value: number, t: ReturnType<typeof useTranslation<"dashboard">>["t"]): string {
  if (value === 0) return t("delta.flat");
  return value > 0 ? t("delta.up", { value: Math.abs(value).toFixed(1) }) : t("delta.down", { value: Math.abs(value).toFixed(1) });
}

function formatDurationDelta(value: number, t: ReturnType<typeof useTranslation<"dashboard">>["t"]): string {
  if (value === 0) return t("delta.flat");
  return value > 0 ? t("delta.durationUp", { value: formatDuration(Math.abs(value)) }) : t("delta.durationDown", { value: formatDuration(Math.abs(value)) });
}
