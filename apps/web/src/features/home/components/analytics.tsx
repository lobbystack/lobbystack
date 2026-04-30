import { CalendarIcon, Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DateRange } from "react-day-picker";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChartBlockSkeleton,
  MetricCardGridSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { AnalyticsChart } from "@/features/home/components/analytics-chart";
import { formatDateTime } from "@/lib/locale";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";

type AnalyticsProps = {
  businessId: Id<"businesses">;
};

type AnalyticsGranularity = "daily" | "hourly" | "monthly" | "weekly" | "yearly";

type PresetRangeKey =
  | "allTime"
  | "custom"
  | "last30"
  | "last3Months"
  | "lastMonth"
  | "lastYear"
  | "thisMonth"
  | "thisWeek"
  | "thisYear"
  | "today"
  | "yesterday";

type AnalyticsDateRange = {
  from: Date;
  to: Date;
};

type AnalyticsSummary = {
  weeklySeries: Array<{
    dayStart: string;
    calls: number;
    messages: number;
    appointments: number;
    agentResponseSeconds: number;
  }>;
  metrics: {
    calls: {
      value: number;
      deltaPercent: number;
    };
    messages: {
      value: number;
      deltaPercent: number;
    };
    appointments: {
      value: number;
      deltaPercent: number;
    };
    averageAgentResponseSeconds: {
      value: number;
      deltaSeconds: number;
    };
  };
  outcomes: Array<{
    key: "completed" | "transferred" | "live" | "missed";
    value: number;
  }>;
  channels: Array<{
    key: "voice" | "sms" | "other";
    value: number;
  }>;
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

type MetricChartPoint = {
  dayLabel: string;
  calls: number;
  messages: number;
  appointments: number;
  agentResponseSeconds: number;
};

type MetricChartKey = "calls" | "messages" | "appointments" | "agentResponseSeconds";

const GRANULARITY_OPTIONS: Array<AnalyticsGranularity> = [
  "yearly",
  "monthly",
  "weekly",
  "daily",
  "hourly",
];

const PRESET_RANGE_OPTIONS: Array<Exclude<PresetRangeKey, "custom">> = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "lastMonth",
  "last30",
  "last3Months",
  "thisYear",
  "lastYear",
  "allTime",
];

