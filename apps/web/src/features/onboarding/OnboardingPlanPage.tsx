import { Fragment, useState } from "react";

import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { ArrowRight, Check, LoaderCircle, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingPlanPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

type PlanSlug = "free_cloud" | "pro" | "enterprise";

type Tier = {
  slug: PlanSlug;
  name: string;
  price: string;
  period: string;
  description: string;
  cta: string;
  ctaVariant: "default" | "outline";
  highlight: boolean;
  highlights: string[];
};

type ComparisonValue =
  | string
  | boolean
  | {
      included: string;
      then?: string;
    };

type ComparisonRow = {
  feature: string;
  free: ComparisonValue;
  pro: ComparisonValue;
  enterprise: ComparisonValue;
};

type ComparisonGroup = {
  category: string;
  rows: ComparisonRow[];
};

const tiers: Tier[] = [
  {
    slug: "free_cloud",
    name: "Free",
    price: "$0",
    period: "",
    description: "Try LobbyStack with enough usage to see it work.",
    cta: "Start free",
    ctaVariant: "outline",
    highlight: false,
    highlights: [
      "10 voice minutes included",
      "Dedicated phone number",
      "Unlimited booking and contacts",
      "Community support",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price: "$15",
    period: "/mo",
    description: "Everything you need to run a production AI receptionist.",
    cta: "Upgrade",
    ctaVariant: "default",
    highlight: true,
    highlights: [
      "80 voice minutes + pay-as-you-go",
      "Two-way AI SMS add-on",
      "2 GB knowledge storage",
      "Priority email support",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For higher volume, multiple numbers, or custom deployment needs.",
    cta: "Contact us",
    ctaVariant: "outline",
    highlight: false,
    highlights: [
      "Multiple dedicated numbers",
      "Multi-location routing",
      "Self-hosted deployment option",
      "Dedicated implementation support",
    ],
  },
];

const comparisonGroups: ComparisonGroup[] = [
  {
    category: "Usage & limits",
    rows: [
      {
        feature: "Voice minutes",
        free: { included: "10 included" },
        pro: { included: "80 included", then: "then $0.18/min" },
        enterprise: "Custom",
      },
      {
        feature: "Outbound call attempts",
        free: { included: "2 included" },
        pro: { included: "20 included", then: "then $0.02/attempt" },
        enterprise: "Custom",
      },
      {
        feature: "Alert SMS segments",
        free: { included: "10 included" },
        pro: { included: "50 included", then: "then $0.02/segment" },
        enterprise: "Custom",
      },
      {
        feature: "Knowledge storage",
        free: "100 MB",
        pro: "2 GB",
        enterprise: "Custom",
      },
      {
        feature: "Phone numbers",
        free: "1 dedicated",
        pro: "1 dedicated",
        enterprise: "Multiple",
      },
    ],
  },
  {
    category: "Core receptionist",
    rows: [
      {
        feature: "24/7 call answering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Caller details and message capture",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Knowledge base answers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Plain-language workflows",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Spam filtering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Calls under 10s excluded from billing",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Concurrent call handling",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Multilingual support",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Booking & follow-up",
    rows: [
      {
        feature: "Appointment booking",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Appointment confirmation texts",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Google Calendar integration",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Outlook integration",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Missed-call follow-up",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Outbound calls",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    category: "Routing & transfers",
    rows: [
      {
        feature: "Urgent call handoff",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Call transfers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "After-hours answering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Multi-location routing",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        feature: "Custom fallback and escalation rules",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Notifications & messaging",
    rows: [
      {
        feature: "Email notifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "SMS notifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Two-way AI SMS conversations",
        free: false,
        pro: {
          included: "$5/mo + $19 setup",
          then: "then $0.03/segment",
        },
        enterprise: "Custom",
      },
    ],
  },
  {
    category: "Data & dashboard",
    rows: [
      {
        feature: "Call summaries and transcripts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Call history and recordings",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Caller profiles and notes",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Contacts",
        free: "Unlimited",
        pro: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        feature: "Website knowledge import",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Data retention guidance",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    category: "Deployment & support",
    rows: [
      {
        feature: "Hosting",
        free: "Managed cloud",
        pro: "Managed cloud",
        enterprise: "Cloud or self-hosted",
      },
      {
        feature: "Usage-based billing",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        feature: "Support",
        free: "Community",
        pro: "Priority email",
        enterprise: "Dedicated implementation",
      },
    ],
  },
];

function ComparisonCell({ value }: { value: ComparisonValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-4 text-foreground/60" />
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground/30" />
    );
  }

  if (typeof value === "string") {
    return (
      <span className={value === "-" ? "text-muted-foreground/40" : "text-muted-foreground"}>
        {value}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">{value.included}</span>
      {value.then ? <span className="text-xs text-muted-foreground">{value.then}</span> : null}
    </span>
  );
}

export function OnboardingPlanPage({
  businessId,
  onSignOut,
  progressNavigableUntil,
}: OnboardingPlanPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const status = useQuery(api.billing.getStatus, { businessId });
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const selectOnboardingPlan = useObservedMutation(api.onboarding.plan.selectOnboardingPlan);

  const [submittingPlan, setSubmittingPlan] = useState<PlanSlug | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proAvailable = status?.availableCheckoutPlans
    ? status.availableCheckoutPlans.includes("pro")
    : true;

  async function handlePlanAction(plan: PlanSlug): Promise<void> {
    if (submittingPlan) return;
    setSubmittingPlan(plan);
    setError(null);

    try {
      if (plan === "free_cloud") {
        captureAnalyticsEvent("web.onboarding.plan_selected", {
          businessId: String(businessId),
          plan: "free_cloud",
        });
        await selectOnboardingPlan({ businessId, plan: "free_cloud" });
        navigate("/onboarding/attribution");
        return;
      }

      if (plan === "pro") {
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

      window.location.assign("mailto:hello@lobbystack.ai?subject=Enterprise%20plan");
    } catch (continueError) {
      setError(
        getSafeOnboardingErrorMessage(continueError, t, "plan.continueFailed"),
      );
    } finally {
      setSubmittingPlan(null);
    }
  }

  return (
    <OnboardingShell
      description={t("plan.description")}
      onSignOut={onSignOut}
      progress={{ current: 9, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("plan.title")}
      width="wide"
    >
      <div className="flex flex-col gap-12">
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((tier) => {
            const isSubmitting = submittingPlan === tier.slug;
            const isUnavailable = tier.slug === "pro" && !proAvailable;

            return (
              <section
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-background p-8",
                  tier.highlight
                    ? "border-foreground/30 shadow-sm"
                    : "border-border/60",
                )}
                key={tier.slug}
              >
                {tier.highlight ? (
                  <div className="absolute -top-3 left-8 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">
                    Most popular
                  </div>
                ) : null}

                <div className="mb-6">
                  <h3 className="font-heading text-lg font-semibold tracking-tight">
                    {tier.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-heading text-4xl font-semibold tracking-tighter">
                      {tier.price}
                    </span>
                    {tier.period ? (
                      <span className="text-sm text-muted-foreground">{tier.period}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {tier.description}
                  </p>
                </div>

                <Button
                  className="mb-6 w-full rounded-full"
                  disabled={Boolean(submittingPlan) || isUnavailable}
                  onClick={() => void handlePlanAction(tier.slug)}
                  type="button"
                  variant={tier.ctaVariant}
                >
                  {isSubmitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <>
                      {tier.cta}
                      <ArrowRight className="ml-1 size-4" />
                    </>
                  )}
                </Button>

                <div className="flex-1 border-t border-border/50 pt-5">
                  <ul className="space-y-2.5">
                    {tier.highlights.map((item) => (
                      <li className="flex items-start gap-2.5 text-sm" key={item}>
                        <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>

        {error ? <FieldError>{error}</FieldError> : null}

        <section id="compare">
          <h2 className="mb-4 text-center font-heading text-2xl font-semibold tracking-tighter md:text-3xl">
            Compare plans in detail
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            Every plan gets all features, Pro gives you higher usage and access to AI SMS
            add-on.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pr-8 pb-4 text-left text-xs font-medium text-muted-foreground">
                    Feature
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    Free
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      Pro
                      <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">
                        Popular
                      </span>
                    </span>
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    Enterprise
                  </th>
                </tr>
              </thead>

              <tbody>
                {comparisonGroups.map((group) => (
                  <Fragment key={group.category}>
                    <tr>
                      <td
                        className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        colSpan={4}
                      >
                        {group.category}
                      </td>
                    </tr>

                    {group.rows.map((row) => (
                      <tr className="border-b border-border/40 last:border-0" key={row.feature}>
                        <td className="py-3 pr-8 text-foreground">{row.feature}</td>
                        {([row.free, row.pro, row.enterprise] as ComparisonValue[]).map(
                          (value, index) => (
                            <td className="px-4 py-3 text-center" key={index}>
                              <ComparisonCell value={value} />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </OnboardingShell>
  );
}
