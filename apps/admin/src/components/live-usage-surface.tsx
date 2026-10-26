"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { billingPlanCatalog } from "@lobbystack/shared";

import type { AllowanceUsage } from "@lobbystack/domain";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { useActiveBusiness } from "@/hooks/use-active-business";
import type { BillingUsageViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { SectionBlock } from "@/components/section-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { intlLocale } from "@/lib/locale";

/**
 * Settings > Usage. A business with billing shows its plan's meters, as
 * before. A partner's business has no billing, so it shows its minutes and
 * chats this month against its allowance, without the host's plans or prices,
 * and on a package, what it used past the allowance, which its partner bills.
 */
export function LiveUsageSurface() {
  const can = useBusinessCan();
  return can("billing") ? <PlanUsageSurface /> : <AllowanceUsageSurface />;
}

function PlanUsageSurface() {
  const { i18n, t } = useTranslation("settings");
  const { businesses, business } = useActiveBusiness();
  const billing = useQuery({ queryKey: ["billing", business?.businessId], queryFn: () => requestJson<BillingUsageViewModel>(`/api/billing?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  const plan = billing.data?.effectivePlan ?? "free_cloud";
  const catalog = billingPlanCatalog[plan];
  const status = billing.data?.usageStatus ?? {
    voiceSecondsUsed: 0,
    alertSmsSegmentsUsed: 0,
    outboundCallAttemptsUsed: 0,
    voiceBlocked: false,
    alertSmsBlocked: false,
    outboundCallAttemptsBlocked: false,
    overageSpendCents: 0,
    overageSpendingCapCents: null,
    overageSpendingCapReached: false,
    usageComplete: true,
  };
  const resetAt = billing.data?.account?.currentPeriodEnd ?? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();

  if (businesses.isLoading || billing.isLoading) return <UsageSkeleton />;
  if (businesses.isError || billing.isError) return <Surface className="flex flex-col items-start gap-4 p-6"><p role="alert">{t("billing.usage.unavailable")}</p><Button variant="outline" onClick={() => { if (businesses.isError || !business) void businesses.refetch(); else void billing.refetch(); }}>{t("billing.actions.retry")}</Button></Surface>;
  if (plan === "self_host") return <SectionBlock title={t("billing.usage.title")}><Surface className="p-6"><p className="text-[15px] leading-6 text-muted-foreground">{t("billing.currentPlan.selfHostNotice")}</p></Surface></SectionBlock>;

  const description = resetAt ? t("billing.usage.description", { resetAt: new Intl.DateTimeFormat(intlLocale(i18n.language), { month: "long", day: "numeric" }).format(new Date(resetAt)) }) : undefined;
  return <div className="flex w-full flex-col gap-10"><SectionBlock description={description} title={t("billing.usage.title")}><Surface className="p-0"><>
    <UsageMeter blocked={status.voiceBlocked} included={catalog.voiceSecondsIncluded === null ? null : catalog.voiceSecondsIncluded / 60} label={t("billing.usage.voiceTitle")} unit={t("billing.usage.units.voice")} used={Math.round((status.voiceSecondsUsed / 60) * 10) / 10} />
    <UsageMeter blocked={status.outboundCallAttemptsBlocked} included={catalog.outboundCallAttemptsIncluded} label={t("billing.usage.outboundAttemptsTitle")} unit={t("billing.usage.units.outboundAttempts")} used={status.outboundCallAttemptsUsed} />
    <UsageMeter blocked={status.alertSmsBlocked} included={catalog.alertSmsSegmentsIncluded} label={t("billing.usage.alertSmsTitle")} unit={t("billing.usage.units.segments")} used={status.alertSmsSegmentsUsed} />
    <UsageMeter blocked={false} included={catalog.knowledgeStorageBytes === null ? null : catalog.knowledgeStorageBytes / (1024 * 1024)} label={t("billing.usage.knowledgeTitle")} unit={t("billing.usage.units.storage")} showUsedUnit used={Math.round(((billing.data?.knowledgeStorageBytesUsed ?? 0) / (1024 * 1024)) * 100) / 100} />
  </></Surface></SectionBlock></div>;
}

function AllowanceUsageSurface() {
  const { i18n, t } = useTranslation("settings");
  const { businesses, business } = useActiveBusiness();
  const usage = useQuery({ queryKey: ["usage", business?.businessId], queryFn: () => requestJson<AllowanceUsage>(`/api/usage?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  if (businesses.isLoading || usage.isLoading) return <UsageSkeleton rows={2} />;
  if (businesses.isError || usage.isError || !usage.data) return <Surface className="flex flex-col items-start gap-4 p-6"><p role="alert">{t("billing.usage.unavailable")}</p><Button variant="outline" onClick={() => { if (businesses.isError || !business) void businesses.refetch(); else void usage.refetch(); }}>{t("billing.actions.retry")}</Button></Surface>;
  const { voiceSeconds, chats, resetsAt, overage } = usage.data;
  // Periods run in UTC, so the reset day is read in UTC too.
  const description = t("billing.usage.description", { resetAt: new Intl.DateTimeFormat(intlLocale(i18n.language), { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(resetsAt)) });
  // Usage past the allowance shows while overage is on, and after it went off if the month already had some.
  const extra = overage && (overage.enabled || overage.voiceSeconds > 0 || overage.chats > 0) ? overage : null;
  return <div className="flex w-full flex-col gap-10"><SectionBlock description={description} title={t("billing.usage.allowanceTitle")}><Surface className="p-0"><>
    <UsageMeter blocked={voiceSeconds.blocked} included={voiceSeconds.included === null ? null : voiceSeconds.included / 60} label={t("billing.usage.voiceTitle")} noLimit unit={t("billing.usage.units.voice")} used={Math.round((voiceSeconds.used / 60) * 10) / 10} />
    <UsageMeter blocked={chats.blocked} included={chats.included} label={t("billing.usage.chatsTitle")} noLimit unit={t("billing.usage.units.chats")} used={chats.used} />
  </></Surface></SectionBlock>{extra ? <SectionBlock description={t(extra.enabled ? "billing.usage.extraOnDescription" : "billing.usage.extraOffDescription")} title={t("billing.usage.extraTitle")}><Surface className="p-0"><>
    <ExtraUsageRow label={t("billing.usage.voiceTitle")} unit={t("billing.usage.units.voice")} used={Math.round((extra.voiceSeconds / 60) * 10) / 10} />
    <ExtraUsageRow label={t("billing.usage.chatsTitle")} unit={t("billing.usage.units.chats")} used={extra.chats} />
  </></Surface></SectionBlock> : null}</div>;
}

/** What a business used past its allowance this month, with no price: only its partner's invoices show those. */
function ExtraUsageRow({ label, used, unit }: { label: string; used: number; unit: string }) {
  const { i18n } = useTranslation("settings");
  return <div className="border-b border-border px-6 py-5 last:border-b-0"><div className="flex items-center justify-between gap-4"><span className="text-[15px] font-medium leading-6">{label}</span><span className="text-[15px] leading-6 text-muted-foreground tabular-nums">{used.toLocaleString(intlLocale(i18n.language))} {unit}</span></div></div>;
}

function UsageMeter({ label, used, included, unit, blocked, showUsedUnit = false, noLimit = false }: { label: string; used: number; included: number | null; unit: string; blocked: boolean; showUsedUnit?: boolean; noLimit?: boolean }) {
  const { i18n, t } = useTranslation("settings");
  const percentage = included && included > 0 ? Math.min(100, (used / included) * 100) : 0;
  return <div className="border-b border-border px-6 py-5 last:border-b-0"><div className="flex flex-col gap-2"><div className="flex items-center justify-between gap-4"><span className="text-[15px] font-medium leading-6">{label}</span><span className="text-[15px] leading-6 text-muted-foreground tabular-nums">{included === null ? t(noLimit ? "billing.usage.noLimit" : "billing.usage.customAllowance", { used: used.toLocaleString(intlLocale(i18n.language)), unit }) : <>{used.toLocaleString(intlLocale(i18n.language))}{showUsedUnit ? ` ${unit}` : ""} / {included.toLocaleString(intlLocale(i18n.language))} {unit}</>}</span></div>{included !== null && included > 0 ? <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><div className={blocked ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-foreground transition-all duration-700"} style={{ width: `${percentage}%` }} /></div> : null}{blocked ? <span className="text-sm leading-6 text-destructive">{t("billing.usage.blockedDescription")}</span> : null}</div></div>;
}

function UsageSkeleton({ rows = 4 }: { rows?: number }) { return <div className="flex flex-col gap-3"><div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-44" /></div><Surface>{Array.from({ length: rows }).map((_, index) => <div className="space-y-2 border-b px-6 py-5 last:border-b-0" key={index}><div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-24" /></div><Skeleton className="h-1.5 w-full rounded-full" /></div>)}</Surface></div>; }
