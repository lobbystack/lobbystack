"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AnalyticsViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

const AnalyticsOverviewChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsOverviewChart), { ssr: false });
const AnalyticsMetricChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsMetricChart), { ssr: false });

type Granularity = AnalyticsViewModel["granularity"];
type Preset = "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last30" | "last3Months" | "thisYear" | "lastYear";

const granularities: Granularity[] = ["year", "month", "week", "day", "hour"];
const presets: Preset[] = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "last30", "last3Months", "thisYear", "lastYear"];
const granularityTranslation: Record<Granularity, string> = { hour: "hourly", day: "daily", week: "weekly", month: "monthly", year: "yearly" };

function startOfDay(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }

function presetRange(preset: Preset): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") return { from: yesterday, to: yesterday };
  if (preset === "thisWeek") return { from: weekStart, to: today };
  if (preset === "thisMonth") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  if (preset === "lastMonth") return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0) };
  if (preset === "last3Months") return { from: new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()), to: today };
  if (preset === "thisYear") return { from: new Date(today.getFullYear(), 0, 1), to: today };
  if (preset === "lastYear") return { from: new Date(today.getFullYear() - 1, 0, 1), to: new Date(today.getFullYear() - 1, 11, 31) };
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), to: today };
}

function percentDelta(current: number, previous: number, t: (...args: any[]) => unknown): string {
  if (previous === 0) return String(current === 0 ? t("home.analytics.metrics.flat") : t("home.analytics.metrics.percentUp", { value: "100.0" }));
  const value = ((current - previous) / previous) * 100;
  return String(value >= 0 ? t("home.analytics.metrics.percentUp", { value: Math.abs(value).toFixed(1) }) : t("home.analytics.metrics.percentDown", { value: Math.abs(value).toFixed(1) }));
}

function duration(seconds: number): string { const minutes = Math.floor(seconds / 60); const remaining = Math.round(seconds % 60); return minutes === 0 ? `${remaining}s` : `${minutes}m ${String(remaining).padStart(2, "0")}s`; }

