"use client";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { formatBookedValue, formatTimeSaved } from "@/lib/analytics-results";
import { formatDuration } from "@/lib/duration";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Check, ChevronDown, CircleCheck, Ellipsis, PhoneCall, PhoneForwarded, PhoneMissed, type LucideIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keepPreviousForBusiness } from "@/lib/keep-previous-for-business";
import { useTranslation } from "react-i18next";

import type { AnalyticsViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { ANALYTICS_CHANNELS, channelPercentages } from "@/lib/analytics-channels";
import { getChannelLabel } from "@/lib/contact-display";
import { CONTACT_CHANNEL_ICONS } from "@/components/contact-channel-icons";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AnalyticsControlsSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { intlLocale } from "@/lib/locale";
import type { AnalyticsChartPoint } from "./analytics-charts";

const AnalyticsOverviewChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsOverviewChart), { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> });
const AnalyticsMetricChart = dynamic(() => import("./analytics-charts").then((module) => module.AnalyticsMetricChart), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });

type Granularity = AnalyticsViewModel["granularity"];
type Preset = "allTime" | "custom" | "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last30" | "last3Months" | "thisYear" | "lastYear";

const granularities: Granularity[] = ["year", "month", "week", "day", "hour"];
const presets: Array<Exclude<Preset, "custom">> = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "last30", "last3Months", "thisYear", "lastYear", "allTime"];
// Outcomes the API can report; anything else shows without an icon.
const OUTCOME_ICONS: Record<string, LucideIcon> = { completed: CircleCheck, transferred: PhoneForwarded, live: PhoneCall, missed: PhoneMissed };
const granularityTranslation: Record<Granularity, string> = { hour: "hourly", day: "daily", week: "weekly", month: "monthly", year: "yearly" };

function startOfDay(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }

function presetRange(preset: Exclude<Preset, "custom">, businessCreatedAt?: string): { from: Date; to: Date } {
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
  if (preset === "allTime") {
    // The API serves at most ten years, so very old businesses start there.
    const tenYearsAgo = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate() + 1);
    const created = businessCreatedAt ? startOfDay(new Date(businessCreatedAt)) : new Date(2020, 0, 1);
    return { from: created > tenYearsAgo ? created : tenYearsAgo, to: today };
  }
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), to: today };
}

function percentDelta(current: number, previous: number, t: (...args: any[]) => unknown): string {
  if (previous === 0) return String(current === 0 ? t("home.analytics.metrics.flat") : t("home.analytics.metrics.percentUp", { value: "100.0" }));
  const value = ((current - previous) / previous) * 100;
  return String(value >= 0 ? t("home.analytics.metrics.percentUp", { value: Math.abs(value).toFixed(1) }) : t("home.analytics.metrics.percentDown", { value: Math.abs(value).toFixed(1) }));
}


