import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  FileText,
  Gauge,
  MessageSquare,
  Phone,
  PhoneOutgoing,
  Sparkles,
  Zap,
} from "lucide-react";

import type { BillingStatus, BillingPlanSlug } from "@ai-receptionist/shared";
import { billingAddonCatalog, billingPlanCatalog } from "@ai-receptionist/shared";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ─── Props ─────────────────────────────────────────────────────────── */

type SettingsBillingPageProps = {
  businessId: Id<"businesses">;
};

/* ─── Formatters ────────────────────────────────────────────────────── */

function formatCurrencyFromCents(
  cents: number | null,
  locale: string,
  currency = "USD",
): string | null {
  if (cents === null) {
    return null;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatVoiceMinutes(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: seconds % 60 === 0 ? 0 : 1,
    maximumFractionDigits: seconds % 60 === 0 ? 0 : 1,
  }).format(seconds / 60);
}

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getPlanLabel(plan: BillingPlanSlug, t: (key: string) => string): string {
  switch (plan) {
    case "self_host":
      return t("billing.planLabels.selfHost");
    case "free_cloud":
      return t("billing.planLabels.freeCloud");
    case "pro":
      return t("billing.planLabels.pro");
    case "enterprise":
      return t("billing.planLabels.enterprise");
  }
}

/* ─── Loading skeleton ──────────────────────────────────────────────── */

function BillingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Plan overview skeleton */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.6fr]">
        <Skeleton className="h-52 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
      {/* Usage skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

/* ─── Usage meter ───────────────────────────────────────────────────── */

function UsageMeter(props: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
  progressValue?: number | undefined;
  accentClass: string;
}) {
  const isHigh = (props.progressValue ?? 0) >= 80;
  const isFull = (props.progressValue ?? 0) >= 100;

  return (
    <Card size="sm" className="relative overflow-hidden">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              props.accentClass,
            )}
          >
            {props.icon}
          </div>
          {props.progressValue !== undefined && (
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                isFull
                  ? "text-destructive"
                  : isHigh
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {Math.round(props.progressValue)}%
            </span>
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-muted-foreground">
            {props.title}
          </p>
          <p className="text-xl font-semibold tracking-tight">{props.value}</p>
        </div>

        {props.progressValue !== undefined ? (
          <Progress value={props.progressValue}>
            <ProgressLabel className="sr-only">{props.title}</ProgressLabel>
            <ProgressValue className="sr-only" />
          </Progress>
        ) : null}

        <p className="text-xs text-muted-foreground">{props.description}</p>
      </CardContent>
    </Card>
  );
}

/* ─── Plan comparison card ──────────────────────────────────────────── */

