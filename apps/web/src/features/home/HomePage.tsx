import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  PhoneCall,
  UserRound,
} from "lucide-react";

import type { BusinessContextSnapshot } from "@ai-receptionist/shared";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  actionRequired: Array<{
    id: string;
    kind: "voice_message" | "operator_alert" | "calendar_sync_issue" | "human_handoff" | string;
    title: string;
    body: string;
    createdAt: string;
    route: string;
  }>;
  upcoming: Array<{
    id: Id<"appointments">;
    startsAt: string;
    timezone: string;
    status: string;
    sourceChannel: string;
    contactName: string | null;
    serviceName: string | null;
    staffName: string | null;
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

function getActionKindLabel(
  kind: HomeSummary["actionRequired"][number]["kind"],
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  if (kind === "voice_message") {
    return t("home.actionRequired.kinds.voice_message");
  }

  if (kind === "human_handoff") {
    return t("home.actionRequired.kinds.human_handoff");
  }

  if (kind === "calendar_sync_issue") {
    return t("home.actionRequired.kinds.calendar_sync_issue");
  }

  if (kind === "operator_alert") {
    return t("home.actionRequired.kinds.operator_alert");
  }

  return t("home.actionRequired.kinds.other");
}

function getActionKindIcon(kind: HomeSummary["actionRequired"][number]["kind"]): ReactNode {
  if (kind === "voice_message") {
    return <PhoneCall className="size-4 text-muted-foreground" />;
  }

  if (kind === "human_handoff") {
    return <UserRound className="size-4 text-muted-foreground" />;
  }

  return <AlertCircle className="size-4 text-muted-foreground" />;
}

function getAppointmentStatusLabel(
  status: string,
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  if (status === "booked") {
    return t("home.upcoming.status.booked");
  }

  if (status === "confirmed") {
    return t("home.upcoming.status.confirmed");
  }

  return status;
}

function getAppointmentSourceLabel(
  sourceChannel: string,
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  if (sourceChannel === "voice") {
    return t("home.upcoming.source.voice");
  }

  if (sourceChannel === "sms") {
    return t("home.upcoming.source.sms");
  }

  if (sourceChannel === "dashboard") {
    return t("home.upcoming.source.dashboard");
  }

  return sourceChannel;
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
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("home.title")}</h1>
        </div>
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }}
          >
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>{t("home.actionRequired.title")}</CardTitle>
                    <CardDescription>{t("home.actionRequired.description")}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {(summary?.actionRequired.length ?? 0).toLocaleString(i18n.language)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {summary && summary.actionRequired.length > 0 ? (
                  summary.actionRequired.map((item, index) => (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      initial={{ opacity: 0, y: 8 }}
                      key={item.id}
                      transition={{ delay: 0.08 + index * 0.03, duration: 0.18, ease: "easeOut" }}
                    >
                      <Link
                        className="group flex items-start gap-3 rounded-xl border border-transparent px-1 py-1 transition-colors hover:border-border/70 hover:bg-muted/30"
                        to={item.route}
                      >
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/70">
                          {getActionKindIcon(item.kind)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{item.title}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {item.body}
                              </p>
                            </div>
                            <Badge className="shrink-0" variant="secondary">
                              {getActionKindLabel(item.kind, t)}
                            </Badge>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>
                              {formatDateTime(item.createdAt, i18n.language, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              {t("home.actionRequired.open")}
                              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          </div>
                        </div>
                      </Link>
                      {index < summary.actionRequired.length - 1 ? <Separator className="mt-4" /> : null}
                    </motion.div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed px-5 py-10 text-center">
                    <p className="text-sm font-medium">{t("home.actionRequired.emptyTitle")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("home.actionRequired.emptyDescription")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 12 }}
            transition={{ delay: 0.1, duration: 0.22, ease: "easeOut" }}
          >
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>{t("home.upcoming.title")}</CardTitle>
                    <CardDescription>{t("home.upcoming.description")}</CardDescription>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted/70">
                    <CalendarClock className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {summary && summary.upcoming.length > 0 ? (
                  summary.upcoming.map((appointment, index) => (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      initial={{ opacity: 0, y: 8 }}
                      key={String(appointment.id)}
                      transition={{ delay: 0.12 + index * 0.03, duration: 0.18, ease: "easeOut" }}
                    >
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {appointment.contactName ?? t("home.upcoming.unknownContact")}
                            </p>
                            <Badge variant="outline">
                              {getAppointmentStatusLabel(appointment.status, t)}
                            </Badge>
                            <Badge variant="secondary">
                              {getAppointmentSourceLabel(appointment.sourceChannel, t)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {appointment.serviceName ?? t("home.upcoming.unknownService")}
                            {appointment.staffName
                              ? ` ${t("home.upcoming.withStaff", { name: appointment.staffName })}`
                              : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">
                            {formatDateTime(appointment.startsAt, i18n.language, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              timeZone: appointment.timezone,
                            })}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatDateTime(appointment.startsAt, i18n.language, {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: appointment.timezone,
                            })}
                          </p>
                        </div>
                      </div>
                      {index < summary.upcoming.length - 1 ? <Separator className="mt-4" /> : null}
                    </motion.div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed px-5 py-10 text-center">
                    <p className="text-sm font-medium">{t("home.upcoming.emptyTitle")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("home.upcoming.emptyDescription")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.section>
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
              <div className="flex flex-col gap-6">
                {(summary?.recentCalls ?? []).map((call) => (
                  <div className="flex items-center gap-4" key={String(call.id)}>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initialsFromName(call.contactName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 flex-wrap items-center justify-between">
                      <div className="flex flex-col gap-1">
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
