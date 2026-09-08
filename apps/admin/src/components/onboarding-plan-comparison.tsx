import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";

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
  starter?: ComparisonValue;
  pro: ComparisonValue;
  enterprise: ComparisonValue;
};

type ComparisonGroup = {
  key: string;
  rows: ComparisonRow[];
};

const comparisonGroups: ComparisonGroup[] = [
  {
    key: "usage",
    rows: [
      {
        key: "voiceMinutes",
        free: { includedKey: "usage.voiceMinutes.freeIncluded" },
        starter: { includedKey: "usage.voiceMinutes.starterIncluded", thenKey: "usage.voiceMinutes.starterThen" },
        pro: { includedKey: "usage.voiceMinutes.proIncluded", thenKey: "usage.voiceMinutes.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "outboundCalls",
        free: { includedKey: "usage.outboundCalls.freeIncluded" },
        starter: { includedKey: "usage.outboundCalls.starterIncluded", thenKey: "usage.outboundCalls.starterThen" },
        pro: { includedKey: "usage.outboundCalls.proIncluded", thenKey: "usage.outboundCalls.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "alertSms",
        free: { includedKey: "usage.alertSms.freeIncluded" },
        starter: { includedKey: "usage.alertSms.starterIncluded", thenKey: "usage.alertSms.starterThen" },
        pro: { includedKey: "usage.alertSms.proIncluded", thenKey: "usage.alertSms.proThen" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "knowledgeStorage",
        free: { key: "usage.knowledgeStorage.free" },
        starter: { key: "usage.knowledgeStorage.starter" },
        pro: { key: "usage.knowledgeStorage.pro" },
        enterprise: { key: "common.custom" },
      },
      {
        key: "phoneNumbers",
        free: false,
        starter: { key: "usage.phoneNumbers.starter" },
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
        starter: {
          includedKey: "notifications.aiSms.proIncluded",
          thenKey: "notifications.aiSms.proThen",
        },
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
        starter: { key: "deployment.support.email" },
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

export function OnboardingPlanComparison({ t }: { t: OnboardingT }) {
  return (
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
              <th className="pr-8 pb-4 text-left text-xs font-medium text-muted-foreground">{t("plan.featureHeader")}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{t("plan.tiers.free_cloud.name")}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{t("plan.tiers.starter.name")}</th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-1.5">{t("plan.tiers.pro.name")}<span className="rounded-full bg-foreground px-1.5 py-px text-[10px] font-medium text-background">{t("plan.popular")}</span></span></th>
              <th className="w-[150px] px-4 pb-4 text-center text-xs font-medium text-muted-foreground">{t("plan.tiers.enterprise.name")}</th>
            </tr>
          </thead>
          <tbody>
            {comparisonGroups.map((group) => (
              <Fragment key={group.key}>
                <tr><td className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase" colSpan={5}>{t(`plan.comparison.groups.${group.key}`)}</td></tr>
                {group.rows.map((row) => (
                  <tr className="border-b border-border/40 last:border-0" key={row.key}>
                    <td className="py-3 pr-8 text-foreground">{t(`plan.comparison.features.${row.key}`)}</td>
                    {([row.free, row.starter ?? row.pro, row.pro, row.enterprise] as ComparisonValue[]).map((value, index) => <td className="px-4 py-3 text-center" key={index}><ComparisonCell t={t} value={value} /></td>)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