export function LiveAnalyticsSurface() {
  const { i18n, t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const [preset, setPreset] = useState<Preset>("last30");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const { businesses, business } = useActiveBusiness();
  const range = useMemo(() => preset === "custom" && customRange ? customRange : presetRange(preset === "custom" ? "last30" : preset, business?.createdAt), [business?.createdAt, customRange, preset]);
  // The API caps hourly views at 20 days, daily at a year and weekly at 3493 days, so longer ranges fall back to a coarser view.
  // The request adds the last picked day to this span, and the extra half day absorbs a DST hour.
  const spanDays = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  const longRange = spanDays > 365;
  const tooLongFor = (option: Granularity) => (option === "hour" && spanDays > 19.5) || (longRange && option === "day") || (spanDays > 3492 && option === "week");
  const effectiveGranularity: Granularity = !tooLongFor(granularity) ? granularity : granularity === "hour" && !longRange ? "day" : "month";
  const analytics = useQuery({
    queryKey: ["analytics", business?.businessId, preset, effectiveGranularity, range.from.toISOString(), range.to.toISOString()],
    queryFn: () => {
      // The API buckets and labels in UTC, so send the picked calendar days as UTC days.
      const from = new Date(Date.UTC(range.from.getFullYear(), range.from.getMonth(), range.from.getDate()));
      const to = new Date(Date.UTC(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999));
      const parameters = new URLSearchParams({ businessId: business!.businessId, from: from.toISOString(), to: to.toISOString(), granularity: effectiveGranularity });
      return requestJson<AnalyticsViewModel>(`/api/analytics?${parameters.toString()}`);
    },
    enabled: Boolean(business?.businessId),
    // Keep the previous range on screen, dimmed, while a new range or granularity loads.
    placeholderData: keepPreviousForBusiness<AnalyticsViewModel>(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["analytics", business?.businessId], ["call.started", "call.completed", "message.upserted", "appointment.updated"]);
  }, [business?.businessId, queryClient]);

  const data = analytics.data;
  const loading = businesses.isLoading || analytics.isLoading;
  const pointFormat = new Intl.DateTimeFormat(intlLocale(i18n.language), effectiveGranularity === "year" ? { year: "numeric", timeZone: "UTC" } : effectiveGranularity === "month" ? { month: "short", ...(longRange ? { year: "2-digit" as const } : {}), timeZone: "UTC" } : effectiveGranularity === "hour" ? { hour: "numeric", timeZone: "UTC" } : { day: "2-digit", month: "short", ...(longRange ? { year: "2-digit" as const } : {}), timeZone: "UTC" });
  const series = data?.series ?? [];
  const chartData: AnalyticsChartPoint[] = series.map((point) => ({
    label: pointFormat.format(new Date(point.bucket)),
    calls: point.calls, messages: point.messages, appointments: point.appointments, agentResponseSeconds: point.agentResponseSeconds,
  }));
  const rangeLabel = `${new Intl.DateTimeFormat(intlLocale(i18n.language), { day: "2-digit", month: "short" }).format(range.from)} - ${new Intl.DateTimeFormat(intlLocale(i18n.language), { day: "2-digit", month: "short", year: "numeric" }).format(range.to)}`;
  const metrics = data ? [
    { key: "calls" as const, title: t("home.analytics.cards.calls"), value: data.calls.current.toLocaleString(intlLocale(i18n.language)), description: percentDelta(data.calls.current, data.calls.previous, t) },
    { key: "messages" as const, title: t("home.analytics.cards.messages"), value: data.messages.current.toLocaleString(intlLocale(i18n.language)), description: percentDelta(data.messages.current, data.messages.previous, t) },
    { key: "appointments" as const, title: t("home.analytics.cards.appointments"), value: data.appointments.current.toLocaleString(intlLocale(i18n.language)), description: percentDelta(data.appointments.current, data.appointments.previous, t) },
    { key: "agentResponseSeconds" as const, title: t("home.analytics.cards.agentResponseTime"), value: formatDuration(data.agentResponseSeconds.current), description: data.agentResponseSeconds.current === data.agentResponseSeconds.previous ? t("home.analytics.metrics.flat") : t(data.agentResponseSeconds.current > data.agentResponseSeconds.previous ? "home.analytics.metrics.durationUp" : "home.analytics.metrics.durationDown", { value: formatDuration(Math.abs(data.agentResponseSeconds.current - data.agentResponseSeconds.previous)) }) },
  ] : [];
  const withoutTransfer = data?.callsWithoutTransferPercent;
  const percentFormat = new Intl.NumberFormat(intlLocale(i18n.language), { style: "percent", maximumFractionDigits: 1 });
  const pointsFormat = new Intl.NumberFormat(intlLocale(i18n.language), { maximumFractionDigits: 1 });
  const results = data ? [
    { key: "bookedValue", value: formatBookedValue(data.bookedValue.current, data.bookedValue.currency, i18n.language), description: percentDelta(data.bookedValue.current, data.bookedValue.previous, t) },
    { key: "timeSaved", value: formatTimeSaved(data.timeSavedSeconds.current, i18n.language), description: percentDelta(data.timeSavedSeconds.current, data.timeSavedSeconds.previous, t) },
    {
      key: "withoutTransfer",
      value: withoutTransfer?.current == null ? "—" : percentFormat.format(withoutTransfer.current / 100),
      // A share moves in percentage points, and there's nothing to compare while either period has no calls.
      description: withoutTransfer?.current == null ? null
        : withoutTransfer.previous == null ? t("home.analytics.metrics.noPreviousCalls")
        : withoutTransfer.current === withoutTransfer.previous ? t("home.analytics.metrics.flat")
          : t(withoutTransfer.current > withoutTransfer.previous ? "home.analytics.metrics.pointsUp" : "home.analytics.metrics.pointsDown", { value: pointsFormat.format(Math.abs(withoutTransfer.current - withoutTransfer.previous)) }),
    },
  ] as const : [];
  const channelShares = channelPercentages(data?.channels);
  // Other only holds channels the dashboard can't label, so it stays hidden while empty.
  const channelItems = ANALYTICS_CHANNELS.filter((channel) => channel !== "other" || (data?.channels.other ?? 0) > 0).map((channel) => ({
    name: channel === "other" ? t("home.analytics.channels.labels.other") : getChannelLabel(channel, t),
    icon: channel === "other" ? Ellipsis : CONTACT_CHANNEL_ICONS[channel],
    value: channelShares[channel],
  }));

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-2"><h1 className="type-page-title">{t("analyticsPage.title")}</h1><div className="ms-auto flex flex-wrap items-center gap-3">
      {loading ? <AnalyticsControlsSkeleton granularityLabel={t(`home.analytics.controls.granularities.${granularityTranslation[effectiveGranularity]}`)} rangeLabel={t(`home.analytics.controls.presets.${preset}`)} /> : <>
      <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.granularity")} variant="outline" />}><span>{t(`home.analytics.controls.granularities.${granularityTranslation[effectiveGranularity]}`)}</span><ChevronDown className="text-muted-foreground" data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-44"><DropdownMenuGroup>{granularities.map((option) => <DropdownMenuItem className="justify-between" disabled={tooLongFor(option)} key={option} onClick={() => setGranularity(option)}>{t(`home.analytics.controls.granularities.${granularityTranslation[option]}`)}{option === effectiveGranularity ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
      <ButtonGroup><Popover><PopoverTrigger render={<Button aria-label={t("home.analytics.controls.dateRange")} size="icon" variant="outline" />}><CalendarIcon /></PopoverTrigger><PopoverContent align="start" className="w-auto p-0" sideOffset={8}><Calendar captionLayout="label" mode="range" onSelect={(selection: DateRange | undefined) => { if (!selection?.from) return; setCustomRange({ from: selection.from, to: selection.to ?? selection.from }); setPreset("custom"); }} selected={{ from: range.from, to: range.to }} /></PopoverContent></Popover><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.presetRange")} className="max-w-56" variant="outline" />}><span className="truncate">{t(`home.analytics.controls.presets.${preset}`)}</span></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuGroup>{presets.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setPreset(option)}>{t(`home.analytics.controls.presets.${option}`)}{option === preset ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></ButtonGroup>
      </>}
    </div></div>
    {businesses.isError || analytics.isError ? <Surface className="p-8 text-center text-sm text-destructive">Analytics are unavailable.</Surface> : null}
    {loading ? <AnalyticsSkeleton /> : null}
    {data ? <div aria-busy={analytics.isPlaceholderData || undefined} className={`flex flex-col gap-4 transition-opacity ${analytics.isPlaceholderData ? "opacity-60" : ""}`}><Surface className="grid sm:grid-cols-3">{results.map((result) => <section className="flex min-w-0 flex-col gap-2 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0" key={result.key}><h2 className="type-card-title text-foreground">{t(`home.analytics.results.${result.key}`)}</h2><p className="text-4xl font-normal tracking-normal break-words text-foreground tabular-nums">{result.value}</p>{result.description ? <p className="type-meta">{result.description}</p> : null}</section>)}</Surface>
      <Card><CardHeader><CardTitle>{t("home.analytics.chart.title")}</CardTitle><CardDescription>{t("home.analytics.chart.description")}</CardDescription></CardHeader><CardContent className="px-6"><AnalyticsOverviewChart data={chartData} /></CardContent></Card>
      <Surface className="grid sm:grid-cols-2">{metrics.map((metric) => <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={metric.key}><div className="flex min-h-32 flex-col gap-6"><div className="flex flex-col gap-5"><h2 className="type-card-title text-foreground">{metric.title}</h2><div className="flex flex-col gap-3"><p className="text-5xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p><div className="flex items-center gap-2 text-base text-muted-foreground"><span className="size-3 rounded-full border-2 border-primary" /><span>{rangeLabel}</span></div></div></div><AnalyticsMetricChart data={chartData} dataKey={metric.key} label={metric.title} {...(metric.key === "agentResponseSeconds" ? { formatValue: formatDuration } : {})} /><p className="type-meta">{metric.description}</p></div></section>)}</Surface>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{t("home.analytics.outcomes.title")}</CardTitle><CardDescription>{t("home.analytics.outcomes.description")}</CardDescription></CardHeader><CardContent><BarList items={data.outcomes.map((item) => ({ name: t(`home.analytics.outcomes.labels.${item.outcome}`), value: item.count, ...(OUTCOME_ICONS[item.outcome] ? { icon: OUTCOME_ICONS[item.outcome] } : {}) }))} /></CardContent></Card><Card><CardHeader><CardTitle>{t("home.analytics.channels.title")}</CardTitle><CardDescription>{t("home.analytics.channels.description")}</CardDescription></CardHeader><CardContent><BarList muted items={channelItems} suffix="%" /></CardContent></Card></div></div> : null}
  </div>;
}

function AnalyticsSkeleton() {
  const barRows = (widths: string[]) => (
    <div className="flex flex-col gap-3">
      {widths.map((width, index) => (
        <div className="flex items-center justify-between gap-3" key={index}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className={`h-4 ${width}`} />
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Surface className="grid sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <section className="flex min-w-0 flex-col gap-2 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0" key={index}>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-4 w-32" />
          </section>
        ))}
      </Surface>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="px-6">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
      <Surface className="grid sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={index}>
            <div className="flex min-h-32 flex-col gap-6">
              <div className="flex flex-col gap-5">
                <Skeleton className="h-5 w-28" />
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-12 w-24" />
                  <Skeleton className="h-5 w-40" />
                </div>
              </div>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          </section>
        ))}
      </Surface>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>{barRows(["w-24", "w-20", "w-28", "w-16"])}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent>{barRows(["w-20", "w-24", "w-16", "w-24"])}</CardContent>
        </Card>
      </div>
    </>
  );
}

function BarList({ items, muted = false, suffix = "" }: { items: Array<{ name: string; value: number; icon?: LucideIcon }>; muted?: boolean; suffix?: string }) { const maximum = Math.max(...items.map((item) => item.value), 1); return <ul className="flex flex-col gap-3">{items.map((item) => <li className="flex items-center justify-between gap-3" key={item.name}><div className="min-w-0 flex-1"><div className="type-meta mb-1 flex items-center gap-1.5">{item.icon ? <item.icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}<span className="truncate">{item.name}</span></div><div className="h-2.5 w-full rounded-full bg-muted"><div className={`h-2.5 rounded-full ${muted ? "bg-muted-foreground" : "bg-primary"}`} style={{ width: `${Math.round((item.value / maximum) * 100)}%` }} /></div></div><div className="type-meta ps-2 tabular-nums text-foreground">{item.value.toLocaleString()}{suffix}</div></li>)}</ul>; }