function PlanCard(props: {
  name: string;
  description: string;
  details?: string;
  overageDetails?: string;
  isCurrentPlan: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-xl border p-5 transition-colors",
        props.highlighted
          ? "border-primary/30 bg-primary/[0.03] dark:border-primary/20 dark:bg-primary/[0.04]"
          : "border-border bg-card",
        props.isCurrentPlan && "ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">{props.name}</h3>
        {props.isCurrentPlan && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            Current
          </Badge>
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {props.description}
      </p>
      {props.details && (
        <p className="text-xs leading-relaxed text-muted-foreground/80">
          {props.details}
        </p>
      )}
      {props.overageDetails && (
        <p className="text-xs leading-relaxed text-muted-foreground/80">
          {props.overageDetails}
        </p>
      )}
    </div>
  );
}

/* ─── Main billing page ─────────────────────────────────────────────── */

export function SettingsBillingPage({ businessId }: SettingsBillingPageProps) {
  const { i18n, t } = useTranslation("settings");
  const [searchParams, setSearchParams] = useSearchParams();
  const billingStatus = useQuery(api.billing.getStatus, {
    businessId,
  }) as BillingStatus | undefined;
  const startCheckout = useAction(api.billing.startCheckout);
  const openPortal = useAction(api.billing.openPortal);
  const [checkoutTargetInFlight, setCheckoutTargetInFlight] = useState<"pro" | "ai_sms" | null>(
    null,
  );
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") {
      return;
    }

    toast.success(t("billing.toast.checkoutSuccess"));
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const usageCards = useMemo(() => {
    if (!billingStatus) {
      return [];
    }

    const voiceProgress =
      billingStatus.usage.voiceSecondsIncluded === null
        ? undefined
        : Math.min(
            100,
            (billingStatus.usage.voiceSecondsUsed /
              Math.max(1, billingStatus.usage.voiceSecondsIncluded)) *
              100,
          );
    const alertSmsProgress =
      billingStatus.usage.alertSmsSegmentsIncluded === null
        ? undefined
        : Math.min(
            100,
            (billingStatus.usage.alertSmsSegmentsUsed /
              Math.max(1, billingStatus.usage.alertSmsSegmentsIncluded)) *
              100,
          );
    const outboundAttemptsProgress =
      billingStatus.usage.outboundCallAttemptsIncluded === null
        ? undefined
        : Math.min(
            100,
            (billingStatus.usage.outboundCallAttemptsUsed /
              Math.max(1, billingStatus.usage.outboundCallAttemptsIncluded)) *
              100,
          );

    return [
      {
        key: "voice",
        icon: <Phone className="size-4 text-chart-1" />,
        accentClass: "bg-chart-1/10",
        title: t("billing.usage.voiceTitle"),
        value: t("billing.usage.voiceValue", {
          minutes: formatVoiceMinutes(billingStatus.usage.voiceSecondsUsed, i18n.language),
        }),
        description:
          billingStatus.usage.voiceSecondsRemaining === null
            ? t("billing.usage.overageEnabled")
            : t("billing.usage.voiceRemaining", {
                minutes: formatVoiceMinutes(
                  billingStatus.usage.voiceSecondsRemaining,
                  i18n.language,
                ),
              }),
        progressValue: voiceProgress,
      },
      {
        key: "alert_sms",
        icon: <MessageSquare className="size-4 text-chart-2" />,
        accentClass: "bg-chart-2/10",
        title: t("billing.usage.alertSmsTitle"),
        value: t("billing.usage.alertSmsValue", {
          count: billingStatus.usage.alertSmsSegmentsUsed,
          formattedCount: formatCount(
            billingStatus.usage.alertSmsSegmentsUsed,
            i18n.language,
          ),
        }),
        description:
          billingStatus.usage.alertSmsSegmentsRemaining === null
            ? t("billing.usage.overageEnabled")
            : t("billing.usage.alertSmsRemaining", {
                count: billingStatus.usage.alertSmsSegmentsRemaining,
                formattedCount: formatCount(
                  billingStatus.usage.alertSmsSegmentsRemaining,
                  i18n.language,
                ),
              }),
        progressValue: alertSmsProgress,
      },
      {
        key: "outbound_attempts",
        icon: <PhoneOutgoing className="size-4 text-chart-3" />,
        accentClass: "bg-chart-3/10",
        title: t("billing.usage.outboundAttemptsTitle"),
        value: t("billing.usage.outboundAttemptsValue", {
          count: billingStatus.usage.outboundCallAttemptsUsed,
          formattedCount: formatCount(
            billingStatus.usage.outboundCallAttemptsUsed,
            i18n.language,
          ),
        }),
        description:
          billingStatus.usage.outboundCallAttemptsRemaining === null
            ? t("billing.usage.overageEnabled")
            : t("billing.usage.outboundAttemptsRemaining", {
                count: billingStatus.usage.outboundCallAttemptsRemaining,
                formattedCount: formatCount(
                  billingStatus.usage.outboundCallAttemptsRemaining,
                  i18n.language,
                ),
              }),
        progressValue: outboundAttemptsProgress,
      },
      {
        key: "ai_sms",
        icon: <Sparkles className="size-4 text-chart-4" />,
        accentClass: "bg-chart-4/10",
        title: t("billing.usage.aiSmsTitle"),
        value: t("billing.usage.aiSmsValue", {
          count: billingStatus.usage.aiSmsSegmentsUsed,
          formattedCount: formatCount(
            billingStatus.usage.aiSmsSegmentsUsed,
            i18n.language,
          ),
        }),
        description: billingStatus.aiSmsEnabled
          ? t("billing.usage.aiSmsMetered")
          : t("billing.usage.aiSmsLocked"),
      },
    ];
  }, [billingStatus, i18n.language, t]);

  if (!billingStatus) {
    return <BillingSkeleton />;
  }

  async function handleStartCheckout(target: "pro" | "ai_sms"): Promise<void> {
    setCheckoutTargetInFlight(target);
    try {
      const result = await startCheckout({
        businessId,
        target,
      });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("billing.toast.checkoutFailed"));
    } finally {
      setCheckoutTargetInFlight(null);
    }
  }

  async function handleOpenPortal(): Promise<void> {
    setIsOpeningPortal(true);
    try {
      const result = await openPortal({ businessId });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("billing.toast.portalFailed"));
    } finally {
      setIsOpeningPortal(false);
    }
  }

  const planPrice =
    billingStatus.monthlyChargeCents === null
      ? t("billing.currentPlan.customPricing")
      : t("billing.currentPlan.monthlyChargeValue", {
          amount:
            formatCurrencyFromCents(
              billingStatus.monthlyChargeCents,
              i18n.language,
            ) ?? "$0.00",
        });

  return (
    <div className="space-y-8 pb-12">
      {/* ─── Plan overview ──────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.48fr]">
        {/* Left: active plan hero */}
        <Card className="relative overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-lg">{t("billing.currentPlan.title")}</CardTitle>
              <Badge variant="outline">{getPlanLabel(billingStatus.plan, t)}</Badge>
              {billingStatus.aiSmsEnabled && (
                <Badge variant="secondary">
                  <Sparkles className="mr-1 size-3" />
                  {t("billing.addon.aiSmsActiveBadge")}
                </Badge>
              )}
            </div>
            <CardDescription>{t("billing.currentPlan.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Plan + price + state */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("billing.currentPlan.planLabel")}
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {getPlanLabel(billingStatus.plan, t)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {planPrice}
                </p>
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {billingStatus.plan === "free_cloud" &&
              billingStatus.availableCheckoutPlans.includes("pro") ? (
                <Button
                  disabled={checkoutTargetInFlight !== null}
                  onClick={() => void handleStartCheckout("pro")}
                  type="button"
                >
                  <Zap className="mr-1.5 size-3.5" />
                  {checkoutTargetInFlight === "pro"
                    ? t("billing.actions.openingCheckout")
                    : t("billing.actions.upgradeToPro")}
                </Button>
              ) : null}

              {billingStatus.canPurchaseAiSmsAddon ? (
                <Button
                  disabled={checkoutTargetInFlight !== null}
                  onClick={() => void handleStartCheckout("ai_sms")}
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="mr-1.5 size-3.5" />
                  {checkoutTargetInFlight === "ai_sms"
                    ? t("billing.actions.openingCheckout")
                    : t("billing.actions.unlockAiSms")}
                </Button>
              ) : null}

              {billingStatus.hasCustomerPortalAccess ? (
                <Button
                  disabled={isOpeningPortal}
                  onClick={() => void handleOpenPortal()}
                  type="button"
                  variant="outline"
                >
                  <CreditCard className="mr-1.5 size-3.5" />
                  {isOpeningPortal
                    ? t("billing.actions.openingPortal")
                    : t("billing.actions.manageBilling")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Right: quick info tiles */}
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent className="flex items-center gap-4 pt-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Gauge className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("billing.currentPlan.includedNumberTitle")}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {billingStatus.includedBusinessNumbers === null
                    ? t("billing.currentPlan.customIncludedNumbers")
                    : t("billing.currentPlan.includedNumberValue", {
                        count: billingStatus.includedBusinessNumbers,
                      })}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="flex items-center gap-4 pt-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <CreditCard className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("billing.currentPlan.billingContactTitle")}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {billingStatus.billingContactEmail ??
                    billingStatus.billingContactName ??
                    t("billing.currentPlan.billingContactMissing")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="flex items-center gap-4 pt-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Check className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("billing.currentPlan.subscriptionStateTitle")}
                </p>
                <p className="truncate text-sm capitalize text-muted-foreground">
                  {billingStatus.subscriptionState}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Usage meters ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {t("billing.usage.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("billing.usage.description", {
                resetAt: formatTimestamp(billingStatus.usage.resetAt, i18n.language),
              })}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {usageCards.map(({ key, ...card }) => (
            <UsageMeter key={key} {...card} />
          ))}
        </div>
      </section>

      {/* ─── Hosted offers ──────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t("billing.catalog.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("billing.catalog.description")}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <PlanCard
            name={t("billing.planLabels.selfHost")}
            description={t("billing.catalog.selfHostDescription")}
            isCurrentPlan={billingStatus.plan === "self_host"}
          />

          <PlanCard
            name={t("billing.planLabels.freeCloud")}
            description={t("billing.catalog.freeCloudDescription")}
            details={t("billing.catalog.freeCloudLimits", {
              voiceMinutes: formatVoiceMinutes(
                billingPlanCatalog.free_cloud.voiceSecondsIncluded ?? 0,
                i18n.language,
              ),
              alertSmsSegments: formatCount(
                billingPlanCatalog.free_cloud.alertSmsSegmentsIncluded ?? 0,
                i18n.language,
              ),
              outboundAttempts: formatCount(
                billingPlanCatalog.free_cloud.outboundCallAttemptsIncluded ?? 0,
                i18n.language,
              ),
            })}
            isCurrentPlan={billingStatus.plan === "free_cloud"}
          />

          <PlanCard
            name={t("billing.planLabels.pro")}
            description={t("billing.catalog.proDescription", {
              amount:
                formatCurrencyFromCents(
                  billingPlanCatalog.pro.monthlyChargeCents,
                  i18n.language,
                ) ?? "$15.00",
            })}
            details={t("billing.catalog.proOverages", {
              voiceRate:
                formatCurrencyFromCents(
                  billingPlanCatalog.pro.voiceOverageRatePerMinuteCents,
                  i18n.language,
                ) ?? "$0.18",
              alertSmsRate:
                formatCurrencyFromCents(
                  billingPlanCatalog.pro.alertSmsOverageRatePerSegmentCents,
                  i18n.language,
                ) ?? "$0.02",
              outboundAttemptRate:
                formatCurrencyFromCents(
                  billingPlanCatalog.pro.outboundCallAttemptOverageRateCents,
                  i18n.language,
                ) ?? "$0.02",
            })}
            overageDetails={t("billing.catalog.aiSmsAddon", {
              monthly:
                formatCurrencyFromCents(
                  billingAddonCatalog.ai_sms.recurringMonthlyChargeCents,
                  i18n.language,
                ) ?? "$5.00",
              setup:
                formatCurrencyFromCents(
                  billingAddonCatalog.ai_sms.oneTimeSetupChargeCents,
                  i18n.language,
                ) ?? "$19.00",
              usage:
                formatCurrencyFromCents(
                  billingAddonCatalog.ai_sms.usageRatePerSegmentCents,
                  i18n.language,
                ) ?? "$0.03",
            })}
            isCurrentPlan={billingStatus.plan === "pro"}
            highlighted
          />
        </div>
      </section>

      {/* ─── Transactions ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t("billing.transactions.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("billing.transactions.description")}
          </p>
        </div>

        <Card>
          <CardContent className="pt-0">
            {billingStatus.recentTransactions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <FileText className="size-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("billing.transactions.empty")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {billingStatus.recentTransactions.map((transaction) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-5"
                    key={`${transaction.kind}-${transaction.sourceId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {transaction.kind === "refund" ? (
                          <ArrowUpRight className="size-3.5 text-muted-foreground" />
                        ) : (
                          <CreditCard className="size-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {transaction.description ?? transaction.status}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(transaction.occurredAt, i18n.language)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrencyFromCents(
                          transaction.amountCents,
                          i18n.language,
                          transaction.currency.toUpperCase(),
                        )}
                      </p>
                      {transaction.invoiceUrl ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <Button
                              render={
                                <a href={transaction.invoiceUrl} rel="noreferrer" target="_blank" />
                              }
                              size="icon-sm"
                              variant="ghost"
                            >
                              <FileText className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("billing.transactions.invoice")}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
