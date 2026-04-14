import { useQuery } from "convex/react";
import {
  CalendarDays,
  Clock3,
  MessageSquare,
  Phone,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartBlockSkeleton,
  MetricCardGridSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsChart } from "@/features/home/components/analytics-chart";

type AnalyticsProps = {
  businessId: Id<"businesses">;
};

type AnalyticsSummary = {
  weeklySeries: Array<{
    dayStart: string;
    calls: number;
    messages: number;
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
    averageCallDurationSeconds: {
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

export function Analytics({ businessId }: AnalyticsProps) {
  const { i18n, t } = useTranslation("dashboard");
  const summary = useQuery(api.dashboard.overview.getAnalyticsSummary, { businessId }) as
    | AnalyticsSummary
    | undefined;
  const isLoadingSummary = summary === undefined;

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

  const cards = summary
    ? [
        {
          key: "calls" as const,
          title: t("home.analytics.cards.calls"),
          value: summary.metrics.calls.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.calls.deltaPercent),
          icon: Phone,
        },
        {
          key: "messages" as const,
          title: t("home.analytics.cards.messages"),
          value: summary.metrics.messages.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.messages.deltaPercent),
          icon: MessageSquare,
        },
        {
          key: "appointments" as const,
          title: t("home.analytics.cards.appointments"),
          value: summary.metrics.appointments.value.toLocaleString(i18n.language),
          description: formatPercentDelta(summary.metrics.appointments.deltaPercent),
          icon: CalendarDays,
        },
        {
          key: "averageDuration" as const,
          title: t("home.analytics.cards.averageDuration"),
          value: formatDuration(summary.metrics.averageCallDurationSeconds.value),
          description: formatDurationDelta(summary.metrics.averageCallDurationSeconds.deltaSeconds),
          icon: Clock3,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {isLoadingSummary ? (
        <>
          <ChartBlockSkeleton />
          <MetricCardGridSkeleton />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <div className="rounded-xl border bg-card p-6 lg:col-span-4">
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
            </div>
            <div className="rounded-xl border bg-card p-6 lg:col-span-3">
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
            </div>
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
              <AnalyticsChart data={summary?.weeklySeries ?? []} />
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle>{card.title}</CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="type-metric">{card.value}</div>
                  <p className="type-meta">{card.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
