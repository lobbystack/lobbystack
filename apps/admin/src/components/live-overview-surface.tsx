"use client";

import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import { Skeleton } from "@/components/ui/skeleton";

import { formatPhoneNumberDisplay } from "@/lib/phone";

import Link from "next/link";
import { getFollowUpDisplayTitle, isUrgentFollowUpValue, parseFollowUpTaskBody } from "@/lib/follow-up-task";
import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronRight, PhoneCall, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ChartBlockSkeleton, MetricCardGridSkeleton } from "@/components/loading-skeletons";
import { Item, ItemActions, ItemHeader, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { formatDateTime } from "@/lib/locale";

const OverviewCallChart = dynamic(() => import("./overview-call-chart").then((module) => module.OverviewCallChart), {
  loading: () => <div className="h-[350px] animate-pulse rounded-xl bg-muted" />,
  ssr: false,
});

type DashboardSummary = {
  businessId: string;
  kpis: {
    calls: { total: number; deltaPercent: number };
    messages: { total: number; deltaPercent: number };
    appointments: { total: number; deltaPercent: number };
    averageDuration: { totalSeconds: number; deltaSeconds: number };
  };
  monthlyCalls: Array<{ monthStart: string; total: number }>;
  recentCalls: Array<{ id: string; startedAt: string; status: string; durationSeconds: number; contactName: string | null; contactPhone: string | null }>;
  actionRequired: Array<{ id: string; kind: string; title: string; body: string; createdAt: string; conversationId?: string; callId?: string | null }>;
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
  const businessId = summary.data?.businessId;

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["dashboard"], ["call.started", "call.updated", "call.completed", "message.upserted", "appointment.updated"]);
  }, [businessId, queryClient]);

  const metrics = summary.data ? [
    { key: "calls", value: summary.data.kpis.calls.total.toLocaleString(i18n.language), description: formatDelta(summary.data.kpis.calls.deltaPercent, t) },
    { key: "appointments", value: summary.data.kpis.appointments.total.toLocaleString(i18n.language), description: formatDelta(summary.data.kpis.appointments.deltaPercent, t) },
    { key: "averageDuration", value: formatDuration(summary.data.kpis.averageDuration.totalSeconds), description: formatDurationDelta(summary.data.kpis.averageDuration.deltaSeconds, t) },
  ] as const : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("home.title")} />
      <div className="flex flex-col gap-6">
        {summary.isLoading ? <MetricCardGridSkeleton count={3} /> : (
          <Surface className="grid sm:grid-cols-2 md:grid-cols-3">
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
          <motion.section animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 10 }} transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }} className="flex flex-col gap-3 xl:h-full">
            <div className="flex items-center justify-between gap-4 px-1"><h2 className="type-section-title">{t("home.actionRequired.title")}</h2>{summary.isLoading ? <Skeleton className="h-6 w-12 rounded-full" /> : <Badge variant="outline">{(summary.data?.actionRequired.length ?? 0).toLocaleString(i18n.language)}</Badge>}</div>
            {summary.isLoading ? <ActionRequiredSkeleton /> : summary.data?.actionRequired.length ? <Card className="border-border/70">
                  <CardContent>
                    <ItemGroup>
                      {summary.data!.actionRequired.map((item, index) => (
                        <motion.div
                          animate={{ opacity: 1, y: 0 }}
                          initial={{ opacity: 0, y: 8 }}
                          key={item.id}
                          transition={{ delay: 0.08 + index * 0.03, duration: 0.18, ease: "easeOut" }}
                        >
                          {(() => {
                            const details = parseFollowUpTaskBody(item.body);
                            const displayTitle = getActionDisplayTitle(item, t);
                            const destination =
                              item.kind === "voice_message" && item.callId
                                ? {
                                    pathname: `/calls/${encodeURIComponent(String(item.callId))}`,
                                  }
                                : null;

                            return (
                              <Item className="px-1 py-1" size="sm" variant="default">
                                <ItemMedia className="size-9 rounded-full bg-muted/70" variant="icon">
                                  {getActionKindIcon(item.kind)}
                                </ItemMedia>
                                <ItemContent className="min-w-0">
                                  <ItemHeader className="flex-col items-start gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-2">
                                    <div className="min-w-0 flex-1">
                                      {destination ? (
                                        <ItemTitle className="w-full min-w-0 max-w-full items-start">
                                          <Link
                                            className="inline-flex min-w-0 max-w-full items-start gap-1 transition-colors hover:text-primary"
                                            href={destination}
                                          >
                                            <span className="min-w-0 overflow-hidden line-clamp-2">
                                              {displayTitle}
                                            </span>
                                            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                          </Link>
                                        </ItemTitle>
                                      ) : (
                                        <ItemTitle className="w-full min-w-0 max-w-full line-clamp-2">
                                          {displayTitle}
                                        </ItemTitle>
                                      )}
                                    </div>
                                    <ItemActions className="hidden w-auto shrink-0 justify-end self-start sm:flex">
                                      <Badge variant="secondary">
                                        {getActionKindLabel(item.kind, t)}
                                      </Badge>
                                      {isUrgentFollowUpValue(details.urgency) ? (
                                        <Badge variant="destructive">
                                          {t("home.actionRequired.urgent")}
                                        </Badge>
                                      ) : null}
                                    </ItemActions>
                                  </ItemHeader>
                                  {details.callbackPhone ? (
                                    <ItemDescription>{details.callbackPhone}</ItemDescription>
                                  ) : null}
                                  <ItemFooter className="flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span>
                                      {formatDateTime(item.createdAt, i18n.language, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                      })}
                                    </span>
                                    <span className="flex items-center gap-2 sm:hidden">
                                      <Badge variant="secondary">
                                        {getActionKindLabel(item.kind, t)}
                                      </Badge>
                                      {isUrgentFollowUpValue(details.urgency) ? (
                                        <Badge variant="destructive">
                                          {t("home.actionRequired.urgent")}
                                        </Badge>
                                      ) : null}
                                    </span>
                                  </ItemFooter>
                                </ItemContent>
                              </Item>
                            );
                          })()}
                          {index < summary.data!.actionRequired.length - 1 ? <Separator className="mt-4" /> : null}
                        </motion.div>
                      ))}
                    </ItemGroup>
                </CardContent>
              </Card> : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.actionRequired.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.actionRequired.emptyDescription")}</p></div>}
          </motion.section>
          <motion.section animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 12 }} transition={{ delay: 0.1, duration: 0.22, ease: "easeOut" }} className="flex flex-col gap-3 xl:h-full">
            <div className="flex items-center justify-between gap-4 px-1"><h2 className="type-section-title">{t("home.upcoming.title")}</h2>{summary.isLoading ? <Skeleton className="h-6 w-12 rounded-full" /> : <Badge variant="outline">{(summary.data?.upcoming.length ?? 0).toLocaleString(i18n.language)}</Badge>}</div>
            {summary.isLoading ? <UpcomingSkeleton /> : summary.data?.upcoming.length ? (
              <Card className="border-border/70"><CardContent className="flex flex-col gap-4">
                {summary.data.upcoming.map((appointment, index) => <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 8 }} transition={{ delay: 0.12 + index * 0.03, duration: 0.18, ease: "easeOut" }} key={appointment.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="type-item-title">{appointment.contactName ?? t("home.upcoming.unknownContact")}</p><Badge variant="outline">{getAppointmentStatusLabel(appointment.status, t)}</Badge><Badge variant="secondary">{getAppointmentSourceLabel(appointment.sourceChannel, t)}</Badge></div><p className="type-body-muted mt-1">{appointment.serviceName ?? t("home.upcoming.unknownService")}</p></div>
                    <div className="shrink-0 text-left sm:text-right"><p className="type-item-title">{formatDateTime(appointment.startsAt, i18n.language, { weekday: "short", month: "short", day: "numeric", timeZone: appointment.timezone })}</p><p className="type-body-muted mt-1">{formatDateTime(appointment.startsAt, i18n.language, { hour: "numeric", minute: "2-digit", timeZone: appointment.timezone })}</p></div>
                  </div>
                  {index < summary.data.upcoming.length - 1 ? <Separator className="mt-4" /> : null}
                </motion.div>)}
              </CardContent></Card>
            ) : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.upcoming.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.upcoming.emptyDescription")}</p></div>}
          </motion.section>
        </div>
        {summary.isLoading ? <OverviewChartSkeleton /> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4"><CardHeader><CardTitle>{t("home.chart.title")}</CardTitle></CardHeader><CardContent className="ps-2"><OverviewCallChart data={(summary.data?.monthlyCalls ?? []).map((item) => ({ name: formatDateTime(item.monthStart, i18n.language, { month: "short", timeZone: "UTC" }), total: item.total }))} /></CardContent></Card>
          <Card className="col-span-1 lg:col-span-3"><CardHeader><CardTitle>{t("home.recentCalls.title")}</CardTitle><CardDescription>{t("home.recentCalls.description", { count: summary.data?.recentCalls.length ?? 0 })}</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-6">{(summary.data?.recentCalls ?? []).map((call) => <div className="flex items-center gap-4" key={call.id}><Avatar className="h-9 w-9"><AvatarFallback>{initials(call.contactName)}</AvatarFallback></Avatar><div className="flex flex-1 flex-wrap items-center justify-between"><div className="flex flex-col gap-1"><p className="type-item-title leading-none">{call.contactName ?? t("home.recentCalls.unknownCaller")}</p><p className="type-body-muted">{(call.contactPhone ? formatPhoneNumberDisplay(call.contactPhone, i18n.language) : null) ?? formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="type-item-title">{call.durationSeconds ? t("home.recentCalls.durationValue", { value: call.durationSeconds }) : call.status}</div></div></div>)}</div></CardContent></Card>
        </div>}
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

