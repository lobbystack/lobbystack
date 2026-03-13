import { useQuery } from "convex/react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  ContactRound,
  MessageSquareMore,
  Phone,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { BusinessSnapshotCard } from "@/features/settings/BusinessSnapshotCard";
import { BusinessSetupCard } from "@/features/workspace/business-setup-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const metricCards = summary
    ? [
        { key: "calls", icon: Phone, value: summary.kpis.calls.total },
        { key: "messages", icon: MessageSquareMore, value: summary.kpis.messages.total },
        { key: "appointments", icon: CalendarDays, value: summary.kpis.appointments.total },
        { key: "contacts", icon: ContactRound, value: summary.kpis.contacts.total },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("home.title")}</h1>
          <p className="text-muted-foreground">{t("home.description")}</p>
        </div>
      </div>

      <Tabs className="space-y-4" defaultValue="overview" orientation="vertical">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList>
            <TabsTrigger value="overview">{t("home.tabs.overview")}</TabsTrigger>
            <TabsTrigger disabled value="analytics">
              {t("home.tabs.analytics")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="space-y-4" value="overview">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => {
              const metric = summary?.kpis[card.key as keyof typeof summary.kpis];
              return (
                <Card key={card.key}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t(`home.metrics.${card.key}.title`)}
                    </CardTitle>
                    <card.icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{card.value.toLocaleString(i18n.language)}</div>
                    <p className="text-xs text-muted-foreground">
                      {metric ? formatDelta(metric.deltaPercent) : t("home.metrics.loading")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>{t("home.chart.title")}</CardTitle>
                <CardDescription>{t("home.chart.description")}</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <ResponsiveContainer height={340} width="100%">
                  <BarChart
                    data={(summary?.monthlyCalls ?? []).map((item: HomeSummary["monthlyCalls"][number]) => ({
                      label: formatDateTime(item.monthStart, i18n.language, {
                        month: "short",
                        timeZone: "UTC",
                      }),
                      total: item.total,
                    }))}
                  >
                    <XAxis
                      axisLine={false}
                      dataKey="label"
                      fontSize={12}
                      stroke="#888888"
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      fontSize={12}
                      stroke="#888888"
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-card)",
                      }}
                    />
                    <Bar className="fill-primary" dataKey="total" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
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
                  {(summary?.recentCalls ?? []).map((call: HomeSummary["recentCalls"][number]) => (
                    <div className="flex items-center gap-4" key={String(call.id)}>
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initialsFromName(call.contactName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
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
                        <div className="text-right text-sm font-medium">
                          {call.durationSeconds
                            ? t("home.recentCalls.durationValue", { value: call.durationSeconds })
                            : call.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
