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

type TierConfig = {
  slug: PlanSlug;
  ctaVariant: "default" | "outline";
  highlight: boolean;
  highlightKeys: string[];
};

type ComparisonValue =
  | boolean
  | {
      key: string;
    }
  | {
      includedKey: string;
      thenKey?: string;
    };

type ComparisonRow = {
  key: string;
  free: ComparisonValue;
  pro: ComparisonValue;
  enterprise: ComparisonValue;
};

type ComparisonGroup = {
  key: string;
  rows: ComparisonRow[];
};

const tierConfigs: TierConfig[] = [
  {
    slug: "free_cloud",
    ctaVariant: "outline",
    highlight: false,
    highlightKeys: ["voiceMinutes", "phoneNumber", "bookingContacts", "support"],
  },
  {
    slug: "pro",
    ctaVariant: "default",
    highlight: true,
    highlightKeys: ["voiceMinutes", "aiSms", "knowledgeStorage", "support"],
  },
  {
    slug: "enterprise",
    ctaVariant: "outline",
    highlight: false,
    highlightKeys: ["phoneNumbers", "routing", "selfHosted", "support"],
  },
];

const comparisonGroups: ComparisonGroup[] = [
  {
    key: "usage",
    rows: [
      {
        key: "voiceMinutes",
        free: { includedKey: "usage.voiceMinutes.freeIncluded" },
        pro: { includedKey: "usage.voiceMinutes.proIncluded", thenKey: "usage.voiceMinutes.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "outboundCalls",
        free: { includedKey: "usage.outboundCalls.freeIncluded" },
        pro: { includedKey: "usage.outboundCalls.proIncluded", thenKey: "usage.outboundCalls.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "alertSms",
        free: { includedKey: "usage.alertSms.freeIncluded" },
        pro: { includedKey: "usage.alertSms.proIncluded", thenKey: "usage.alertSms.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "knowledgeStorage",
        free: { key: "usage.knowledgeStorage.free" },
        pro: { key: "usage.knowledgeStorage.pro" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "phoneNumbers",
        free: { key: "usage.phoneNumbers.free" },
        pro: { key: "usage.phoneNumbers.pro" },
        enterprise: { key: "common.multiple" },
      },
    ],
  },
  {
    key: "core",
    rows: [
      {
        key: "callAnswering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "callerDetails",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "knowledgeAnswers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "workflows",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "spamFiltering",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "shortCalls",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "concurrentCalls",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "multilingual",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    key: "booking",
    rows: [
      {
        key: "appointmentBooking",
        free: { key: "common.unlimited" },
        pro: { key: "common.unlimited" },
        enterprise: { key: "common.unlimited" },
      },
      {
        key: "confirmationTexts",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "googleCalendar",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "outlook",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "missedCallFollowUp",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "outboundCalling",
        free: true,
        pro: true,
        enterprise: true,
      },
    ],
  },
  {
    key: "routing",
    rows: [
      {
        key: "urgentHandoff",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "callTransfers",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "afterHours",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "multiLocation",
        free: false,
        pro: false,
        enterprise: true,
      },
      {
        key: "customEscalation",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    key: "notifications",
    rows: [
      {
        key: "emailNotifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "smsNotifications",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "aiSms",
        free: false,
        pro: {
          includedKey: "notifications.aiSms.proIncluded",
          thenKey: "notifications.aiSms.proThen",
        },
        enterprise: { key: "common.custom" },
      },
    ],
  },
  {
    key: "data",
    rows: [
      {
        key: "summaries",
        free: { key: "common.unlimited" },
        pro: { key: "common.unlimited" },
        enterprise: { key: "common.unlimited" },
      },
      {
        key: "history",
        free: { key: "common.unlimited" },
        pro: { key: "common.unlimited" },
        enterprise: { key: "common.unlimited" },
      },
      {
        key: "callerProfiles",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "contacts",
        free: { key: "common.unlimited" },
        pro: { key: "common.unlimited" },
        enterprise: { key: "common.unlimited" },
      },
      {
        key: "websiteImport",
        free: true,
        pro: true,
        enterprise: true,
      },
      {
        key: "retentionGuidance",
        free: false,
        pro: false,
        enterprise: true,
      },
    ],
  },
  {
    key: "deployment",
    rows: [
      {
        key: "hosting",
        free: { key: "deployment.hosting.managed" },
        pro: { key: "deployment.hosting.managed" },
        enterprise: { key: "deployment.hosting.enterprise" },
      },
      {
        key: "usageBilling",
        free: false,
        pro: true,
        enterprise: true,
      },
      {
        key: "support",
        free: { key: "deployment.support.community" },
        pro: { key: "deployment.support.priority" },
        enterprise: { key: "deployment.support.dedicated" },
      },
    ],
  },
];

type OnboardingT = ReturnType<typeof useTranslation<"onboarding">>["t"];

function ComparisonCell({ t, value }: { t: OnboardingT; value: ComparisonValue }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-4 text-foreground/60" />
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground/30" />
    );
  }

  if ("key" in value) {
    const label = t(`plan.comparison.values.${value.key}`);
    return (
      <span className={label === "-" ? "text-muted-foreground/40" : "text-muted-foreground"}>
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5 leading-tight">
      <span className="font-medium text-foreground">
        {t(`plan.comparison.values.${value.includedKey}`)}
      </span>
      {value.thenKey ? (
        <span className="text-xs text-muted-foreground">
          {t(`plan.comparison.values.${value.thenKey}`)}
        </span>
      ) : null}
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

      window.location.assign(
        `mailto:hello@lobbystack.ai?subject=${encodeURIComponent(t("plan.enterpriseSubject"))}`,
      );
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
          {tierConfigs.map((tier) => {
            const isSubmitting = submittingPlan === tier.slug;
            const isUnavailable = tier.slug === "pro" && !proAvailable;
            const period = t(`plan.tiers.${tier.slug}.period`);

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
                    {t("plan.popular")}
                  </div>
                ) : null}

                <div className="mb-6">
                  <h3 className="font-heading text-lg font-semibold tracking-tight">
                    {t(`plan.tiers.${tier.slug}.name`)}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-heading text-4xl font-semibold tracking-tighter">
                      {t(`plan.tiers.${tier.slug}.price`)}
                    </span>
                    {period ? (
                      <span className="text-sm text-muted-foreground">{period}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {t(`plan.tiers.${tier.slug}.description`)}
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
                      {t(`plan.tiers.${tier.slug}.cta`)}
                      <ArrowRight className="ml-1 size-4" />
                    </>
                  )}
                </Button>

                <div className="flex-1 border-t border-border/50 pt-5">
                  <ul className="space-y-2.5">
                    {tier.highlightKeys.map((item) => (
                      <li className="flex items-start gap-2.5 text-sm" key={item}>
                        <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" />
                        <span>{t(`plan.tiers.${tier.slug}.highlights.${item}`)}</span>
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
            {t("plan.compareTitle")}
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
            {t("plan.compareDescription")}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="pr-8 pb-4 text-left text-xs font-medium text-muted-foreground">
                    {t("plan.featureHeader")}
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    {t("plan.tiers.free_cloud.name")}
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {t("plan.tiers.pro.name")}
                      <span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">
                        {t("plan.popular")}
                      </span>
                    </span>
                  </th>
                  <th className="w-[160px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">
                    {t("plan.tiers.enterprise.name")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {comparisonGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr>
                      <td
                        className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        colSpan={4}
                      >
                        {t(`plan.comparison.groups.${group.key}`)}
                      </td>
                    </tr>

                    {group.rows.map((row) => (
                      <tr className="border-b border-border/40 last:border-0" key={row.key}>
                        <td className="py-3 pr-8 text-foreground">
                          {t(`plan.comparison.features.${row.key}`)}
                        </td>
                        {([row.free, row.pro, row.enterprise] as ComparisonValue[]).map(
                          (value, index) => (
                            <td className="px-4 py-3 text-center" key={index}>
                              <ComparisonCell t={t} value={value} />
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