function ActionRequiredSkeleton() {
  return (
<Card className="border-border/70">
                <CardContent>
                  <ItemGroup>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index}>
                        <Item className="px-1 py-1" size="sm" variant="default">
                          <ItemMedia className="size-9 rounded-full bg-muted/70" variant="icon">
                            <Skeleton className="size-4 rounded-full" />
                          </ItemMedia>
                          <ItemContent className="min-w-0">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-4/5" />
                              <Skeleton className="h-3 w-1/2" />
                              <Skeleton className="h-3 w-1/3" />
                            </div>
                          </ItemContent>
                        </Item>
                        {index < 2 ? <Separator className="mt-4" /> : null}
                      </div>
                    ))}
                  </ItemGroup>
                </CardContent>
              </Card>
  );
}

function UpcomingSkeleton() {
  return (
<Card className="border-border/70">
                <CardContent className="flex flex-col gap-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      {index < 2 ? <Separator className="mt-4" /> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
  );
}

function OverviewChartSkeleton() {
  return (
<div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <ChartBlockSkeleton height={350} />
            <Surface className="p-6 lg:col-span-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="mt-6 flex flex-col gap-6">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="flex items-center gap-4" key={index}>
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </Surface>
          </div>
  );
}

function getActionKindLabel(
  kind: DashboardSummary["actionRequired"][number]["kind"],
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  if (kind === "voice_message") {
    return t("home.actionRequired.kinds.voice_message");
  }

  if (kind === "human_handoff") {
    return t("home.actionRequired.kinds.human_handoff");
  }

  return t("home.actionRequired.kinds.other");
}

function getActionKindIcon(kind: DashboardSummary["actionRequired"][number]["kind"]): ReactNode {
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

function getActionDisplayTitle(
  item: DashboardSummary["actionRequired"][number],
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  return getFollowUpDisplayTitle({
    title: item.title,
    kind: item.kind,
    body: item.body,
    formatWithContact: (message, name) =>
      t("home.actionRequired.titleWithContact", {
        message,
        name,
      }),
  });
}