export function LiveAnalyticsSurface() {
  const { i18n, t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<Preset>("last30");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const range = useMemo(() => presetRange(preset), [preset]);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const analytics = useQuery({
    queryKey: ["analytics", business?.businessId, preset, granularity],
    queryFn: () => {
      const parameters = new URLSearchParams({ businessId: business!.businessId, from: range.from.toISOString(), to: new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999).toISOString(), granularity });
      return requestJson<AnalyticsViewModel>(`/api/analytics?${parameters.toString()}`);
    },
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(business.businessId)}`);
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["analytics", business.businessId] });
    for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.addEventListener(event, refresh);
    return () => { for (const event of ["call.started", "call.completed", "message.upserted", "appointment.updated"]) source.removeEventListener(event, refresh); source.close(); };
  }, [business?.businessId, queryClient]);

  const data = analytics.data;
  const chartData = (data?.series ?? []).map((point) => ({
    label: new Intl.DateTimeFormat(i18n.language, granularity === "year" ? { year: "numeric", timeZone: "UTC" } : granularity === "month" ? { month: "short", timeZone: "UTC" } : granularity === "hour" ? { hour: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(point.bucket)),
    calls: point.calls, messages: point.messages, appointments: point.appointments, agentResponseSeconds: data?.averageCallDurationSeconds ?? 0,
  }));
  const rangeLabel = `${new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short" }).format(range.from)} - ${new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short", year: "numeric" }).format(range.to)}`;
  const metrics = data ? [
    { key: "calls" as const, title: t("home.analytics.cards.calls"), value: data.calls.current.toLocaleString(i18n.language), description: percentDelta(data.calls.current, data.calls.previous, t) },
    { key: "messages" as const, title: t("home.analytics.cards.messages"), value: data.messages.current.toLocaleString(i18n.language), description: percentDelta(data.messages.current, data.messages.previous, t) },
    { key: "appointments" as const, title: t("home.analytics.cards.appointments"), value: data.appointments.current.toLocaleString(i18n.language), description: percentDelta(data.appointments.current, data.appointments.previous, t) },
    { key: "agentResponseSeconds" as const, title: t("home.analytics.cards.agentResponseTime"), value: duration(data.averageCallDurationSeconds), description: t("home.analytics.metrics.flat") },
  ] : [];
  const channelTotal = Math.max(1, (data?.calls.current ?? 0) + (data?.messages.current ?? 0) + (data?.appointments.current ?? 0));

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-2"><h1 className="type-page-title">{t("analyticsPage.title")}</h1><div className="ms-auto flex flex-wrap items-center gap-3">
      <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.granularity")} variant="outline" />}><span>{t(`home.analytics.controls.granularities.${granularityTranslation[granularity]}`)}</span><ChevronDown className="text-muted-foreground" data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-44"><DropdownMenuGroup>{granularities.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setGranularity(option)}>{t(`home.analytics.controls.granularities.${granularityTranslation[option]}`)}{option === granularity ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      <ButtonGroup><DropdownMenu><DropdownMenuTrigger render={<Button className="max-w-56" variant="outline" />}><span className="truncate">{t(`home.analytics.controls.presets.${preset}`)}</span></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuGroup>{presets.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setPreset(option)}>{t(`home.analytics.controls.presets.${option}`)}{option === preset ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></ButtonGroup>
    </div></div>
    {businesses.isError || analytics.isError ? <Surface className="p-8 text-center text-sm text-destructive">Analytics are unavailable.</Surface> : null}
    {businesses.isLoading || analytics.isLoading ? <AnalyticsSkeleton /> : null}
    {data ? <><Card><CardHeader><CardTitle>{t("home.analytics.chart.title")}</CardTitle><CardDescription>{t("home.analytics.chart.description")}</CardDescription></CardHeader><CardContent className="px-6"><AnalyticsOverviewChart data={chartData} /></CardContent></Card>
      <Surface className="grid sm:grid-cols-2">{metrics.map((metric) => <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={metric.key}><div className="flex min-h-32 flex-col gap-6"><div className="flex flex-col gap-5"><h2 className="type-card-title text-foreground">{metric.title}</h2><div className="flex flex-col gap-3"><p className="text-5xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p><div className="flex items-center gap-2 text-base text-muted-foreground"><span className="size-3 rounded-full border-2 border-primary" /><span>{rangeLabel}</span></div></div></div><AnalyticsMetricChart data={chartData} dataKey={metric.key} /><p className="type-meta">{metric.description}</p></div></section>)}</Surface>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7"><Card className="lg:col-span-4"><CardHeader><CardTitle>{t("home.analytics.outcomes.title")}</CardTitle><CardDescription>{t("home.analytics.outcomes.description")}</CardDescription></CardHeader><CardContent><BarList items={data.outcomes.map((item) => ({ name: item.outcome.replaceAll("_", " "), value: item.count }))} /></CardContent></Card><Card className="lg:col-span-3"><CardHeader><CardTitle>{t("home.analytics.channels.title")}</CardTitle><CardDescription>{t("home.analytics.channels.description")}</CardDescription></CardHeader><CardContent><BarList muted items={[{ name: t("home.analytics.channels.labels.voice"), value: Math.round((data.calls.current / channelTotal) * 100) }, { name: t("home.analytics.channels.labels.sms"), value: Math.round((data.messages.current / channelTotal) * 100) }, { name: t("home.analytics.channels.labels.other"), value: Math.round((data.appointments.current / channelTotal) * 100) }]} suffix="%" /></CardContent></Card></div></> : null}
  </div>;
}

function AnalyticsSkeleton() { return <><Card><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card><Surface className="grid sm:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <div className="space-y-6 border-b p-6 sm:odd:border-r" key={index}><Skeleton className="h-5 w-32" /><Skeleton className="h-12 w-24" /><Skeleton className="h-40 w-full" /></div>)}</Surface></>; }

function BarList({ items, muted = false, suffix = "" }: { items: Array<{ name: string; value: number }>; muted?: boolean; suffix?: string }) { const maximum = Math.max(...items.map((item) => item.value), 1); return <ul className="flex flex-col gap-3">{items.map((item) => <li className="flex items-center justify-between gap-3" key={item.name}><div className="min-w-0 flex-1"><div className="type-meta mb-1 truncate capitalize">{item.name}</div><div className="h-2.5 w-full rounded-full bg-muted"><div className={`h-2.5 rounded-full ${muted ? "bg-muted-foreground" : "bg-primary"}`} style={{ width: `${Math.round((item.value / maximum) * 100)}%` }} /></div></div><div className="type-meta ps-2 tabular-nums text-foreground">{item.value.toLocaleString()}{suffix}</div></li>)}</ul>; }
