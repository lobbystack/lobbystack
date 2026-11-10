"use client";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useUrlState } from "@/hooks/use-url-state";
import { useAgents } from "@/hooks/use-agents";
import { useAppointments } from "@/hooks/use-appointments";
import { todaysAppointments } from "@/lib/todays-appointments";
import { AgentBreakdown, AgentBreakdownSkeleton } from "@/components/analytics/agent-breakdown";
import { formatDuration } from "@/lib/duration";
import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo } from "react";
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
import { AnalyticsControlsSkeleton, MetricCardGridSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { formatDateTime, intlLocale } from "@/lib/locale";
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

const DEFAULT_PRESET: Preset = "last30";
const DEFAULT_GRANULARITY: Granularity = "week";

function formatDay(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDay(value: string | null): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDay(date) === value ? date : null;
}

type AnalyticsView = { customRange: { from: Date; to: Date } | null; granularity: Granularity; preset: Preset };

const DEFAULT_VIEW: AnalyticsView = { customRange: null, granularity: DEFAULT_GRANULARITY, preset: DEFAULT_PRESET };

/** Reads the view from the query string; explicit dates win, and anything missing or invalid falls back to the defaults. */
function viewFromUrl(): AnalyticsView {
  const parameters = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const granularity = granularities.find((option) => option === parameters.get("interval")) ?? DEFAULT_GRANULARITY;
  const named = presets.find((option) => option === parameters.get("range"));
  const from = parseDay(parameters.get("from"));
  const to = parseDay(parameters.get("to"));
  if (from && to && from <= to) return { customRange: { from, to }, granularity, preset: named ?? "custom" };
  return { customRange: null, granularity, preset: named ?? DEFAULT_PRESET };
}

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

function durationDelta(current: number, previous: number, t: ReturnType<typeof useTranslation<"dashboard">>["t"]): string {
  if (current === previous) return t("home.analytics.metrics.flat");
  return t(current > previous ? "home.analytics.metrics.durationUp" : "home.analytics.metrics.durationDown", { value: formatDuration(Math.abs(current - previous)) });
}

export function LiveAnalyticsSurface() {
  const { i18n, t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const { businesses, business } = useActiveBusiness();
  // Every share of the page names the dates it shows, so a link opened later lands on the same span.
  const writeView = useCallback((view: AnalyticsView, url: URL) => {
    const span = view.customRange ?? presetRange(view.preset === "custom" ? "last30" : view.preset, business?.createdAt);
    for (const key of ["range", "interval", "from", "to"]) url.searchParams.delete(key);
    if (view.preset !== "custom") url.searchParams.set("range", view.preset);
    url.searchParams.set("interval", view.granularity);
    url.searchParams.set("from", formatDay(span.from));
    url.searchParams.set("to", formatDay(span.to));
  }, [business?.createdAt]);
  const { ready: viewRead, setValue: setView, value: { customRange, granularity, preset } } = useUrlState({ initial: DEFAULT_VIEW, read: viewFromUrl, write: writeView });
  const setPreset = (next: Preset) => setView((current) => ({ ...current, customRange: null, preset: next }));
  const setGranularity = (next: Granularity) => setView((current) => ({ ...current, granularity: next }));
  const range = useMemo(() => customRange ?? presetRange(preset === "custom" ? "last30" : preset, business?.createdAt), [business?.createdAt, customRange, preset]);
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
    enabled: Boolean(business?.businessId) && viewRead,
    // Keep the previous range on screen, dimmed, while a new range or granularity loads.
    placeholderData: keepPreviousForBusiness<AnalyticsViewModel>(business?.businessId),
  });

  useEffect(() => {
    if (!business?.businessId) return;
    return subscribeRealtimeQuery(queryClient, business?.businessId, ["analytics", business?.businessId], ["call.started", "call.completed", "message.upserted", "appointment.updated"]);
  }, [business?.businessId, queryClient]);

  const data = analytics.data;
  const loading = businesses.isLoading || !viewRead || analytics.isLoading;
  // The split by agent only says something once there are two to compare.
  const { agents: workspaceAgents, hasChoice: severalAgents } = useAgents();
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
    { key: "agentResponseSeconds" as const, title: t("home.analytics.cards.agentResponseTime"), value: formatDuration(data.agentResponseSeconds.current), description: durationDelta(data.agentResponseSeconds.current, data.agentResponseSeconds.previous, t) },
  ] : [];
  // Calls and average duration follow the picked dates; Today always covers today, from the appointments list.
  const { appointments } = useAppointments();
  const today = todaysAppointments(appointments.data?.appointments, business?.timezone);
  const overview = data ? [
    { key: "calls", value: data.calls.current.toLocaleString(intlLocale(i18n.language)), description: percentDelta(data.calls.current, data.calls.previous, t) },
    today
      ? { key: "today", value: today.count.toLocaleString(intlLocale(i18n.language)), description: today.next ? t("home.analytics.overview.today.next", { time: formatDateTime(today.next.startsAt, i18n.language, { hour: "numeric", minute: "2-digit", timeZone: today.next.timezone }) }) : t("home.analytics.overview.today.none") }
      // Without the appointments list, the card counts the period's appointments instead.
      : { key: "appointments", value: data.appointments.current.toLocaleString(intlLocale(i18n.language)), description: percentDelta(data.appointments.current, data.appointments.previous, t) },
    { key: "averageDuration", value: formatDuration(data.averageCallDurationSeconds.current), description: durationDelta(data.averageCallDurationSeconds.current, data.averageCallDurationSeconds.previous, t) },
  ] as const : [];
  const overviewSkeleton = <MetricCardGridSkeleton count={3} titles={[t("home.analytics.overview.calls.title"), t("home.analytics.overview.today.title"), t("home.analytics.overview.averageDuration.title")]} />;
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
      <ButtonGroup><Popover><PopoverTrigger render={<Button aria-label={t("home.analytics.controls.dateRange")} size="icon" variant="outline" />}><CalendarIcon /></PopoverTrigger><PopoverContent align="start" className="w-auto p-0" sideOffset={8}><Calendar captionLayout="label" mode="range" onSelect={(selection: DateRange | undefined) => { const from = selection?.from; if (!from) return; setView((current) => ({ ...current, customRange: { from, to: selection?.to ?? from }, preset: "custom" })); }} selected={{ from: range.from, to: range.to }} /></PopoverContent></Popover><DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("home.analytics.controls.presetRange")} className="max-w-56" variant="outline" />}><span className="truncate">{t(`home.analytics.controls.presets.${preset}`)}</span></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuGroup>{presets.map((option) => <DropdownMenuItem className="justify-between" key={option} onClick={() => setPreset(option)}>{t(`home.analytics.controls.presets.${option}`)}{option === preset ? <Check /> : null}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></ButtonGroup>
      </>}
    </div></div>
    {businesses.isError || analytics.isError ? <Surface className="p-8 text-center text-sm text-destructive">Analytics are unavailable.</Surface> : null}
    {loading ? <>{overviewSkeleton}<AnalyticsSkeleton /></> : null}
    {loading && severalAgents ? <AgentBreakdownSkeleton rows={workspaceAgents.length} /> : null}
    {data ? <div aria-busy={analytics.isPlaceholderData || undefined} className={`flex flex-col gap-4 transition-opacity ${analytics.isPlaceholderData ? "opacity-60" : ""}`}>{appointments.isPending ? overviewSkeleton : <Surface className="grid sm:grid-cols-2 md:grid-cols-3">{overview.map((metric) => <section className="border-b p-5 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 md:border-b-0 md:border-r md:last:border-r-0" key={metric.key}><div className="flex flex-col gap-4"><div className="flex flex-col gap-2"><h2 className="type-card-title text-foreground">{t(`home.analytics.overview.${metric.key}.title`)}</h2><p className="text-4xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p></div><p className="type-meta">{metric.description}</p></div></section>)}</Surface>}
      <Card><CardHeader><CardTitle>{t("home.analytics.chart.title")}</CardTitle><CardDescription>{t("home.analytics.chart.description")}</CardDescription></CardHeader><CardContent className="px-6"><AnalyticsOverviewChart data={chartData} /></CardContent></Card>
      <Surface className="grid sm:grid-cols-2">{metrics.map((metric) => <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0" key={metric.key}><div className="flex min-h-32 flex-col gap-6"><div className="flex flex-col gap-5"><h2 className="type-card-title text-foreground">{metric.title}</h2><div className="flex flex-col gap-3"><p className="text-5xl font-normal tracking-normal text-foreground tabular-nums">{metric.value}</p><div className="flex items-center gap-2 text-base text-muted-foreground"><span className="size-3 rounded-full border-2 border-primary" /><span>{rangeLabel}</span></div></div></div><AnalyticsMetricChart data={chartData} dataKey={metric.key} label={metric.title} {...(metric.key === "agentResponseSeconds" ? { formatValue: formatDuration } : {})} /><p className="type-meta">{metric.description}</p></div></section>)}</Surface>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{t("home.analytics.outcomes.title")}</CardTitle><CardDescription>{t("home.analytics.outcomes.description")}</CardDescription></CardHeader><CardContent><BarList items={data.outcomes.map((item) => ({ name: t(`home.analytics.outcomes.labels.${item.outcome}`), value: item.count, ...(OUTCOME_ICONS[item.outcome] ? { icon: OUTCOME_ICONS[item.outcome] } : {}) }))} /></CardContent></Card><Card><CardHeader><CardTitle>{t("home.analytics.channels.title")}</CardTitle><CardDescription>{t("home.analytics.channels.description")}</CardDescription></CardHeader><CardContent><BarList muted items={channelItems} suffix="%" /></CardContent></Card></div>{severalAgents && data.agents?.length ? <AgentBreakdown agents={data.agents} /> : null}</div> : null}
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
