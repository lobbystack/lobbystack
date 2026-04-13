import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type SettingsBillingPageProps = {
  businessId: Id<"businesses">;
};

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

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function UsageCard(props: {
  title: string;
  value: string;
  description: string;
  progressValue?: number | undefined;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{props.title}</p>
        <p className="text-xl font-semibold tracking-tight text-foreground">{props.value}</p>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </div>
      {props.progressValue !== undefined ? (
        <Progress className="mt-4" value={props.progressValue} />
      ) : null}
    </div>
  );
}

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
    return <PlanSkeleton />;
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

  return (
    <div className="flex flex-col gap-6 pb-12">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{t("billing.currentPlan.title")}</CardTitle>
            <Badge variant="outline">{getPlanLabel(billingStatus.plan, t)}</Badge>
            {billingStatus.aiSmsEnabled ? (
              <Badge variant="secondary">{t("billing.addon.aiSmsActiveBadge")}</Badge>
            ) : null}
          </div>
          <CardDescription>{t("billing.currentPlan.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
            <p className="text-sm text-muted-foreground">{t("billing.currentPlan.planLabel")}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {getPlanLabel(billingStatus.plan, t)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {billingStatus.monthlyChargeCents === null
                ? t("billing.currentPlan.customPricing")
                : t("billing.currentPlan.monthlyChargeValue", {
                    amount:
                      formatCurrencyFromCents(
                        billingStatus.monthlyChargeCents,
                        i18n.language,
                      ) ?? "$0.00",
                  })}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {billingStatus.plan === "free_cloud" &&
              billingStatus.availableCheckoutPlans.includes("pro") ? (
                <Button
                  disabled={checkoutTargetInFlight !== null}
                  onClick={() => void handleStartCheckout("pro")}
                  type="button"
                >
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
                  {isOpeningPortal
                    ? t("billing.actions.openingPortal")
                    : t("billing.actions.manageBilling")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              <p className="text-sm font-medium text-foreground">
                {t("billing.currentPlan.includedNumberTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingStatus.includedBusinessNumbers === null
                  ? t("billing.currentPlan.customIncludedNumbers")
                  : t("billing.currentPlan.includedNumberValue", {
                      count: billingStatus.includedBusinessNumbers,
                    })}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              <p className="text-sm font-medium text-foreground">
                {t("billing.currentPlan.billingContactTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingStatus.billingContactEmail ??
                  billingStatus.billingContactName ??
                  t("billing.currentPlan.billingContactMissing")}
              </p>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              <p className="text-sm font-medium text-foreground">
                {t("billing.currentPlan.subscriptionStateTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {billingStatus.subscriptionState}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.usage.title")}</CardTitle>
          <CardDescription>
            {t("billing.usage.description", {
              resetAt: formatTimestamp(billingStatus.usage.resetAt, i18n.language),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {usageCards.map(({ key, ...card }) => (
            <UsageCard key={key} {...card} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.catalog.title")}</CardTitle>
          <CardDescription>{t("billing.catalog.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {t("billing.planLabels.selfHost")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("billing.catalog.selfHostDescription")}
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {t("billing.planLabels.freeCloud")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("billing.catalog.freeCloudDescription")}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("billing.catalog.freeCloudLimits", {
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
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
            <p className="text-lg font-semibold tracking-tight text-foreground">
              {t("billing.planLabels.pro")}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("billing.catalog.proDescription", {
                amount:
                  formatCurrencyFromCents(
                    billingPlanCatalog.pro.monthlyChargeCents,
                    i18n.language,
                  ) ?? "$15.00",
              })}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("billing.catalog.proOverages", {
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
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("billing.catalog.aiSmsAddon", {
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
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.transactions.title")}</CardTitle>
          <CardDescription>{t("billing.transactions.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {billingStatus.recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("billing.transactions.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {billingStatus.recentTransactions.map((transaction) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-4"
                  key={`${transaction.kind}-${transaction.sourceId}`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {transaction.description ?? transaction.status}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTimestamp(transaction.occurredAt, i18n.language)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium tabular-nums text-foreground">
                      {formatCurrencyFromCents(
                        transaction.amountCents,
                        i18n.language,
                        transaction.currency.toUpperCase(),
                      )}
                    </p>
                    {transaction.invoiceUrl ? (
                      <Button
                        render={
                          <a href={transaction.invoiceUrl} rel="noreferrer" target="_blank" />
                        }
                        size="sm"
                        variant="outline"
                      >
                        {t("billing.transactions.invoice")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