export function Analytics({ businessId }: AnalyticsProps) {
  const { i18n, t } = useTranslation("dashboard");
  const [granularity, setGranularity] = useState<AnalyticsGranularity>("weekly");
  const [presetRange, setPresetRange] = useState<PresetRangeKey>("last30");
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>(() =>
    getPresetDateRange("last30"),
  );
  const queryRange = useMemo(
    () => ({
      endMs: getExclusiveRangeEnd(dateRange.to).getTime(),
      startMs: getStartOfDay(dateRange.from).getTime(),
    }),
    [dateRange],
  );
  const availableGranularities = useMemo(
    () => getAvailableGranularities(dateRange),
    [dateRange],
  );

  useEffect(() => {
    if (availableGranularities.has(granularity)) {
      return;
    }

    setGranularity(getFallbackGranularity(availableGranularities));
  }, [availableGranularities, granularity]);

  const rememberedSummary = useRememberedConvexQuery(
    api.dashboard.overview.getAnalyticsSummary,
    {
      businessId,
      granularity,
      rangeEndMs: queryRange.endMs,
      rangeStartMs: queryRange.startMs,
    },
  );
  const summary = rememberedSummary.data as AnalyticsSummary | undefined;
  const isLoadingSummary = rememberedSummary.isInitialLoading;

  function formatPercentDelta(deltaPercent: number): string {
    if (deltaPercent === 0) {
      return t("home.analytics.metrics.flat");
    }

    return deltaPercent > 0
      ? t("home.analytics.metrics.percentUp", { value: Math.abs(deltaPercent).toFixed(1) })
      : t("home.analytics.metrics.percentDown", { value: Math.abs(deltaPercent).toFixed(1) });
  }

  function formatDurationDelta(deltaSeconds: number): string {
    if (deltaSeconds === 0) {
      return t("home.analytics.metrics.flat");
    }

    const value = formatDuration(Math.abs(deltaSeconds));
    return deltaSeconds > 0
      ? t("home.analytics.metrics.durationUp", { value })
      : t("home.analytics.metrics.durationDown", { value });
  }

  const metricChartData: Array<MetricChartPoint> = (summary?.weeklySeries ?? []).map(
    (item) => ({
      dayLabel: formatBucketLabel(item.dayStart, granularity, i18n.language),
      calls: item.calls,
      messages: item.messages,
      appointments: item.appointments,
      agentResponseSeconds: item.agentResponseSeconds,
    }),
  );
  const dateRangeLabel = formatSelectedDateRange(dateRange, i18n.language);

  function handlePresetRangeSelect(
    nextPresetRange: Exclude<PresetRangeKey, "custom">,
  ): void {
    setPresetRange(nextPresetRange);
    setDateRange(getPresetDateRange(nextPresetRange));
  }

  function handleCalendarSelect(nextRange: DateRange | undefined): void {
    if (!nextRange?.from) {
      return;
    }

    setPresetRange("custom");
    setDateRange({
      from: nextRange.from,
      to: nextRange.to ?? nextRange.from,
    });
  }

  const cards = summary
    ? [
        {
          key: "calls" as const,
          title: t("home.analytics.cards.calls"),
          value: summary.metrics.calls.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.calls.deltaPercent),
          dataKey: "calls" as const,
          valueFormatter: (value: number) => value.toLocaleString(i18n.language),
        },
        {
          key: "messages" as const,
          title: t("home.analytics.cards.messages"),
          value: summary.metrics.messages.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.messages.deltaPercent),
          dataKey: "messages" as const,
          valueFormatter: (value: number) => value.toLocaleString(i18n.language),
        },
        {
          key: "appointments" as const,
          title: t("home.analytics.cards.appointments"),
          value: summary.metrics.appointments.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.appointments.deltaPercent),
          dataKey: "appointments" as const,
          valueFormatter: (value: number) => value.toLocaleString(i18n.language),
        },
        {
          key: "agentResponseTime" as const,
          title: t("home.analytics.cards.agentResponseTime"),
          value: formatDuration(summary.metrics.averageAgentResponseSeconds.value),
          description: formatDurationDelta(summary.metrics.averageAgentResponseSeconds.deltaSeconds),
          dataKey: "agentResponseSeconds" as const,
          valueFormatter: formatDuration,
        },
      ]
    : [];

  const controlBar = (
    <AnalyticsControlBar
      calendarRange={{
        from: dateRange.from,
        to: dateRange.to,
      }}
      dateRangeLabel={dateRangeLabel}
      disabledGranularities={availableGranularities}
      granularity={granularity}
      onCalendarSelect={handleCalendarSelect}
      onGranularityChange={setGranularity}
      onPresetRangeSelect={handlePresetRangeSelect}
      presetRange={presetRange}
      t={t}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 py-2">
        <div className="flex min-w-0 flex-col">
          <h1 className="type-page-title">{t("analyticsPage.title")}</h1>
        </div>
        <div className="ms-auto flex shrink-0">{controlBar}</div>
      </div>
      {isLoadingSummary ? (
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
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.analytics.chart.title")}</CardTitle>
              <CardDescription>{t("home.analytics.chart.description")}</CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <AnalyticsChart data={summary?.weeklySeries ?? []} granularity={granularity} />
            </CardContent>
          </Card>
          <Surface className="grid sm:grid-cols-2">
            {cards.map((card) => (
              <MetricChartCard
                chartData={metricChartData}
                dataKey={card.dataKey}
                dateRange={dateRangeLabel}
                description={card.description}
                key={card.key}
                title={card.title}
                value={card.value}
                valueFormatter={card.valueFormatter}
              />
            ))}
          </Surface>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <Card className="col-span-1 lg:col-span-4">
              <CardHeader>
                <CardTitle>{t("home.analytics.outcomes.title")}</CardTitle>
                <CardDescription>{t("home.analytics.outcomes.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarList
                  barClass="bg-primary"
                  items={(summary?.outcomes ?? []).map((item) => ({
                    name: t(`home.analytics.outcomes.labels.${item.key}`),
                    value: item.value,
                  }))}
                  valueFormatter={(value) => value.toLocaleString(i18n.language)}
                />
              </CardContent>
            </Card>
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader>
                <CardTitle>{t("home.analytics.channels.title")}</CardTitle>
                <CardDescription>{t("home.analytics.channels.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarList
                  barClass="bg-muted-foreground"
                  items={(summary?.channels ?? []).map((item) => ({
                    name: t(`home.analytics.channels.labels.${item.key}`),
                    value: item.value,
                  }))}
                  valueFormatter={(value) => `${value}%`}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SimpleBarList({
  items,
  valueFormatter,
  barClass,
}: {
  items: Array<{ name: string; value: number }>;
  valueFormatter: (value: number) => string;
  barClass: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const width = `${Math.round((item.value / max) * 100)}%`;

        return (
          <li className="flex items-center justify-between gap-3" key={item.name}>
            <div className="min-w-0 flex-1">
              <div className="type-meta mb-1 truncate">{item.name}</div>
              <div className="h-2.5 w-full rounded-full bg-muted">
                <div className={`h-2.5 rounded-full ${barClass}`} style={{ width }} />
              </div>
            </div>
            <div className="type-meta ps-2 tabular-nums text-foreground">
              {valueFormatter(item.value)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AnalyticsControlBar({
  calendarRange,
  dateRangeLabel,
  disabledGranularities,
  granularity,
  onCalendarSelect,
  onGranularityChange,
  onPresetRangeSelect,
  presetRange,
  t,
}: {
  calendarRange: DateRange;
  dateRangeLabel: string;
  disabledGranularities: Set<AnalyticsGranularity>;
  granularity: AnalyticsGranularity;
  onCalendarSelect: (range: DateRange | undefined) => void;
  onGranularityChange: (value: AnalyticsGranularity) => void;
  onPresetRangeSelect: (value: Exclude<PresetRangeKey, "custom">) => void;
  presetRange: PresetRangeKey;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 md:justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("home.analytics.controls.granularity")}
              variant="outline"
            />
          }
        >
          <span className="truncate">
            {t(`home.analytics.controls.granularities.${granularity}`)}
          </span>
          <ChevronDown className="text-muted-foreground" data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuGroup>
            {GRANULARITY_OPTIONS.map((option) => {
              const isEnabled = disabledGranularities.has(option);

              return (
                <DropdownMenuItem
                  className="justify-between"
                  disabled={!isEnabled}
                  key={option}
                  onClick={() => {
                    if (isEnabled) {
                      onGranularityChange(option);
                    }
                  }}
                >
                  {t(`home.analytics.controls.granularities.${option}`)}
                  {option === granularity ? <Check /> : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ButtonGroup>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                aria-label={t("home.analytics.controls.dateRange")}
                size="icon"
                variant="outline"
              />
            }
          >
            <CalendarIcon />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0" sideOffset={8}>
            <Calendar
              captionLayout="label"
              mode="range"
              onSelect={onCalendarSelect}
              selected={calendarRange}
            />
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t("home.analytics.controls.presetRange")}
                className="max-w-56"
                variant="outline"
              />
            }
          >
            <span className="truncate">
              {presetRange === "custom"
                ? dateRangeLabel
                : t(`home.analytics.controls.presets.${presetRange}`)}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              {PRESET_RANGE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  className="justify-between"
                  key={option}
                  onClick={() => onPresetRangeSelect(option)}
                >
                  {t(`home.analytics.controls.presets.${option}`)}
                  {option === presetRange ? <Check /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  );
}

function MetricChartCard({
  title,
  value,
  description,
  dateRange,
  chartData,
  dataKey,
  valueFormatter,
}: {
  title: string;
  value: string;
  description: string;
  dateRange: string;
  chartData: Array<MetricChartPoint>;
  dataKey: MetricChartKey;
  valueFormatter: (value: number) => string;
}) {
  const chartConfig = {
    [dataKey]: {
      label: title,
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <section className="border-b p-6 last:border-b-0 sm:odd:border-r sm:[&:nth-last-child(-n+2)]:border-b-0">
      <div className="flex min-h-32 flex-col gap-6">
        <div className="flex flex-col gap-5">
          <h2 className="type-card-title text-foreground">{title}</h2>
          <div className="flex flex-col gap-3">
            <p className="text-5xl font-normal tracking-normal text-foreground tabular-nums">
              {value}
            </p>
            <div className="flex items-center gap-2 text-base text-muted-foreground">
              <span className="size-3 rounded-full border-2 border-primary" />
              <span>{dateRange}</span>
            </div>
          </div>
        </div>
        <ChartContainer className="aspect-auto h-40 w-full" config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              bottom: 8,
              left: 0,
              right: 0,
              top: 8,
            }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="4 6"
              vertical
            />
            <XAxis
              axisLine={false}
              dataKey="dayLabel"
              height={28}
              interval="preserveStartEnd"
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              domain={[0, (dataMax: number) => Math.max(dataMax, 1)]}
              hide
              padding={{ bottom: 16, top: 8 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(tooltipValue) =>
                    typeof tooltipValue === "number"
                      ? valueFormatter(tooltipValue)
                      : String(tooltipValue)
                  }
                  hideLabel
                />
              }
              cursor={false}
            />
            <Line
              dataKey={dataKey}
              dot={false}
              stroke={`var(--color-${dataKey})`}
              strokeWidth={2}
              type="natural"
            />
          </LineChart>
        </ChartContainer>
        <p className="type-meta">{description}</p>
      </div>
    </section>
  );
}

function formatBucketLabel(
  value: string,
  granularity: AnalyticsGranularity,
  locale: string,
): string {
  if (granularity === "hourly") {
    return formatDateTime(value, locale, {
      hour: "numeric",
      timeZone: "UTC",
    });
  }

  if (granularity === "monthly") {
    return formatDateTime(value, locale, {
      month: "short",
      timeZone: "UTC",
    });
  }

  if (granularity === "yearly") {
    return formatDateTime(value, locale, {
      timeZone: "UTC",
      year: "numeric",
    });
  }

  return formatDateTime(value, locale, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function formatSelectedDateRange(range: AnalyticsDateRange, locale: string): string {
  const start = formatDateTime(range.from, locale, {
    day: "2-digit",
    month: "short",
  });
  const end = formatDateTime(range.to, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${start} - ${end}`;
}

function getStartOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getExclusiveRangeEnd(value: Date): Date {
  const start = getStartOfDay(value);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

function getPresetDateRange(preset: Exclude<PresetRangeKey, "custom">): AnalyticsDateRange {
  const today = getStartOfDay(new Date());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  if (preset === "today") {
    return { from: today, to: today };
  }

  if (preset === "yesterday") {
    return { from: yesterday, to: yesterday };
  }

  if (preset === "thisWeek") {
    return { from: weekStart, to: today };
  }

  if (preset === "thisMonth") {
    return {
      from: new Date(today.getFullYear(), today.getMonth(), 1),
      to: today,
    };
  }

  if (preset === "lastMonth") {
    return {
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      to: new Date(today.getFullYear(), today.getMonth(), 0),
    };
  }

  if (preset === "last3Months") {
    return {
      from: new Date(today.getFullYear(), today.getMonth() - 3, today.getDate()),
      to: today,
    };
  }

  if (preset === "thisYear") {
    return {
      from: new Date(today.getFullYear(), 0, 1),
      to: today,
    };
  }

  if (preset === "lastYear") {
    return {
      from: new Date(today.getFullYear() - 1, 0, 1),
      to: new Date(today.getFullYear() - 1, 11, 31),
    };
  }

  if (preset === "allTime") {
    return {
      from: new Date(2020, 0, 1),
      to: today,
    };
  }

  return {
    from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29),
    to: today,
  };
}

function getAvailableGranularities(range: AnalyticsDateRange): Set<AnalyticsGranularity> {
  const days = Math.max(
    1,
    Math.ceil(
      (getExclusiveRangeEnd(range.to).getTime() - getStartOfDay(range.from).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );

  return new Set(
    GRANULARITY_OPTIONS.filter((option) => {
      if (option === "hourly") {
        return days <= 7;
      }

      if (option === "daily") {
        return days <= 120;
      }

      if (option === "weekly") {
        return days >= 14 && days <= 730;
      }

      if (option === "monthly") {
        return days >= 90;
      }

      return days >= 730;
    }),
  );
}

function getFallbackGranularity(
  availableGranularities: Set<AnalyticsGranularity>,
): AnalyticsGranularity {
  for (const option of ["weekly", "daily", "monthly", "hourly", "yearly"] as const) {
    if (availableGranularities.has(option)) {
      return option;
    }
  }

  return "daily";
}
