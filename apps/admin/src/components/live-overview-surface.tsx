"use client";

import { subscribeRealtimeQuery } from "@/lib/realtime-query";

import { Skeleton } from "@/components/ui/skeleton";

import { getChannelLabel, getContactDisplayName, hasDisplayablePhone } from "@/lib/contact-display";
import { formatPhoneNumberDisplay } from "@/lib/phone";

import Link from "next/link";
import { appointmentRequestKind, extractFollowUpContactName, getFollowUpDisplayTitle, isAppointmentRequest, isUrgentFollowUpValue, cancellationRequestDetails, parseFollowUpTaskBody, type RequestedCancellation } from "@/lib/follow-up-task";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageCircleQuestionMark, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CallForwardingFromLink } from "@/components/call-forwarding-dialog";
import { TestCallButton } from "@/components/navigation/test-call-button";
import { DashboardActivationCard } from "@/components/dashboard-activation-card";
import { LiveSetupGuideSurface, useSetupGuide } from "@/components/live-setup-guide-surface";
import { needsHoursForBooking, useBusinessHours } from "@/components/business-hours-section";
import { AppointmentDetailsSheet } from "@/components/appointment-details-sheet";
import { appointmentSummary } from "@/components/cancel-appointment-button";
import { HiddenTextSkeleton, ResultsRowSkeleton, SetupGuideSkeleton } from "@/components/loading-skeletons";
import { RowChevron } from "@/components/row-chevron";
import { formatBookedValue, formatTimeSaved } from "@/lib/analytics-results";
import type { AnalyticsResultsViewModel } from "@/lib/page-view-models";
import { Item, ItemActions, ItemHeader, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Surface } from "@/components/ui/surface";
import { intlLocale, formatDateTime } from "@/lib/locale";
import { type Appointment } from "@/hooks/use-appointments";
import { fetchUnansweredQuestions, UNANSWERED_QUESTIONS_ANCHOR, unansweredQuestionsQueryKey } from "@/components/unanswered-questions-section";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { useActiveBusiness } from "@/hooks/use-active-business";
import { isSetupGuideFinished, SETUP_STEP_ORDER, showsSetupGuide } from "@/lib/setup-guide";

const OverviewCallChart = dynamic(() => import("./overview-call-chart").then((module) => module.OverviewCallChart), {
  loading: () => <Skeleton className="h-[350px] w-full" />,
  ssr: false,
});

type DashboardSummary = {
  businessId: string;
  /** Booked value, time saved and calls without transfer over the last 30 days, each with the 30 days before. */
  results: AnalyticsResultsViewModel;
  monthlyCalls: Array<{ monthStart: string; total: number }>;
  recentCalls: Array<{ id: string; startedAt: string; status: string; transport?: string | null; durationSeconds: number; contactName: string | null; contactPhone: string | null; contactEmail?: string | null }>;
  /** How many requests are open in all; Home lists the newest few. */
  actionRequiredCount?: number;
  actionRequired: Array<{ id: string; kind: string; title: string; body: string; createdAt: string; conversationId?: string; callId?: string | null; request?: string | null; requested?: RequestedCancellation | null; appointment?: { id: string; startsAt: string; timezone: string; status: string; serviceName: string | null; contactName: string | null } | null }>;
  upcoming: Array<{ id: string; startsAt: string; endsAt: string; timezone: string; status: string; sourceChannel: string; calendarSyncState: string; staffId?: string; contactName: string | null; contactPhone?: string | null; contactEmail?: string | null; serviceName: string | null; staffName: string | null; employeeName?: string | null }>;
  /** Null until the business's first real conversation. */
  firstRealConversationAt?: string | null;
};


