import { useState } from "react";

import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { Check, LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingPlanPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
};

type PlanSlug = "free_cloud" | "pro" | "enterprise";

type PlanCard = {
  slug: PlanSlug;
  available: boolean;
};

function formatPriceCents(cents: number, t: ReturnType<typeof useTranslation<"onboarding">>["t"]): string {
  if (cents <= 0) {
    return t("plan.free.priceFree");
  }
  return t("plan.priceMonthly", {
    price: (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
  });
}

export function OnboardingPlanPage({ businessId, onSignOut }: OnboardingPlanPageProps) {
  const { t } = useTranslation("onboarding");
  const status = useQuery(api.billing.getStatus, { businessId });
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const selectOnboardingPlan = useObservedMutation(api.onboarding.plan.selectOnboardingPlan);

  const [selected, setSelected] = useState<PlanSlug>("free_cloud");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proAvailable = Boolean(status?.availableCheckoutPlans?.includes("pro"));
  // We don't surface the Pro price from the dashboard `getStatus` snapshot
  // (it returns the *current* plan's monthly charge). Show a static price
  // here; the canonical price ultimately comes from Polar at checkout.
  const proPrice = 4900;

  const plans: Array<PlanCard> = [
    { slug: "free_cloud", available: true },
    { slug: "pro", available: proAvailable },
    { slug: "enterprise", available: true },
  ];

  async function handleContinue(): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (selected === "free_cloud") {
        captureAnalyticsEvent("web.onboarding.plan_selected", {
          businessId: String(businessId),
          plan: "free_cloud",
        });
        await selectOnboardingPlan({ businessId, plan: "free_cloud" });
        return;
      }

      if (selected === "pro") {
        captureAnalyticsEvent("web.onboarding.plan_checkout_started", {
          businessId: String(businessId),
          plan: "pro",
        });
        const result = await startCheckout({ businessId, target: "pro" });
        if (result.url) {
          window.location.assign(result.url);
        }
        return;
      }

      // Enterprise: open mailto + advance to attribution as free for now
      window.location.assign("mailto:hello@lobbystack.ai?subject=Enterprise%20plan");
    } catch (continueError) {
      setError(
        continueError instanceof Error ? continueError.message : t("plan.continueFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingShell
      description={t("plan.description")}
      onSignOut={onSignOut}
      progress={{ current: 9, total: 10 }}
      title={t("plan.title")}
      width="lg"
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = selected === plan.slug;
            const isDisabled = !plan.available;
            const planTitle = t(`plan.${plan.slug}.title`);
            const planDescription = t(`plan.${plan.slug}.description`);
            const features = t(`plan.${plan.slug}.features`, {
              returnObjects: true,
            }) as Array<string>;
            const priceLabel =
              plan.slug === "free_cloud"
                ? formatPriceCents(0, t)
                : plan.slug === "pro"
                  ? formatPriceCents(proPrice, t)
                  : t("plan.enterprise.priceLabel");

            return (
              <button
                aria-pressed={isSelected}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-6 text-left transition-colors",
                  isSelected
                    ? "border-foreground bg-foreground/5"
                    : "border-border bg-card hover:border-foreground/30",
                  isDisabled && "cursor-not-allowed opacity-50",
                )}
                disabled={isDisabled}
                key={plan.slug}
                onClick={() => setSelected(plan.slug)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {planTitle}
                    </span>
                    <span className="text-2xl font-semibold tracking-tight text-foreground">
                      {priceLabel}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border",
                    )}
                  >
                    {isSelected ? <Check className="size-3" /> : null}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{planDescription}</p>
                <ul className="flex flex-col gap-2 pt-2">
                  {Array.isArray(features)
                    ? features.map((feature) => (
                        <li className="flex items-start gap-2 text-sm text-foreground" key={feature}>
                          <Check
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span>{feature}</span>
                        </li>
                      ))
                    : null}
                </ul>
              </button>
            );
          })}
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button
          className="h-11 w-full"
          disabled={isSubmitting}
          onClick={() => void handleContinue()}
          type="button"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {t("plan.continuing")}
            </>
          ) : (
            t("plan.continue")
          )}
        </Button>
      </div>
    </OnboardingShell>
  );
}
