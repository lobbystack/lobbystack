import { Check } from "lucide-react";
import type { TFunction } from "i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  BillingInterval,
  BillingPlanSlug,
  HostedCheckoutPlanIntervals,
} from "../../../../../packages/shared/src/billing";

export type HostedUpgradePlan = "starter" | "pro";

type BillingTranslation = TFunction<"settings">;

type UpgradePlanCard = {
  slug: "free_cloud" | HostedUpgradePlan | "enterprise";
  price: Record<BillingInterval, string>;
  period: string;
  highlights: string[];
  highlighted?: boolean;
};

const upgradePlanCards: UpgradePlanCard[] = [
  {
    slug: "free_cloud",
    price: {
      monthly: "$0",
      annual: "$0",
    },
    period: "",
    highlights: ["voiceMinutes", "allFeatures", "support"],
  },
  {
    slug: "starter",
    price: {
      monthly: "$30",
      annual: "$24",
    },
    period: "/mo",
    highlights: ["voiceMinutes", "dedicatedNumber", "phoneNumber", "support"],
  },
  {
    slug: "pro",
    price: {
      monthly: "$100",
      annual: "$80",
    },
    period: "/mo",
    highlights: ["voiceMinutes", "dedicatedNumber", "alertSms", "support"],
    highlighted: true,
  },
  {
    slug: "enterprise",
    price: {
      monthly: "Custom",
      annual: "Custom",
    },
    period: "",
    highlights: ["phoneNumbers", "routing", "fallbackRules", "support"],
  },
];

function isHostedUpgradePlan(slug: UpgradePlanCard["slug"]): slug is HostedUpgradePlan {
  return slug === "starter" || slug === "pro";
}

export function UpgradePlanDialog({
  availableCheckoutPlans,
  availableCheckoutIntervals,
  billingInterval,
  currentPlan,
  loading,
  loadingPlan,
  onBillingIntervalChange,
  onContactEnterprise,
  onOpenChange,
  onStartCheckout,
  open,
  t,
}: {
  availableCheckoutPlans: Array<"starter" | "pro">;
  availableCheckoutIntervals: HostedCheckoutPlanIntervals;
  billingInterval: BillingInterval;
  currentPlan: BillingPlanSlug;
  loading: "checkout" | "portal" | null;
  loadingPlan: HostedUpgradePlan | null;
  onBillingIntervalChange: (billingInterval: BillingInterval) => void;
  onContactEnterprise: () => void;
  onOpenChange: (open: boolean) => void;
  onStartCheckout: (target: HostedUpgradePlan, billingInterval: BillingInterval) => void;
  open: boolean;
  t: BillingTranslation;
}) {
  const availableBillingIntervals = (["monthly", "annual"] as const).filter(
    (interval) =>
      availableCheckoutPlans.some((plan) =>
        availableCheckoutIntervals[plan].includes(interval),
      ),
  );
  const switcherIntervals =
    availableBillingIntervals.length > 0
      ? availableBillingIntervals
      : (["monthly", "annual"] as const);
  const fallbackBillingInterval: BillingInterval = switcherIntervals[0] ?? "monthly";
  const selectedBillingInterval = switcherIntervals.includes(billingInterval)
    ? billingInterval
    : fallbackBillingInterval;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[72rem]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t("billing.upgradeDialog.title")}
          </DialogTitle>
          <DialogDescription>
            {t("billing.upgradeDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            aria-label={t("billing.upgradeDialog.billingIntervalLabel")}
            className="inline-flex rounded-full border border-border bg-muted/40 p-1"
            role="tablist"
          >
            {switcherIntervals.map((interval) => (
              <Button
                aria-selected={selectedBillingInterval === interval}
                className={cn(
                  "h-9 rounded-full px-4",
                  selectedBillingInterval === interval
                    ? "bg-background text-foreground shadow-sm hover:bg-background"
                    : "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                key={interval}
                onClick={() => onBillingIntervalChange(interval)}
                role="tab"
                size="sm"
                type="button"
                variant="outline"
              >
                {t(`billing.upgradeDialog.billingIntervals.${interval}`)}
                {interval === "annual" ? (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {t("billing.upgradeDialog.annualDiscount")}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {upgradePlanCards.map((card) => {
            const isCurrentPlan = currentPlan === card.slug;
            const checkoutPlan = isHostedUpgradePlan(card.slug) ? card.slug : null;
            const isEnterprisePlan = card.slug === "enterprise";
            const isSelectedIntervalAvailable =
              checkoutPlan === null ||
              availableCheckoutIntervals[checkoutPlan].includes(selectedBillingInterval);
            const isAvailable =
              isEnterprisePlan ||
              (checkoutPlan !== null &&
                availableCheckoutPlans.includes(checkoutPlan) &&
                isSelectedIntervalAvailable);
            const actionLabel = isCurrentPlan
              ? t("billing.upgradeDialog.actions.currentPlan")
              : checkoutPlan !== null
                ? t(`billing.upgradeDialog.actions.${checkoutPlan}`)
                : t("billing.upgradeDialog.actions.enterprise");

            return (
              <section
                className={cn(
                  "flex min-h-[29rem] flex-col rounded-xl border bg-background p-5",
                  card.highlighted
                    ? "border-foreground/30 bg-muted/20"
                    : "border-border/70",
                )}
                key={card.slug}
              >
                <div className="mb-5">
                  <h3 className="font-heading text-lg font-medium tracking-[-0.03em]">
                    {t(`billing.upgradeDialog.plans.${card.slug}.name`)}
                  </h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                      {card.price[selectedBillingInterval]}
                    </span>
                    {card.period ? (
                      <span className="text-sm text-muted-foreground">
                        {card.period}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {t(
                      `billing.upgradeDialog.plans.${card.slug}.description.${selectedBillingInterval}`,
                    )}
                  </p>
                </div>

                <div className="flex-1 border-t border-border/60 pt-4">
                  <ul className="flex flex-col gap-3">
                    {card.highlights.map((highlight) => (
                      <li className="flex items-start gap-2.5 text-sm" key={highlight}>
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        <span className="whitespace-pre-line">
                          {t(
                            `billing.upgradeDialog.plans.${card.slug}.highlights.${highlight}`,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  className="mt-6 w-full rounded-full"
                  disabled={loading === "checkout" || isCurrentPlan || !isAvailable}
                  loading={
                    loading === "checkout" &&
                    checkoutPlan !== null &&
                    checkoutPlan === loadingPlan
                  }
                  loadingLabel={t("billing.actions.openingCheckout")}
                  onClick={() => {
                    if (checkoutPlan !== null) {
                      onStartCheckout(checkoutPlan, selectedBillingInterval);
                    } else if (isEnterprisePlan) {
                      onContactEnterprise();
                    }
                  }}
                  type="button"
                  variant={card.highlighted ? "default" : "outline"}
                >
                  {actionLabel}
                </Button>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
