"use client";

import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Check, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AnalyticsViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChartBlockSkeleton, MetricCardGridSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

const AnalyticsOverviewChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsOverviewChart), { ssr: false });
const AnalyticsMetricChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsMetricChart), { ssr: false });

type Granularity = AnalyticsViewModel["granularity"];
type Preset = "allTime" | "custom" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last30" | "last3Months" | "thisYear" | "lastYear";

const granularities: Granularity[] = ["year", "month", "week", "day", "hour"];
const presets: Array<Exclude<Preset, "custom">> = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "last30", "last3Months", "thisYear", "lastYear", "allTime"];
const granularityTranslation: Record<Granularity, string> = { hour: "hourly", day: "daily", week: "weekly", month: "monthly", year: "yearly" };

function startOfDay(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }

function presetRange(preset: Exclude<Preset, "custom">): { from: Date; to: Date } {
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
  if (preset === "allTime") return { from: new Date(2020, 0, 1), to: today };
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
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const range = useMemo(() => preset === "custom" && customRange ? customRange : presetRange(preset === "custom" ? "last30" : preset), [customRange, preset]);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const analytics = useQuery({
    queryKey: ["analytics", business?.businessId, preset, granularity, range.from.toISOString(), range.to.toISOString()],
    queryFn: () => {
      const parameters = new URLSearchParams({ businessId: business!.businessId, from: range.from.toISOString(), to: new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999).toISOString(), granularity });
      return requestJson<AnalyticsViewModel>(`/api/analytics?${parameters.toString()}`);
    },
    enabled: Boolean(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["analytics", business?.businessId], ["call.started", "call.completed", "message.upserted", "appointment.updated"]);
  }, [business?.businessId, queryClient]);

  const data = analytics.data;
  const chartData = (data?.series ?? []).map((point) => ({
    label: new Intl.DateTimeFormat(i18n.language, granularity === "year" ? { year: "numeric", timeZone: "UTC" } : granularity === "month" ? { month: "short", timeZone: "UTC" } : granularity === "hour" ? { hour: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(point.bucket)),
    calls: point.calls, messages: point.messages, appointments: point.appointments, agentResponseSeconds: point.agentResponseSeconds,
  }));
  const rangeLabel = `${new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short" }).format(range.from)} - ${new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short", year: "numeric" }).format(range.to)}`;
  const metrics = data ? [
    { key: "calls" as const, title: t("home.analytics.cards.calls"), value: data.calls.current.toLocaleString(i18n.language), description: percentDelta(data.calls.current, data.calls.previous, t) },
    { key: "messages" as const, title: t("home.analytics.cards.messages"), value: data.messages.current.toLocaleString(i18n.language), description: percentDelta(data.messages.current, data.messages.previous, t) },
    { key: "appointments" as const, title: t("home.analytics.cards.appointments"), value: data.appointments.current.toLocaleString(i18n.language), description: percentDelta(data.appointments.current, data.appointments.previous, t) },
    { key: "agentResponseSeconds" as const, title: t("home.analytics.cards.agentResponseTime"), value: duration(data.agentResponseSeconds.current), description: data.agentResponseSeconds.current === data.agentResponseSeconds.previous ? t("home.analytics.metrics.flat") : t(data.agentResponseSeconds.current > data.agentResponseSeconds.previous ? "home.analytics.metrics.durationUp" : "home.analytics.metrics.durationDown", { value: duration(Math.abs(data.agentResponseSeconds.current - data.agentResponseSeconds.previous)) }) },
  ] : [];
  const channelTotal = Math.max(1, (data?.channels.voice ?? 0) + (data?.channels.sms ?? 0) + (data?.channels.other ?? 0));

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-2"><h1 className="type-page-title">{t("analyticsPage.title")}</h1><div className="ms-auto flex flex-wrap items-center gap-3">
      <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.granularity")} variant="outline" />}><span>{t(`home.analytics.controls.granularities.${granularityTranslation[granularity]}`)}</span><ChevronDown className="text-muted-foreground" data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-44"><DropdownMenuGroup>{granularities.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setGranularity(option)}>{t(`home.analytics.controls.granularities.${granularityTranslation[option]}`)}{option === granularity ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      <ButtonGroup><Popover><PopoverTrigger render={<Button aria-label={t("home.analytics.controls.dateRange")} size="icon" variant="outline" />}><CalendarIcon /></PopoverTrigger><PopoverContent align="start" className="w-auto p-0" sideOffset={8}><Calendar captionLayout="label" mode="range" onSelect={(selection: DateRange | undefined) => { if (!selection?.from) return; setCustomRange({ from: selection.from, to: selection.to ?? selection.from }); setPreset("custom"); }} selected={{ from: range.from, to: range.to }} /></PopoverContent></Popover><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.presetRange")} className="max-w-56" variant="outline" />}><span className="truncate">{t(`home.analytics.controls.presets.${preset}`)}</span></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuGroup>{presets.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setPreset(option)}>{t(`home.analytics.controls.presets.${option}`)}{option === preset ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></ButtonGroup>
    </div></div>
    {businesses.isError || analytics.isError ? <Surface className="p-8 text-center text-sm text-destructive">Analytics are unavailable.</Surface> : null}
    {businesses.isLoading || analytics.isLoading ? <AnalyticsSkeleton /> : null}
    {data ? <><Card><CardHeader><CardTitle>{t("home.analytics.chart.title")}</CardTitle><CardDescription>{t("home.analytics.chart.description")}</CardDescription></CardHeader><CardContent className="px-6"><AnalyticsOverviewChart data={chartData} /></CardContent></Card>
      <Surface className="grid sm:grid-cols-2">{metrics.map((metric) => <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={metric.key}><div className="flex min-h-32 flex-col gap-6"><div className="flex flex-col gap-5"><h2 className="type-card-title text-foreground">{metric.title}</h2><div className="flex flex-col gap-3"><p className="text-5xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p><div className="flex items-center gap-2 text-base text-muted-foreground"><span className="size-3 rounded-full border-2 border-primary" /><span>{rangeLabel}</span></div></div></div><AnalyticsMetricChart data={chartData} dataKey={metric.key} /><p className="type-meta">{metric.description}</p></div></section>)}</Surface>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7"><Card className="lg:col-span-4"><CardHeader><CardTitle>{t("home.analytics.outcomes.title")}</CardTitle><CardDescription>{t("home.analytics.outcomes.description")}</CardDescription></CardHeader><CardContent><BarList items={data.outcomes.map((item) => ({ name: t(`home.analytics.outcomes.labels.${item.outcome}`), value: item.count }))} /></CardContent></Card><Card className="lg:col-span-3"><CardHeader><CardTitle>{t("home.analytics.channels.title")}</CardTitle><CardDescription>{t("home.analytics.channels.description")}</CardDescription></CardHeader><CardContent><BarList muted items={[{ name: t("home.analytics.channels.labels.voice"), value: Math.round((data.channels.voice / channelTotal) * 100) }, { name: t("home.analytics.channels.labels.sms"), value: Math.round((data.channels.sms / channelTotal) * 100) }, { name: t("home.analytics.channels.labels.other"), value: Math.round((data.channels.other / channelTotal) * 100) }]} suffix="%" /></CardContent></Card></div></> : null}
  </div>;
}

function AnalyticsSkeleton() {
  return (
<>
          <ChartBlockSkeleton />
          <MetricCardGridSkeleton />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <Surface className="p-6 lg:col-span-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="mt-6 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="flex items-center justify-between gap-3" key={index}>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-2.5 w-full rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </Surface>
            <Surface className="p-6 lg:col-span-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="mt-6 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div className="flex items-center justify-between gap-3" key={index}>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-2.5 w-full rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-10" />
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </>
  );
}

function BarList({ items, muted = false, suffix = "" }: { items: Array<{ name: string; value: number }>; muted?: boolean; suffix?: string }) { const maximum = Math.max(...items.map((item) => item.value), 1); return <ul className="flex flex-col gap-3">{items.map((item) => <li className="flex items-center justify-between gap-3" key={item.name}><div className="min-w-0 flex-1"><div className="type-meta mb-1 truncate capitalize">{item.name}</div><div className="h-2.5 w-full rounded-full bg-muted"><div className={`h-2.5 rounded-full ${muted ? "bg-muted-foreground" : "bg-primary"}`} style={{ width: `${Math.round((item.value / maximum) * 100)}%` }} /></div></div><div className="type-meta ps-2 tabular-nums text-foreground">{item.value.toLocaleString()}{suffix}</div></li>)}</ul>; }
