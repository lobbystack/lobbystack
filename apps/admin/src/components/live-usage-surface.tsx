"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { billingPlanCatalog, type BillingPlanSlug } from "@lobbystack/shared";

import type { BillingUsageViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { SectionBlock } from "@/components/section-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";

function isPlan(value: string | null | undefined): value is BillingPlanSlug { return value != null && value in billingPlanCatalog; }

export function LiveUsageSurface() {
  const { i18n, t } = useTranslation("settings");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const accountPlan = billing.data?.account?.plan;
  const plan = isPlan(accountPlan) ? accountPlan : "free_cloud";
  const catalog = billingPlanCatalog[plan];
  const status = billing.data?.usageStatus;
  const resetAt = billing.data?.account?.currentPeriodEnd;

  if (businesses.isLoading || billing.isLoading) return <UsageSkeleton />;
  if (businesses.isError || billing.isError) return <Surface className="p-6 text-sm text-destructive">Usage data is unavailable.</Surface>;
  if (plan === "self_host") return <SectionBlock title={t("billing.usage.title")}><Surface className="p-6"><p className="text-[15px] leading-6 text-muted-foreground">{t("billing.currentPlan.selfHostNotice")}</p></Surface></SectionBlock>;

  const description = resetAt ? t("billing.usage.description", { resetAt: new Intl.DateTimeFormat(i18n.language, { month: "long", day: "numeric" }).format(new Date(resetAt)) }) : undefined;
  return <div className="flex w-full flex-col gap-10"><SectionBlock description={description} title={t("billing.usage.title")}><Surface className="p-0">{status ? <>
    <UsageMeter blocked={status.voiceBlocked} included={catalog.voiceSecondsIncluded === null ? null : catalog.voiceSecondsIncluded / 60} label={t("billing.usage.voiceTitle")} unit={t("billing.usage.units.voice")} used={Math.round((status.voiceSecondsUsed / 60) * 10) / 10} />
    <UsageMeter blocked={status.outboundCallAttemptsBlocked} included={catalog.outboundCallAttemptsIncluded} label={t("billing.usage.outboundAttemptsTitle")} unit={t("billing.usage.units.outboundAttempts")} used={status.outboundCallAttemptsUsed} />
    <UsageMeter blocked={status.alertSmsBlocked} included={catalog.alertSmsSegmentsIncluded} label={t("billing.usage.alertSmsTitle")} unit={t("billing.usage.units.segments")} used={status.alertSmsSegmentsUsed} />
    <div className="px-6 py-5"><div className="flex items-center justify-between gap-4"><span className="text-[15px] font-medium leading-6">{t("billing.usage.knowledgeTitle")}</span><span className="text-[15px] leading-6 text-muted-foreground">—</span></div></div>
  </> : <div className="p-6 text-[15px] text-muted-foreground">No usage has been recorded for this period.</div>}</Surface></SectionBlock></div>;
}

function UsageMeter({ label, used, included, unit, blocked }: { label: string; used: number; included: number | null; unit: string; blocked: boolean }) {
  const percentage = included && included > 0 ? Math.min(100, (used / included) * 100) : 0;
  return <div className="border-b border-border px-6 py-5 last:border-b-0"><div className="flex flex-col gap-2"><div className="flex items-center justify-between gap-4"><span className="text-[15px] font-medium leading-6">{label}</span><span className="text-[15px] leading-6 text-muted-foreground tabular-nums">{used.toLocaleString()} {included === null ? "" : `/ ${included.toLocaleString()} `}{unit}</span></div>{included !== null && included > 0 ? <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><div className={blocked ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-foreground transition-all duration-700"} style={{ width: `${percentage}%` }} /></div> : null}{blocked ? <span className="text-sm leading-6 text-destructive">Limit reached — usage is paused until the next period.</span> : null}</div></div>;
}

function UsageSkeleton() { return <div className="flex flex-col gap-3"><div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-44" /></div><Surface>{Array.from({ length: 4 }).map((_, index) => <div className="space-y-2 border-b px-6 py-5 last:border-b-0" key={index}><div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-24" /></div><Skeleton className="h-1.5 w-full rounded-full" /></div>)}</Surface></div>; }
