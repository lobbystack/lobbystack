import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { formatDateTime } from "@/lib/locale";

type HomePageProps = {
  businessId?: Id<"businesses">;
  snapshot: BusinessContextSnapshot;
};

type HomeSummary = {
  kpis: {
    calls: { total: number; deltaPercent: number };
    messages: { total: number; deltaPercent: number };
    appointments: { total: number; deltaPercent: number };
    contacts: { total: number; deltaPercent: number };
  };
  liveCalls: number;
  monthlyCalls: Array<{ monthStart: string; total: number }>;
  recentCalls: Array<{
    id: Id<"calls">;
    startedAt: string;
    status: string;
    durationSeconds: number | null;
    contactName: string | null;
    contactPhone: string | null;
  }>;
};

type MetricCard = {
  key: keyof HomeSummary["kpis"];
  icon: ReactNode;
  value: number;
};

function initialsFromName(value: string | null): string {
  if (!value) {
    return "AI";
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function metricIcon(key: MetricCard["key"]): ReactNode {
  if (key === "calls") {
    return (
      <svg
        className="h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.79.59 2.65a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.43-1.11a2 2 0 0 1 2.11-.45c.86.27 1.75.47 2.65.59A2 2 0 0 1 22 16.92Z" />
      </svg>
    );
  }

  if (key === "messages") {
    return (
      <svg
        className="h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
    );
  }

  if (key === "appointments") {
    return (
      <svg
        className="h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect height="18" rx="2" ry="2" width="18" x="3" y="4" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function HomePage({ businessId, snapshot }: HomePageProps) {
  const { i18n, t } = useTranslation("dashboard");
  const summary = useQuery(
    api.dashboard.overview.getHomeSummary,
    businessId ? { businessId } : "skip",
  ) as HomeSummary | undefined;

  function formatDelta(deltaPercent: number): string {
    if (deltaPercent === 0) {
      return t("delta.flat");
    }

    return deltaPercent > 0
      ? t("delta.up", { value: Math.abs(deltaPercent).toFixed(1) })
      : t("delta.down", { value: Math.abs(deltaPercent).toFixed(1) });
  }

  if (!businessId) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <BusinessSetupCard />
        <BusinessSnapshotCard snapshot={snapshot} />
      </div>
    );
  }

  const metricCards: MetricCard[] = summary
    ? [
        { key: "calls", icon: metricIcon("calls"), value: summary.kpis.calls.total },
        {
          key: "messages",
          icon: metricIcon("messages"),
          value: summary.kpis.messages.total,
        },
        {
          key: "appointments",
          icon: metricIcon("appointments"),
          value: summary.kpis.appointments.total,
        },
        {
          key: "contacts",
          icon: metricIcon("contacts"),
          value: summary.kpis.contacts.total,
        },
      ]
    : [];

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-2">
        <h1 className="text-2xl font-bold">{t("home.title")}</h1>
      </div>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((card) => {
            const metric = summary?.kpis[card.key];

            return (
              <Card key={card.key}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold tracking-tight">
                    {t(`home.metrics.${card.key}.title`)}
                  </CardTitle>
                  {card.icon}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-extrabold leading-none tracking-tight">
                    {card.value.toLocaleString(i18n.language)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metric
                      ? formatDelta(metric.deltaPercent)
                      : t("home.metrics.loading")}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4">
            <CardHeader>
              <CardTitle>{t("home.chart.title")}</CardTitle>
            </CardHeader>
            <CardContent className="ps-2">
              <ResponsiveContainer height={350} width="100%">
                <BarChart
                  data={(summary?.monthlyCalls ?? []).map((item) => ({
                    name: formatDateTime(item.monthStart, i18n.language, {
                      month: "short",
                      timeZone: "UTC",
                    }),
                    total: item.total,
                  }))}
                >
                  <XAxis
                    axisLine={false}
                    dataKey="name"
                    fontSize={12}
                    stroke="#888888"
                    tickLine={false}
                  />
                  <YAxis
                    axisLine={false}
                    direction="ltr"
                    fontSize={12}
                    stroke="#888888"
                    tickLine={false}
                  />
                  <Bar
                    className="fill-primary"
                    dataKey="total"
                    fill="currentColor"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
              <CardTitle>{t("home.recentCalls.title")}</CardTitle>
              <CardDescription>
                {t("home.recentCalls.description", {
                  count: summary?.recentCalls.length ?? 0,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {(summary?.recentCalls ?? []).map((call) => (
                  <div className="flex items-center gap-4" key={String(call.id)}>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initialsFromName(call.contactName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 flex-wrap items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm leading-none font-medium">
                          {call.contactName ?? t("home.recentCalls.unknownCaller")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {call.contactPhone ??
                            formatDateTime(call.startedAt, i18n.language, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                        </p>
                      </div>
                      <div className="font-medium">
                        {call.durationSeconds
                          ? t("home.recentCalls.durationValue", {
                              value: call.durationSeconds,
                            })
                          : call.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