async function getSummary(): Promise<DashboardSummary> {
  const response = await fetch("/api/dashboard", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load dashboard data.");
  return await response.json() as DashboardSummary;
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
  // The Upcoming row whose details are open. Looked up by id, so the sheet closes by itself once its appointment is cancelled.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const { t: tKnowledge } = useTranslation("knowledge");
  // Only owners and admins answer questions, and their routes need setup, which an activity-only business leaves to its partner.
  const { business } = useActiveBusiness();
  const canSetUp = useBusinessCan()("setup");
  const canAnswerQuestions = canSetUp && (business?.role === "business_owner" || business?.role === "business_admin");
  const unanswered = useQuery({ queryKey: unansweredQuestionsQueryKey(businessId), enabled: Boolean(businessId) && canAnswerQuestions, queryFn: () => fetchUnansweredQuestions(businessId!) });
  const unansweredCount = canAnswerQuestions ? unanswered.data?.openCount ?? 0 : 0;
  const mayShowGuide = Boolean(businessId) && showsSetupGuide({ canSetUp, role: business?.role });
  const guide = useSetupGuide(mayShowGuide ? businessId : undefined);
  // Missing opening hours keep the guide open too: they're its one step the server doesn't track.
  const hours = useBusinessHours(mayShowGuide ? businessId ?? "" : "");
  // A failed request leaves the guide out, and the dashboard works without setup. Its placeholder holds the space while it loads.
  const showGuide = mayShowGuide && Boolean(guide.data) && (!isSetupGuideFinished(guide.data!) || (needsHoursForBooking(hours.data) && !guide.data!.skippedSteps.includes("hours")));
  // The activation card waits too, so it doesn't appear and then give way to the guide.
  const guidePending = mayShowGuide && guide.isPending;
  // Finishing the last step here, or skipping them all, says so once.
  const guideWasShown = useRef(false);
  useEffect(() => {
    if (showGuide && guide.data) guideWasShown.current = true;
    else if (guideWasShown.current && !showGuide && guide.data) {
      guideWasShown.current = false;
      toast.success(t("setupGuide.finished"));
    }
  }, [guide.data, showGuide, t]);

  useEffect(() => {
    if (!businessId) return;
    return subscribeRealtimeQuery(queryClient, businessId, ["dashboard"], ["call.started", "call.updated", "call.completed", "message.upserted", "appointment.updated"]);
  }, [businessId, queryClient]);

  const openRequests = summary.data?.actionRequiredCount ?? summary.data?.actionRequired.length ?? 0;
  const results = summary.data?.results ? homeResults(summary.data.results, i18n.language, t) : [];

  if (summary.data?.firstRealConversationAt === null && !business) return <PageHeader title={t("home.title")} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={<TestCallButton />} title={t("home.title")} />
      {/* The extra margin makes the visible gap match the one between the page title and Getting started. */}
      {showGuide ? (
        <div className="mb-4"><LiveSetupGuideSurface businessId={businessId!} goal={business?.onboardingGoal ?? null} /></div>
      ) : guidePending ? (
        <div className="mb-4"><SetupGuideSkeleton labels={{ title: t("setupGuide.title"), skip: t("setupGuide.skip"), steps: SETUP_STEP_ORDER.map((id) => t(`setupGuide.steps.${id}`)) }} /></div>
      ) : null}
      <div className="flex flex-col gap-6">
        {/* Getting started covers what the activation card would offer. */}
        {showGuide || guidePending ? null : <DashboardActivationCard businessId={businessId} />}
        {showGuide || guidePending || !businessId ? null : <CallForwardingFromLink businessId={businessId} />}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-3 xl:h-full">
            <div className="flex items-center justify-between gap-4 px-1"><div className="flex items-center gap-3"><h2 className="type-section-title">{t("home.actionRequired.title")}</h2>{summary.isLoading ? <HiddenTextSkeleton className="text-sm">{t("home.actionRequired.viewAll")}</HiddenTextSkeleton> : openRequests > (summary.data?.actionRequired.length ?? 0) ? <Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="/inbox">{t("home.actionRequired.viewAll")}</Link> : null}</div>{summary.isLoading ? <Skeleton className="h-6 w-12 rounded-full" /> : <Badge variant="outline">{(openRequests + (unansweredCount > 0 ? 1 : 0)).toLocaleString(intlLocale(i18n.language))}</Badge>}</div>
            {unansweredCount > 0 ? <Item render={<Link href={`/business/knowledge#${UNANSWERED_QUESTIONS_ANCHOR}`} />} variant="outline">
              <ItemMedia variant="icon"><MessageCircleQuestionMark className="text-muted-foreground" /></ItemMedia>
              <ItemContent><ItemTitle>{tKnowledge("unansweredQuestions.home.count", { count: unansweredCount })}</ItemTitle><ItemDescription>{tKnowledge("unansweredQuestions.home.description")}</ItemDescription></ItemContent>
              <ItemActions><ChevronRight className="size-4 text-muted-foreground" /></ItemActions>
            </Item> : null}
            {summary.isLoading ? <ActionRequiredSkeleton /> : summary.data?.actionRequired.length ? <Card className="ph-mask border-border/70 xl:flex-1">
                  <CardContent>
                    <ItemGroup className="has-data-[size=sm]:gap-0">
                      {summary.data!.actionRequired.map((item) => (
                        <div className="border-b py-4 first:pt-0 last:border-b-0 last:pb-0" key={item.id}>
                          {(() => {
                            const details = parseFollowUpTaskBody(item.body);
                            const displayTitle = getActionDisplayTitle(item, t);
                            const requestKind = appointmentRequestKind(item.request);
                            const reschedule = requestKind === "reschedule";
                            const appointmentRequest = requestKind !== null;
                            const requestKindLabel = requestKind ? t(`home.actionRequired.kinds.${requestKind}`) : getActionKindLabel(item.kind, t);
                            // A request can outlive its appointment, cancelled before the request was saved.
                            const cancelled = item.appointment?.status === "canceled";
                            const appointment = item.appointment && !cancelled ? { ...item.appointment, contactName: getContactDisplayName({ name: item.appointment.contactName }, i18n.language, t) } : null;
                            // Each opens in the Inbox: a message on its call, a handoff on its conversation.
                            const destination =
                              item.kind === "voice_message" && item.callId
                                ? `/inbox?call=${encodeURIComponent(String(item.callId))}`
                                : item.kind === "human_handoff" && item.conversationId
                                  ? `/inbox?conversation=${encodeURIComponent(item.conversationId)}`
                                  : null;

                            return (
                              // The whole row opens its item; the title's link stretches over it.
                              <Item className={cn("relative rounded-md p-0", destination && "-mx-2 px-2 py-2 transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50")} size="sm" variant="default">
                                <ItemContent className="min-w-0">
                                  <ItemHeader className="flex-col items-start gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-3 sm:gap-y-2">
                                    <div className="min-w-0 flex-1">
                                      {destination ? (
                                        <ItemTitle className="w-full min-w-0 max-w-full items-start">
                                          <Link className="inline-flex min-w-0 max-w-full items-start gap-1 outline-none after:absolute after:inset-0 after:rounded-md" href={destination}>
                                            <span className="min-w-0 overflow-hidden line-clamp-2">
                                              {displayTitle}
                                            </span>
                                            <RowChevron className="mt-0.5" />
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
                                        {requestKindLabel}
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
                                  {appointmentRequest ? (
                                    <ItemDescription>{appointment ? t("home.actionRequired.appointment", { appointment: appointmentSummary(appointment, i18n.language, t) }) : t(cancelled ? "home.actionRequired.alreadyCancelled" : "home.actionRequired.noAppointment")}</ItemDescription>
                                  ) : null}
                                  {appointmentRequest ? (() => {
                                    const request = cancellationRequestDetails(item, i18n.language);
                                    return <>
                                      {!appointment && request.requested ? <ItemDescription>{t("home.actionRequired.requested", { details: request.requested })}</ItemDescription> : null}
                                      {reschedule && request.newTime ? <ItemDescription>{t("home.actionRequired.newTime", { time: request.newTime })}</ItemDescription> : null}
                                      {request.notes ? <ItemDescription>{t("home.actionRequired.notes", { notes: request.notes })}</ItemDescription> : null}
                                    </>;
                                  })() : null}
                                  <ItemFooter className="flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span>
                                      {formatDateTime(item.createdAt, i18n.language, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                      })}
                                    </span>
                                    <span className="flex items-center gap-2 sm:hidden">
                                      <Badge variant="secondary">
                                        {requestKindLabel}
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
                        </div>
                      ))}
                    </ItemGroup>
                </CardContent>
              </Card> : unansweredCount > 0 ? null : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.actionRequired.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.actionRequired.emptyDescription")}</p></div>}
          </section>
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-200 order-first flex flex-col gap-3 xl:h-full">
            <div className="flex items-center justify-between gap-4 px-1"><div className="flex items-center gap-3"><h2 className="type-section-title">{t("home.upcoming.title")}</h2><Link className="text-sm text-muted-foreground transition-colors hover:text-foreground" href="/appointments?view=list">{t("home.upcoming.viewAll")}</Link></div>{summary.isLoading ? <Skeleton className="h-6 w-12 rounded-full" /> : <Badge variant="outline">{(summary.data?.upcoming.length ?? 0).toLocaleString(intlLocale(i18n.language))}</Badge>}</div>
            {summary.isLoading ? <UpcomingSkeleton /> : summary.data?.upcoming.length ? (
              <Card className="ph-mask border-border/70 xl:flex-1"><CardContent className="flex flex-col gap-2">
                {summary.data.upcoming.map((appointment, index) => {
                  const contactName = getContactDisplayName({ name: appointment.contactName, phone: appointment.contactPhone, email: appointment.contactEmail, channels: [appointment.sourceChannel] }, i18n.language, t);
                  return <div key={appointment.id}>
                    {/* The whole row opens the appointment's details, as a row on the appointments page does. */}
                    <button className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50" onClick={() => setDetailsId(appointment.id)} type="button">
                      <span className="flex min-w-0 flex-wrap items-center gap-2"><span className="inline-flex min-w-0 items-center gap-1"><span className="type-item-title">{contactName}</span><RowChevron /></span><Badge variant="outline">{getAppointmentStatusLabel(appointment.status, t)}</Badge><Badge variant="secondary">{getChannelLabel(appointment.sourceChannel, t)}</Badge></span>
                      <span className="type-item-title text-right">{formatDateTime(appointment.startsAt, i18n.language, { weekday: "short", month: "short", day: "numeric", timeZone: appointment.timezone })}</span>
                      <span className="type-body-muted flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{appointment.serviceName ?? t("home.upcoming.unknownService")}</span>
                        {appointment.employeeName ? <>
                          <span aria-hidden="true">·</span>
                          <span className="sr-only">{t("home.upcoming.employee", { name: appointment.employeeName })}</span>
                          <span aria-hidden="true" className="inline-flex min-w-0 items-center gap-1"><UserRound className="size-3.5 shrink-0" /><span className="truncate">{appointment.employeeName}</span></span>
                        </> : null}
                      </span>
                      <span className="type-body-muted text-right">{formatDateTime(appointment.startsAt, i18n.language, { hour: "numeric", minute: "2-digit", timeZone: appointment.timezone })}</span>
                    </button>
                    {index < summary.data.upcoming.length - 1 ? <Separator className="mt-2" /> : null}
                  </div>;
                })}
              </CardContent></Card>
            ) : <div className="rounded-xl border border-dashed p-12 text-center xl:flex xl:flex-1 xl:flex-col xl:items-center xl:justify-center"><p className="type-empty-title">{t("home.upcoming.emptyTitle")}</p><p className="type-empty-description mt-2">{t("home.upcoming.emptyDescription")}</p></div>}
            <UpcomingDetails appointments={summary.data?.upcoming ?? []} id={detailsId} onClose={() => setDetailsId(null)} />
          </section>
        </div>
        {summary.isLoading ? <ResultsRowSkeleton titles={RESULT_KEYS.map((key) => t(`home.results.${key}`))} /> : results.length ? (
          <Surface className="grid sm:grid-cols-3">
            {results.map((result) => (
              <section className="flex min-w-0 flex-col gap-2 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0" key={result.key}>
                <h2 className="type-card-title text-foreground">{t(`home.results.${result.key}`)}</h2>
                <p className="text-4xl font-normal tracking-normal break-words text-foreground tabular-nums">{result.value}</p>
                {result.description ? <p className="type-meta">{result.description}</p> : null}
              </section>
            ))}
          </Surface>
        ) : null}
        {summary.isLoading ? <OverviewChartSkeleton chartTitle={t("home.chart.title")} recentCallsTitle={t("home.recentCalls.title")} /> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4"><CardHeader><CardTitle>{t("home.chart.title")}</CardTitle></CardHeader><CardContent className="ps-2"><OverviewCallChart data={(summary.data?.monthlyCalls ?? []).map((item) => ({ name: formatDateTime(item.monthStart, i18n.language, { month: "short", timeZone: "UTC" }), total: item.total }))} /></CardContent></Card>
          <Card className="ph-mask col-span-1 lg:col-span-3"><CardHeader><CardTitle>{t("home.recentCalls.title")}</CardTitle><CardDescription>{t("home.recentCalls.description", { count: summary.data?.recentCalls.length ?? 0 })}</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-6">{(summary.data?.recentCalls ?? []).map((call) => <div className="flex items-center gap-4" key={call.id}><Avatar className="h-9 w-9"><AvatarFallback>{initials(call.contactName)}</AvatarFallback></Avatar><div className="flex flex-1 flex-wrap items-center justify-between"><div className="flex flex-col gap-1"><p className="type-item-title leading-none">{getContactDisplayName({ name: call.contactName, phone: call.contactPhone, email: call.contactEmail, channels: [call.transport] }, i18n.language, t)}</p><p className="type-body-muted">{call.contactName && hasDisplayablePhone(call.contactPhone) ? formatPhoneNumberDisplay(call.contactPhone, i18n.language) : formatDateTime(call.startedAt, i18n.language, { dateStyle: "medium", timeStyle: "short" })}</p></div><div className="type-item-title">{call.durationSeconds ? t("home.recentCalls.durationValue", { value: call.durationSeconds }) : call.status}</div></div></div>)}</div></CardContent></Card>
        </div>}
      </div>
    </div>
  );
}

const RESULT_KEYS = ["bookedValue", "timeSaved", "withoutTransfer"] as const;

type DashboardT = ReturnType<typeof useTranslation<"dashboard">>["t"];

/** Home's results row, each compared with the 30 days before. */
function homeResults(results: AnalyticsResultsViewModel, language: string, t: DashboardT): Array<{ key: (typeof RESULT_KEYS)[number]; value: string; description: string | null }> {
  const withoutTransfer = results.callsWithoutTransferPercent;
  const points = new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: 1 });
  return [
    { key: "bookedValue", value: formatBookedValue(results.bookedValue.current, results.bookedValue.currency, language), description: formatPercentDelta(results.bookedValue.current, results.bookedValue.previous, t) },
    { key: "timeSaved", value: formatTimeSaved(results.timeSavedSeconds.current, language), description: formatPercentDelta(results.timeSavedSeconds.current, results.timeSavedSeconds.previous, t) },
    {
      key: "withoutTransfer",
      value: withoutTransfer.current == null ? "—" : new Intl.NumberFormat(intlLocale(language), { style: "percent", maximumFractionDigits: 1 }).format(withoutTransfer.current / 100),
      // A share moves in percentage points, and there's nothing to compare while either period has no calls.
      description: withoutTransfer.current == null ? null
        : withoutTransfer.previous == null ? t("delta.noPreviousCalls")
        : withoutTransfer.current === withoutTransfer.previous ? t("delta.flat")
        : t(withoutTransfer.current > withoutTransfer.previous ? "delta.pointsUp" : "delta.pointsDown", { value: points.format(Math.abs(withoutTransfer.current - withoutTransfer.previous)) }),
    },
  ];
}

function formatPercentDelta(current: number, previous: number, t: DashboardT): string {
  if (current === previous) return t("delta.flat");
  const value = previous === 0 ? 100 : ((current - previous) / previous) * 100;
  return value > 0 ? t("delta.up", { value: Math.abs(value).toFixed(1) }) : t("delta.down", { value: Math.abs(value).toFixed(1) });
}

/** The details sheet the appointments page uses, for the Upcoming row that was clicked. */
function UpcomingDetails({ appointments, id, onClose }: { appointments: DashboardSummary["upcoming"]; id: string | null; onClose: () => void }) {
  const { i18n, t } = useTranslation("dashboard");
  const row = id ? appointments.find((appointment) => appointment.id === id) : undefined;
  const appointment: Appointment | undefined = row ? { ...row, serviceName: row.serviceName ?? t("home.upcoming.unknownService"), staffName: row.staffName ?? "" } : undefined;
  const contactName = row ? getContactDisplayName({ name: row.contactName, phone: row.contactPhone, email: row.contactEmail, channels: [row.sourceChannel] }, i18n.language, t) : "";
  return <AppointmentDetailsSheet appointment={appointment} contactName={contactName} onOpenChange={(open) => { if (!open) onClose(); }} />;
}

function ActionRequiredSkeleton() {
  return (
    <Card aria-busy="true" className="border-border/70">
      <CardContent>
        <ItemGroup className="has-data-[size=sm]:gap-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="border-b py-4 first:pt-0 last:border-b-0 last:pb-0" key={index}>
              <Item className="p-0" size="sm" variant="default">
                <ItemContent className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
                  </div>
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </ItemContent>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

function UpcomingSkeleton() {
  return (
    <Card aria-busy="true" className="border-border/70">
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24 justify-self-end" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-14 justify-self-end" />
            </div>
            {index < 2 ? <Separator className="mt-2" /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OverviewChartSkeleton({ chartTitle, recentCallsTitle }: { chartTitle: string; recentCallsTitle: string }) {
  return (
    <div aria-busy="true" className="grid grid-cols-1 gap-4 lg:grid-cols-7">
      <Card className="col-span-1 lg:col-span-4">
        <CardHeader>
          <CardTitle>{chartTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[350px] w-full" />
        </CardContent>
      </Card>
      <Card className="col-span-1 lg:col-span-3">
        <CardHeader>
          <CardTitle>{recentCallsTitle}</CardTitle>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="flex items-center gap-4" key={index}>
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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

function getActionDisplayTitle(
  item: DashboardSummary["actionRequired"][number],
  t: ReturnType<typeof useTranslation<"dashboard">>["t"],
): string {
  if (isAppointmentRequest(item.request)) {
    // The stored body is English, so the title is rebuilt from the contact name.
    const name = extractFollowUpContactName(item.title, item.kind);
    const message = t(appointmentRequestKind(item.request) === "reschedule" ? "home.actionRequired.rescheduleRequest" : "home.actionRequired.cancellationRequest");
    return name ? t("home.actionRequired.titleWithContact", { message, name }) : message;
  }
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

