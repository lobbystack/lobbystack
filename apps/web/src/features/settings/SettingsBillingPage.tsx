import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  billingPaidTiers,
  billingPlanCatalog,
  type BillingPaidTier,
  type BillingStatus,
  type BillingTier,
} from "@ai-receptionist/shared";
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Progress,
} from "@/components/ui/progress";
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

function formatMeteredRateFromCents(
  cents: number | null,
  locale: string,
  currency = "USD",
): string | null {
  if (cents === null) {
    return null;
  }

  const minimumFractionDigits = Number.isInteger(cents) ? 2 : 3;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits: 3,
  }).format(cents / 100);
}

function formatUsageMinutes(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: seconds % 60 === 0 ? 0 : 1,
    minimumFractionDigits: seconds % 60 === 0 ? 0 : 1,
  }).format(seconds / 60);
}

function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
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

function getSubscriptionBadgeVariant(
  subscriptionState: string,
): "outline" | "secondary" | "destructive" {
  if (subscriptionState === "active" || subscriptionState === "trialing") {
    return "outline";
  }

  if (
    subscriptionState === "past_due" ||
    subscriptionState === "canceled" ||
    subscriptionState === "revoked"
  ) {
    return "destructive";
  }

  return "secondary";
}

function getSubscriptionStateLabel(
  subscriptionState: string,
  t: (key: string) => string,
): string {
  switch (subscriptionState) {
    case "active":
      return t("billing.states.active");
    case "trialing":
      return t("billing.states.trialing");
    case "past_due":
      return t("billing.states.pastDue");
    case "canceled":
      return t("billing.states.canceled");
    case "revoked":
      return t("billing.states.revoked");
    default:
      return t("billing.states.inactive");
  }
}

function getPlanName(tier: BillingTier, t: (key: string) => string): string {
  switch (tier) {
    case "starter":
      return t("billing.plan.starterName");
    case "growth":
      return t("billing.plan.growthName");
    default:
      return t("billing.plan.freeName");
  }
}

function getPlanDescription(
  tier: BillingTier,
  t: (key: string) => string,
): string {
  switch (tier) {
    case "starter":
      return t("billing.plan.starterDescription");
    case "growth":
      return t("billing.plan.growthDescription");
    default:
      return t("billing.plan.freeDescription");
  }
}

function PlanSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function UsageRow(props: {
  title: string;
  description: string;
  value: string;
  progressValue?: number;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{props.title}</p>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
        <p className="text-sm font-medium tabular-nums text-foreground">
          {props.value}
        </p>
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
  const [checkoutPlanInFlight, setCheckoutPlanInFlight] =
    useState<BillingPaidTier | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") {
      return;
    }

    toast.success(t("billing.checkoutSuccess"));
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("checkout");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const planSummary = useMemo(() => {
    if (!billingStatus) {
      return null;
    }

    return {
      name: getPlanName(billingStatus.tier, t),
      description: getPlanDescription(billingStatus.tier, t),
    };
  }, [billingStatus, t]);

  if (!billingStatus || !planSummary) {
    return <PlanSkeleton />;
  }

  const voiceUsageValue = t("billing.usage.voiceValue", {
    minutes: formatUsageMinutes(
      billingStatus.usage.voiceSecondsUsed,
      i18n.language,
    ),
  });
  const smsUsageValue = t("billing.usage.smsValue", {
    count: billingStatus.usage.smsSegmentsUsed,
  });
  const voiceProgressValue =
    billingStatus.usage.voiceSecondsIncluded === null
      ? undefined
      : Math.min(
          100,
          (billingStatus.usage.voiceSecondsUsed /
            Math.max(1, billingStatus.usage.voiceSecondsIncluded)) *
            100,
        );
  const smsProgressValue =
    billingStatus.usage.smsSegmentsIncluded === null
      ? undefined
      : Math.min(
          100,
          (billingStatus.usage.smsSegmentsUsed /
            Math.max(1, billingStatus.usage.smsSegmentsIncluded)) *
            100,
        );

  async function handleStartCheckout(plan: BillingPaidTier): Promise<void> {
    setCheckoutPlanInFlight(plan);

    try {
      const result = await startCheckout({ businessId, plan });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("billing.errors.checkoutFailed"),
      );
    } finally {
      setCheckoutPlanInFlight(null);
    }
  }

  async function handleOpenPortal(): Promise<void> {
    setIsOpeningPortal(true);

    try {
      const result = await openPortal({ businessId });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("billing.errors.portalFailed"),
      );
    } finally {
      setIsOpeningPortal(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{t("billing.plan.title")}</CardTitle>
            <Badge
              variant={getSubscriptionBadgeVariant(billingStatus.subscriptionState)}
            >
              {getSubscriptionStateLabel(
                billingStatus.subscriptionState,
                t,
              )}
            </Badge>
          </div>
          <CardDescription>{planSummary.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("billing.plan.currentPlan")}
                </p>
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {planSummary.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {billingStatus.minimumMonthlyChargeCents !== null
                    ? t("billing.plan.minimumUsageValue", {
                        amount:
                          formatCurrencyFromCents(
                            billingStatus.minimumMonthlyChargeCents,
                            i18n.language,
                          ) ?? "$5.00",
                      })
                    : t("billing.plan.freeAllowanceValue")}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {billingStatus.hasCustomerPortalAccess ? (
                  <Button
                    disabled={isOpeningPortal}
                    onClick={() => void handleOpenPortal()}
                    type="button"
                    variant="outline"
                  >
                    {isOpeningPortal
                      ? t("billing.actions.openingPortal")
                      : t("billing.actions.manage")}
                  </Button>
                ) : null}
              </div>
            </div>

            <ItemGroup spacing="compact">
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{t("billing.plan.minimumCharge")}</ItemTitle>
                  <ItemDescription>
                    {t("billing.plan.minimumChargeDescription")}
                  </ItemDescription>
                  <p className="text-sm font-medium text-foreground">
                    {billingStatus.minimumMonthlyChargeCents !== null
                      ? formatCurrencyFromCents(
                          billingStatus.minimumMonthlyChargeCents,
                          i18n.language,
                        )
                      : t("billing.plan.notApplicable")}
                  </p>
                </ItemContent>
              </Item>

              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{t("billing.plan.usageModel")}</ItemTitle>
                  <ItemDescription>
                    {t("billing.plan.usageModelDescription")}
                  </ItemDescription>
                  <p className="text-sm font-medium text-foreground">
                    {billingStatus.tier === "free"
                      ? t("billing.plan.freeAllowanceValue")
                      : t("billing.plan.usageModelValue")}
                  </p>
                </ItemContent>
              </Item>

              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{t("billing.plan.billingContact")}</ItemTitle>
                  <ItemDescription>
                    {t("billing.plan.billingContactDescription")}
                  </ItemDescription>
                  <p className="text-sm font-medium text-foreground">
                    {billingStatus.billingContactEmail ??
                      billingStatus.billingContactName ??
                      t("billing.plan.notConfigured")}
                  </p>
                </ItemContent>
              </Item>
            </ItemGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.catalog.title")}</CardTitle>
          <CardDescription>{t("billing.catalog.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {billingPaidTiers.map((plan) => {
            const planDetails = billingPlanCatalog[plan];
            const isCurrentPlan = billingStatus.tier === plan;
            const isCheckoutConfigured =
              billingStatus.availableCheckoutPlans.includes(plan);

            return (
              <div
                className="rounded-xl border border-border/80 bg-muted/20 p-5"
                key={plan}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xl font-semibold tracking-tight text-foreground">
                      {getPlanName(plan, t)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getPlanDescription(plan, t)}
                    </p>
                  </div>
                  {isCurrentPlan ? (
                    <Badge variant="outline">{t("billing.actions.currentPlan")}</Badge>
                  ) : null}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-lg border border-border/80 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {t("billing.plan.minimumCharge")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("billing.plan.minimumUsageValue", {
                        amount:
                          formatCurrencyFromCents(
                            planDetails.minimumMonthlyChargeCents,
                            i18n.language,
                          ) ?? "$0.00",
                      })}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium text-foreground">
                        {t("billing.plan.voiceRate")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("billing.plan.voiceRateValue", {
                          amount:
                            formatMeteredRateFromCents(
                              planDetails.voiceRatePerMinuteCents,
                              i18n.language,
                            ) ?? "$0.00",
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium text-foreground">
                        {t("billing.plan.smsRate")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("billing.plan.smsRateValue", {
                          amount:
                            formatMeteredRateFromCents(
                              planDetails.smsRatePerMessageCents,
                              i18n.language,
                            ) ?? "$0.00",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-dashed border-border/80 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">
                      {t("billing.plan.includedLocalNumber")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("billing.plan.includedLocalNumberValue", {
                        count: planDetails.includedLocalNumbers,
                      })}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {t("billing.plan.minimumCreditValue")}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button
                    disabled={
                      isCurrentPlan ||
                      !isCheckoutConfigured ||
                      checkoutPlanInFlight !== null
                    }
                    onClick={() => void handleStartCheckout(plan)}
                    type="button"
                    variant={isCurrentPlan ? "outline" : "default"}
                  >
                    {isCurrentPlan
                      ? t("billing.actions.currentPlan")
                      : checkoutPlanInFlight === plan
                        ? t("billing.actions.openingCheckout")
                        : isCheckoutConfigured
                          ? t("billing.actions.selectPlan", {
                              plan: getPlanName(plan, t),
                            })
                          : t("billing.actions.checkoutUnavailable")}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billing.usage.title")}</CardTitle>
          <CardDescription>
            {t("billing.usage.description", {
              resetAt: formatTimestamp(
                billingStatus.usage.resetAt,
                i18n.language,
              ),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <UsageRow
            description={
              billingStatus.usage.voiceSecondsRemaining !== null
                ? t("billing.usage.voiceRemaining", {
                    minutes: formatUsageMinutes(
                      billingStatus.usage.voiceSecondsRemaining,
                      i18n.language,
                    ),
                  })
                : t("billing.usage.meteredUsage")
            }
            title={t("billing.usage.voice")}
            value={voiceUsageValue}
            {...(voiceProgressValue !== undefined
              ? { progressValue: voiceProgressValue }
              : {})}
          />
          <UsageRow
            description={
              billingStatus.usage.smsSegmentsRemaining !== null
                ? t("billing.usage.smsRemaining", {
                    count: billingStatus.usage.smsSegmentsRemaining,
                  })
                : t("billing.usage.meteredUsage")
            }
            title={t("billing.usage.sms")}
            value={smsUsageValue}
            {...(smsProgressValue !== undefined
              ? { progressValue: smsProgressValue }
              : {})}
          />
          {billingStatus.usage.voiceBlocked || billingStatus.usage.smsBlocked ? (
            <div className="md:col-span-2">
              <Badge variant="destructive">
                {t("billing.usage.limitReached")}
              </Badge>
            </div>
          ) : null}
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
            <ItemGroup spacing="compact">
              {billingStatus.recentTransactions.map((transaction, index) => (
                <div key={`${transaction.kind}-${transaction.sourceId}`}>
                  {index > 0 ? <ItemSeparator /> : null}
                  <Item className="border-none px-0 py-0" size="sm">
                    <ItemContent>
                      <ItemTitle>
                        {transaction.kind === "refund"
                          ? t("billing.transactions.refund")
                          : t("billing.transactions.order")}
                      </ItemTitle>
                      <ItemDescription>
                        {transaction.description ?? transaction.status}
                      </ItemDescription>
                      <ItemDescription>
                        {formatTimestamp(transaction.occurredAt, i18n.language)}
                      </ItemDescription>
                    </ItemContent>
                    <div className="ml-auto flex items-center gap-3">
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
                            <a
                              href={transaction.invoiceUrl}
                              rel="noreferrer"
                              target="_blank"
                            />
                          }
                          size="sm"
                          variant="outline"
                        >
                          {t("billing.transactions.invoice")}
                        </Button>
                      ) : null}
                    </div>
                  </Item>
                </div>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
