import { useEffect, useRef, useState } from "react";

import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  billingPlanCatalog,
  billingAddonCatalog,
} from "../../../../../packages/shared/src/billing";
import type {
  BillingPlanSlug,
  BillingStatus,
} from "../../../../../packages/shared/src/billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionBlock } from "@/components/section-block";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDateTime, resolveLocale } from "@/lib/locale";
import { useRememberedConvexQuery } from "@/lib/remembered-convex-query";
import {
  CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM,
  clearStoredCheckoutSessionToken,
  deleteCheckoutSessionTokenParam,
  takeCheckoutSessionToken,
} from "@/lib/checkout-session-token";
import { AI_SMS_DASHBOARD_ENABLED } from "@/lib/release-flags";

type CheckoutReturnTarget = "pro" | "ai_sms";

function parseCheckoutReturnTarget(value: string | null): CheckoutReturnTarget | null {
  return value === "pro" || value === "ai_sms" ? value : null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SettingsBillingPageProps = {
  businessId: Id<"businesses">;
};

type BillingTranslation = ReturnType<typeof useTranslation<"settings">>["t"];
type BillingLocale = string;

type SmsComplianceStatus =
  | "not_started"
  | "collecting_info"
  | "submitting"
  | "pending_brand_verification"
  | "pending_review"
  | "approved"
  | "failed"
  | "suspended";

type SmsComplianceDraft = {
  businessName?: string;
  businessType?: string;
  businessIndustry?: string;
  businessRegistrationIdentifier?: string;
  businessRegistrationNumber?: string;
  websiteUrl?: string;
  businessRegionsOfOperation?: string[];
  companyType?: string;
  stockExchange?: string;
  stockTicker?: string;
  brandContactEmail?: string;
  campaignDescription?: string;
  messageFlow?: string;
  sampleMessages?: string[];
  hasEmbeddedLinks?: boolean;
  hasEmbeddedPhone?: boolean;
  optInMessage?: string;
  optOutMessage?: string;
  helpMessage?: string;
  optInKeywords?: string[];
  optOutKeywords?: string[];
  helpKeywords?: string[];
  address?: {
    customerName?: string;
    street?: string;
    streetSecondary?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    isoCountry?: string;
  };
  authorizedRepresentative?: {
    firstName?: string;
    lastName?: string;
    businessTitle?: string;
    jobPosition?: string;
    phoneNumber?: string;
    email?: string;
  };
};

type SmsComplianceState = {
  applicable: boolean;
  aiSmsCommerciallyEnabled: boolean;
  alertsUseBusinessSender: boolean;
  aiSmsReady: boolean;
  setupRequired: boolean;
  senderMode: "platform_phone" | "business_phone" | "business_messaging_service";
  status: SmsComplianceStatus;
  trafficTier: "low_volume" | "mixed";
  availablePhoneNumbers: Array<{
    id: Id<"phone_numbers">;
    e164: string;
  }>;
  draft?: SmsComplianceDraft;
  pendingAction?: {
    type:
      | "brand_contact_email_otp"
      | "missing_information"
      | "manual_review"
      | "customer_profile_review"
      | "campaign_review"
      | "phone_number_association";
    message: string;
  };
  failureCode?: string;
  failureMessage?: string;
  approvedPhoneNumberId?: Id<"phone_numbers">;
  approvedPhoneNumberE164?: string;
  twilioMessagingServiceSid?: string;
};

type SmsComplianceCampaignOption = {
  value: "low_volume" | "mixed";
  twilioUsecaseCode: string;
  recommended: boolean;
};

type SmsComplianceFormState = {
  trafficTier: "low_volume" | "mixed";
  approvedPhoneNumberId: string;
  businessName: string;
  businessType: string;
  businessIndustry: string;
  businessRegistrationIdentifier: string;
  businessRegistrationNumber: string;
  websiteUrl: string;
  companyType: string;
  stockExchange: string;
  stockTicker: string;
  brandContactEmail: string;
  representativeFirstName: string;
  representativeLastName: string;
  representativeBusinessTitle: string;
  representativeJobPosition: string;
  representativePhoneNumber: string;
  representativeEmail: string;
  addressCustomerName: string;
  addressStreet: string;
  addressStreetSecondary: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressIsoCountry: string;
  campaignDescription: string;
  messageFlow: string;
  sampleMessageOne: string;
  sampleMessageTwo: string;
  optInMessage: string;
  optOutMessage: string;
  helpMessage: string;
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhone: boolean;
};

const DEFAULT_SMS_COMPLIANCE_FORM_STATE: SmsComplianceFormState = {
  trafficTier: "low_volume",
  approvedPhoneNumberId: "",
  businessName: "",
  businessType: "Corporation",
  businessIndustry: "TECHNOLOGY",
  businessRegistrationIdentifier: "EIN",
  businessRegistrationNumber: "",
  websiteUrl: "",
  companyType: "private",
  stockExchange: "",
  stockTicker: "",
  brandContactEmail: "",
  representativeFirstName: "",
  representativeLastName: "",
  representativeBusinessTitle: "",
  representativeJobPosition: "CEO",
  representativePhoneNumber: "",
  representativeEmail: "",
  addressCustomerName: "",
  addressStreet: "",
  addressStreetSecondary: "",
  addressCity: "",
  addressRegion: "",
  addressPostalCode: "",
  addressIsoCountry: "US",
  campaignDescription: "",
  messageFlow: "",
  sampleMessageOne: "",
  sampleMessageTwo: "",
  optInMessage: "",
  optOutMessage: "",
  helpMessage: "",
  hasEmbeddedLinks: false,
  hasEmbeddedPhone: false,
};

const SMS_COMPLIANCE_BUSINESS_TYPE_OPTIONS = [
  "Co-operative",
  "Corporation",
  "Limited Liability Corporation",
  "Non-profit Corporation",
  "Partnership",
] as const;

const SMS_COMPLIANCE_BUSINESS_INDUSTRY_OPTIONS = [
  "AGRICULTURE",
  "AUTOMOTIVE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ELECTRONICS",
  "ENGINEERING",
  "ENERGY",
  "FAST_MOVING_CONSUMER_GOODS",
  "FINANCIAL",
  "FINTECH",
  "FOOD_AND_BEVERAGE",
  "GOVERNMENT",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "JEWELRY",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "NOT_FOR_PROFIT",
  "OIL_AND_GAS",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "RAW_MATERIALS",
  "REAL_ESTATE",
  "RELIGION",
  "RETAIL",
  "TECHNOLOGY",
  "TELECOMMUNICATIONS",
  "TRANSPORTATION",
  "TRAVEL",
] as const;

const SMS_COMPLIANCE_REGISTRATION_IDENTIFIER_OPTIONS = [
  "EIN",
  "DUNS",
  "CBN",
  "CN",
  "ACN",
  "CIN",
  "VAT",
  "VATRN",
  "RN",
  "Other",
] as const;

const SMS_COMPLIANCE_JOB_POSITION_OPTIONS = [
  "Director",
  "GM",
  "VP",
  "CEO",
  "CFO",
  "General Counsel",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCents(
  cents: number,
  locale: BillingLocale,
  currency = "USD",
): string {
  const hasFractionalCents = cents % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasFractionalCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatResetDate(iso: string, locale: BillingLocale): string {
  return formatDateTime(iso, locale, {
    month: "long",
    day: "numeric",
  });
}

function formatStorage(bytes: number, referenceBytes?: number | null): string {
  const normalizedReference = referenceBytes ?? bytes;

  if (normalizedReference >= 1024 * 1024 * 1024) {
    const gigabytes = bytes / (1024 * 1024 * 1024);
    return `${gigabytes % 1 === 0 ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB`;
  }

  if (normalizedReference >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${megabytes % 1 === 0 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
  }

  if (normalizedReference >= 1024) {
    const kilobytes = bytes / 1024;
    return `${kilobytes % 1 === 0 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function formatTransactionDate(iso: string, locale: BillingLocale): string {
  return formatDateTime(iso, locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function voiceSecondsToMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}

function getDisplayedPlanMonthlyChargeCents(status: BillingStatus): number | null {
  if (status.monthlyChargeCents === null) {
    return null;
  }

  const activeAddonChargeCents = status.activeAddons.reduce(
    (total, addon) =>
      total + billingAddonCatalog[addon].recurringMonthlyChargeCents,
    0,
  );

  return Math.max(status.monthlyChargeCents - activeAddonChargeCents, 0);
}

function formatIncludedUsageLine({
  label,
  value,
  unit,
  fallbackText,
}: {
  label: string;
  value: number | null;
  unit?: string;
  fallbackText?: string;
}) {
  if (value === null) {
    return fallbackText ?? `${label}: Unlimited`;
  }

  return `${value}${unit ? ` ${unit}` : ""} ${label}`;
}

function getPlanLabel(
  plan: BillingPlanSlug,
  t: BillingTranslation,
): string {
  switch (plan) {
    case "self_host":
      return t("billing.planLabels.selfHost");
    case "free_cloud":
      return t("billing.planLabels.freeCloudCard");
    case "pro":
      return t("billing.planLabels.proCard");
    case "enterprise":
      return t("billing.planLabels.enterpriseCard");
    default:
      return plan;
  }
}

function useBillingStatus(businessId: Id<"businesses">) {
  return useRememberedConvexQuery(api.billing.getStatus, {
    businessId,
  });
}

function useSmsComplianceStatus(
  businessId: Id<"businesses">,
  enabled: boolean,
) {
  return useRememberedConvexQuery(
    api.smsCompliance.getStatus,
    enabled ? { businessId } : "skip",
  );
}

function useSmsComplianceCampaignOptions() {
  return useRememberedConvexQuery(api.smsCompliance.getCampaignOptions, {});
}

function formatSmsComplianceOptionLabel(value: string): string {
  if (/^[A-Z0-9]+$/.test(value)) {
    return value;
  }

  return value
    .toLowerCase()
    .split(/[_ ]+/)
    .map((part) =>
      part.length > 0 ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part,
    )
    .join(" ");
}

function buildSmsComplianceFormState(
  compliance: SmsComplianceState | undefined,
): SmsComplianceFormState {
  const draft = compliance?.draft;
  const sampleMessages = draft?.sampleMessages ?? [];
  const approvedPhoneNumberId =
    compliance?.approvedPhoneNumberId &&
    compliance.availablePhoneNumbers.some(
      (phoneNumber) => phoneNumber.id === compliance.approvedPhoneNumberId,
    )
      ? compliance.approvedPhoneNumberId
      : undefined;
  const defaultApprovedPhoneNumberId =
    approvedPhoneNumberId ??
    (compliance?.availablePhoneNumbers.length === 1
      ? compliance.availablePhoneNumbers[0]?.id
      : undefined);

  return {
    ...DEFAULT_SMS_COMPLIANCE_FORM_STATE,
    trafficTier: compliance?.trafficTier ?? "low_volume",
    approvedPhoneNumberId: defaultApprovedPhoneNumberId ?? "",
    businessName: draft?.businessName ?? "",
    businessType: draft?.businessType ?? DEFAULT_SMS_COMPLIANCE_FORM_STATE.businessType,
    businessIndustry:
      draft?.businessIndustry ?? DEFAULT_SMS_COMPLIANCE_FORM_STATE.businessIndustry,
    businessRegistrationIdentifier:
      draft?.businessRegistrationIdentifier ??
      DEFAULT_SMS_COMPLIANCE_FORM_STATE.businessRegistrationIdentifier,
    businessRegistrationNumber: draft?.businessRegistrationNumber ?? "",
    websiteUrl: draft?.websiteUrl ?? "",
    companyType: draft?.companyType ?? DEFAULT_SMS_COMPLIANCE_FORM_STATE.companyType,
    stockExchange: draft?.stockExchange ?? "",
    stockTicker: draft?.stockTicker ?? "",
    brandContactEmail: draft?.brandContactEmail ?? "",
    representativeFirstName: draft?.authorizedRepresentative?.firstName ?? "",
    representativeLastName: draft?.authorizedRepresentative?.lastName ?? "",
    representativeBusinessTitle:
      draft?.authorizedRepresentative?.businessTitle ?? "",
    representativeJobPosition:
      draft?.authorizedRepresentative?.jobPosition ??
      DEFAULT_SMS_COMPLIANCE_FORM_STATE.representativeJobPosition,
    representativePhoneNumber: draft?.authorizedRepresentative?.phoneNumber ?? "",
    representativeEmail: draft?.authorizedRepresentative?.email ?? "",
    addressCustomerName: draft?.address?.customerName ?? "",
    addressStreet: draft?.address?.street ?? "",
    addressStreetSecondary: draft?.address?.streetSecondary ?? "",
    addressCity: draft?.address?.city ?? "",
    addressRegion: draft?.address?.region ?? "",
    addressPostalCode: draft?.address?.postalCode ?? "",
    addressIsoCountry:
      draft?.address?.isoCountry ?? DEFAULT_SMS_COMPLIANCE_FORM_STATE.addressIsoCountry,
    campaignDescription: draft?.campaignDescription ?? "",
    messageFlow: draft?.messageFlow ?? "",
    sampleMessageOne: sampleMessages[0] ?? "",
    sampleMessageTwo: sampleMessages[1] ?? "",
    optInMessage: draft?.optInMessage ?? "",
    optOutMessage: draft?.optOutMessage ?? "",
    helpMessage: draft?.helpMessage ?? "",
    hasEmbeddedLinks: draft?.hasEmbeddedLinks ?? false,
    hasEmbeddedPhone: draft?.hasEmbeddedPhone ?? false,
  };
}

function buildSmsComplianceDraft(
  form: SmsComplianceFormState,
): SmsComplianceDraft {
  const businessName = form.businessName.trim();
  const sampleMessages = [
    form.sampleMessageOne.trim(),
    form.sampleMessageTwo.trim(),
  ].filter((message) => message.length > 0);

  return {
    businessName,
    businessType: form.businessType.trim(),
    businessIndustry: form.businessIndustry.trim(),
    businessRegistrationIdentifier: form.businessRegistrationIdentifier.trim(),
    businessRegistrationNumber: form.businessRegistrationNumber.trim(),
    websiteUrl: form.websiteUrl.trim(),
    companyType: form.companyType.trim(),
    ...(form.companyType === "public" && form.stockExchange.trim().length > 0
      ? { stockExchange: form.stockExchange.trim() }
      : {}),
    ...(form.companyType === "public" && form.stockTicker.trim().length > 0
      ? { stockTicker: form.stockTicker.trim() }
      : {}),
    ...(form.brandContactEmail.trim().length > 0
      ? { brandContactEmail: form.brandContactEmail.trim() }
      : {}),
    campaignDescription: form.campaignDescription.trim(),
    messageFlow: form.messageFlow.trim(),
    sampleMessages,
    ...(form.optInMessage.trim().length > 0
      ? { optInMessage: form.optInMessage.trim() }
      : {}),
    optOutMessage: form.optOutMessage.trim(),
    helpMessage: form.helpMessage.trim(),
    hasEmbeddedLinks: form.hasEmbeddedLinks,
    hasEmbeddedPhone: form.hasEmbeddedPhone,
    businessRegionsOfOperation: ["USA_AND_CANADA"],
    optInKeywords: ["START"],
    optOutKeywords: ["STOP"],
    helpKeywords: ["HELP"],
    address: {
      customerName:
        form.addressCustomerName.trim().length > 0
          ? form.addressCustomerName.trim()
          : businessName,
      street: form.addressStreet.trim(),
      ...(form.addressStreetSecondary.trim().length > 0
        ? { streetSecondary: form.addressStreetSecondary.trim() }
        : {}),
      city: form.addressCity.trim(),
      region: form.addressRegion.trim(),
      postalCode: form.addressPostalCode.trim(),
      isoCountry: form.addressIsoCountry.trim(),
    },
    authorizedRepresentative: {
      firstName: form.representativeFirstName.trim(),
      lastName: form.representativeLastName.trim(),
      businessTitle: form.representativeBusinessTitle.trim(),
      jobPosition: form.representativeJobPosition.trim(),
      phoneNumber: form.representativePhoneNumber.trim(),
      email: form.representativeEmail.trim(),
    },
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}

// ---------------------------------------------------------------------------
// Section wrapper — matches GitBook's title + description + content pattern
// ---------------------------------------------------------------------------

function BillingSection({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <SectionBlock
      action={action}
      description={description}
      title={title}
    >
      {children}
    </SectionBlock>
  );
}

// ---------------------------------------------------------------------------
// Bordered item — the horizontal info + action row used throughout GitBook
// ---------------------------------------------------------------------------

function BorderedItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Surface className={`px-6 py-5 ${className ?? ""}`}>
      {children}
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Plan section
// ---------------------------------------------------------------------------

function PlanSection({
  status,
  businessId,
  locale,
  t,
}: {
  status: BillingStatus;
  businessId: Id<"businesses">;
  locale: BillingLocale;
  t: BillingTranslation;
}) {
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const openPortal = useObservedAction(api.billing.openPortal);
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  const planLabel = getPlanLabel(status.plan, t);
  const displayedPlanMonthlyChargeCents = getDisplayedPlanMonthlyChargeCents(status);
  const price =
    displayedPlanMonthlyChargeCents !== null
      ? formatCents(displayedPlanMonthlyChargeCents, locale)
      : null;
  const planConfig = billingPlanCatalog[status.plan];
  const includedItems = [
    formatIncludedUsageLine({
      label: t("billing.currentPlan.includedVoiceLabel"),
      value:
        planConfig.voiceSecondsIncluded !== null
          ? voiceSecondsToMinutes(planConfig.voiceSecondsIncluded)
          : null,
      fallbackText: t("billing.currentPlan.includedVoiceUnlimited"),
    }),
    formatIncludedUsageLine({
      label: t("billing.currentPlan.includedOutboundLabel"),
      value: planConfig.outboundCallAttemptsIncluded,
      fallbackText: t("billing.currentPlan.includedOutboundUnlimited"),
    }),
    formatIncludedUsageLine({
      label: t("billing.currentPlan.includedSmsLabel"),
      value: planConfig.alertSmsSegmentsIncluded,
      fallbackText: t("billing.currentPlan.includedSmsUnlimited"),
    }),
    formatIncludedUsageLine({
      label: t("billing.currentPlan.includedStorageLabel"),
      value:
        planConfig.knowledgeStorageBytes !== null
          ? Math.round(
              (planConfig.knowledgeStorageBytes / (1024 * 1024 * 1024)) * 10,
            ) / 10
          : null,
      unit: "GB",
      fallbackText: t("billing.currentPlan.includedStorageUnlimited"),
    }),
  ];

  const canUpgrade =
    status.hasCheckoutAccess &&
    status.availableCheckoutPlans.includes("pro") &&
    status.plan === "free_cloud";
  const showManageSubscription = status.hasCustomerPortalAccess;

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const result = await startCheckout({ businessId, target: "pro" });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("portal");
    try {
      const result = await openPortal({ businessId });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.portalFailed"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <BillingSection title={t("billing.currentPlan.title")}>
      <BorderedItem>
        <div className="flex flex-col gap-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <span className="text-xl font-medium leading-7 text-foreground">
                {planLabel}
              </span>
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex flex-wrap items-end gap-2">
                  {price !== null ? (
                    <span className="text-4xl font-semibold tracking-tight text-foreground">
                      {price}
                    </span>
                  ) : (
                    <span className="text-base text-muted-foreground">
                      {t("billing.currentPlan.customPricing")}
                    </span>
                  )}
                  {price !== null ? (
                    <span className="pb-1 text-base text-muted-foreground">
                      {t("billing.currentPlan.monthlySuffix")}
                    </span>
                  ) : null}
                </div>
                {status.plan === "pro" && (
                  <span className="text-base text-muted-foreground">
                    {t("billing.currentPlan.paygMonthlySuffix")}
                  </span>
                )}
              </div>
              {status.plan === "free_cloud" ? (
                <span className="text-[15px] leading-6 text-muted-foreground">
                  {t("billing.currentPlan.freeCloudNotice")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <span className="text-base font-medium leading-6 text-foreground">
                {t("billing.currentPlan.includedTitle")}
              </span>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {includedItems.map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 text-emerald-500" />
                    <span className="text-[15px] leading-6 text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {(canUpgrade || showManageSubscription) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {canUpgrade && (
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  variant="outline"
                  disabled={loading === "checkout"}
                  onClick={() => void handleUpgrade()}
                >
                  {loading === "checkout"
                    ? t("billing.actions.openingCheckout")
                    : t("billing.actions.upgradeToPro")}
                </Button>
              )}
              {showManageSubscription && (
                <Button
                  className="w-full sm:w-auto"
                  size="sm"
                  variant="outline"
                  disabled={loading === "portal"}
                  onClick={() => void handleManage()}
                >
                  {loading === "portal"
                    ? t("billing.actions.openingPortal")
                    : t("billing.actions.manageSubscription")}
                  <ArrowUpRight className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Usage section — clean rows with thin inline progress bars
// ---------------------------------------------------------------------------

function UsageSection({
  status,
  locale,
  t,
}: {
  status: BillingStatus;
  locale: BillingLocale;
  t: BillingTranslation;
}) {
  const usage = status.usage;
  const plan = status.plan;
  const catalog = billingPlanCatalog[plan];
  const voiceUnit = t("billing.usage.units.voice");
  const outboundAttemptsUnit = t("billing.usage.units.outboundAttempts");
  const segmentsUnit = t("billing.usage.units.segments");

  if (plan === "self_host") return null;

  return (
    <div className="flex flex-col gap-10">
      <BillingSection
        title={t("billing.usage.title")}
        description={
          usage.resetAt
            ? t("billing.usage.description", {
                resetAt: formatResetDate(usage.resetAt, locale),
              })
            : undefined
        }
      >
        <BorderedItem className="p-0">
          <div className="px-6 py-5 border-b border-border last:border-b-0">
            <UsageMeterRow
            label={t("billing.usage.voiceTitle")}
            locale={locale}
            t={t}
            used={voiceSecondsToMinutes(usage.voiceSecondsUsed)}
            included={
              usage.voiceSecondsIncluded !== null
                ? voiceSecondsToMinutes(usage.voiceSecondsIncluded)
                : null
            }
            unit={voiceUnit}
            blocked={usage.voiceBlocked}
            overageRateCents={catalog.voiceOverageRatePerMinuteCents}
            overageBillable={catalog.overagesBillable}
            mode="included"
          />

          </div>

          <div className="px-6 py-5 border-b border-border last:border-b-0">
            <UsageMeterRow
            label={t("billing.usage.outboundAttemptsTitle")}
            locale={locale}
            t={t}
            used={usage.outboundCallAttemptsUsed}
            included={usage.outboundCallAttemptsIncluded}
            unit={outboundAttemptsUnit}
            blocked={usage.outboundCallAttemptsBlocked}
            overageRateCents={catalog.outboundCallAttemptOverageRateCents}
            overageBillable={catalog.overagesBillable}
            mode="included"
          />

          </div>

          <div className="px-6 py-5 border-b border-border last:border-b-0">
            <UsageMeterRow
            label={t("billing.usage.alertSmsTitle")}
            locale={locale}
            t={t}
            used={usage.alertSmsSegmentsUsed}
            included={usage.alertSmsSegmentsIncluded}
            unit={segmentsUnit}
            blocked={usage.alertSmsBlocked}
            overageRateCents={catalog.alertSmsOverageRatePerSegmentCents}
            overageBillable={catalog.overagesBillable}
            mode="included"
          />

          </div>

          <div className="px-6 py-5 border-b border-border last:border-b-0">
            <UsageMeterRow
            label={t("billing.usage.knowledgeTitle")}
            locale={locale}
            t={t}
            used={usage.knowledgeStorageBytesUsed}
            included={usage.knowledgeStorageBytesIncluded}
            unit="storage"
            blocked={usage.knowledgeStorageBlocked}
            overageRateCents={null}
            overageBillable={false}
            formatValue={formatStorage}
            mode="included"
          />
          </div>
        </BorderedItem>
      </BillingSection>

      {(catalog.overagesBillable || (AI_SMS_DASHBOARD_ENABLED && status.aiSmsEnabled)) && (
        <BillingSection
          title={t("billing.usage.paygTitle")}
          description={
            usage.resetAt
              ? t("billing.usage.paygDescription", {
                  resetAt: formatResetDate(usage.resetAt, locale),
                })
              : undefined
          }
        >
          <BorderedItem className="p-0 flex flex-col">
            {catalog.overagesBillable && (
              <>
                <div className="px-6 py-5 border-b border-border last:border-b-0">
                  <UsageMeterRow
                  label={t("billing.usage.voiceTitle")}
                  locale={locale}
                  t={t}
                  used={voiceSecondsToMinutes(usage.voiceSecondsUsed)}
                  included={
                    usage.voiceSecondsIncluded !== null
                      ? voiceSecondsToMinutes(usage.voiceSecondsIncluded)
                      : null
                  }
                  unit={voiceUnit}
                  blocked={usage.voiceBlocked}
                  overageRateCents={catalog.voiceOverageRatePerMinuteCents}
                  overageBillable={catalog.overagesBillable}
                  mode="payg"
                />
                </div>

                <div className="px-6 py-5 border-b border-border last:border-b-0">
                  <UsageMeterRow
                  label={t("billing.usage.outboundAttemptsTitle")}
                  locale={locale}
                  t={t}
                  used={usage.outboundCallAttemptsUsed}
                  included={usage.outboundCallAttemptsIncluded}
                  unit={outboundAttemptsUnit}
                  blocked={usage.outboundCallAttemptsBlocked}
                  overageRateCents={catalog.outboundCallAttemptOverageRateCents}
                  overageBillable={catalog.overagesBillable}
                  mode="payg"
                />
                </div>

                <div className="px-6 py-5 border-b border-border last:border-b-0">
                  <UsageMeterRow
                  label={t("billing.usage.alertSmsTitle")}
                  locale={locale}
                  t={t}
                  used={usage.alertSmsSegmentsUsed}
                  included={usage.alertSmsSegmentsIncluded}
                  unit={segmentsUnit}
                  blocked={usage.alertSmsBlocked}
                  overageRateCents={catalog.alertSmsOverageRatePerSegmentCents}
                  overageBillable={catalog.overagesBillable}
                  mode="payg"
                  />
                </div>
              </>
            )}

            {AI_SMS_DASHBOARD_ENABLED && status.aiSmsEnabled && (
              <div className="px-6 py-5 border-b border-border last:border-b-0">
                <UsageMeterRow
                  label={t("billing.usage.aiSmsTitle")}
                  locale={locale}
                  t={t}
                  used={usage.aiSmsSegmentsUsed}
                  included={null}
                  unit={segmentsUnit}
                  blocked={false}
                  overageRateCents={billingAddonCatalog.ai_sms.usageRatePerSegmentCents}
                  overageBillable
                  metered
                  mode="payg"
                />
              </div>
            )}
          </BorderedItem>
        </BillingSection>
      )}
    </div>
  );
}

function UsageUnavailableSection({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection
      title={t("billing.usage.title")}
      description={t("billing.currentPlan.selfHostNotice")}
    >
      <BorderedItem>
        <p className="text-[15px] leading-6 text-muted-foreground">
          {t("billing.currentPlan.selfHostNotice")}
        </p>
      </BorderedItem>
    </BillingSection>
  );
}

function UsageMeterRow({
  label,
  locale,
  t,
  used,
  included,
  unit,
  blocked,
  overageRateCents,
  overageBillable,
  metered,
  formatValue,
  mode = "included",
}: {
  label: string;
  locale: BillingLocale;
  t: BillingTranslation;
  used: number;
  included: number | null;
  unit: string;
  blocked: boolean;
  overageRateCents: number | null;
  overageBillable: boolean;
  metered?: boolean;
  formatValue?: (value: number, referenceValue?: number | null) => string;
  mode?: "included" | "payg";
}) {
  const pct = included !== null && included > 0 ? (used / included) * 100 : 0;
  const isOver = included !== null && used > included;
  const overageCount = isOver ? used - included : 0;
  const overageCost =
    overageBillable && overageRateCents && overageCount > 0
      ? overageCount * overageRateCents
      : 0;
  const paygUnits = metered ? used : overageCount;

  const valueDisplay =
    mode === "payg"
      ? formatValue
        ? formatValue(paygUnits, included)
        : paygUnits
      : formatValue
        ? formatValue(used, included)
        : used;

  const totalDisplay =
    mode === "included"
      ? included !== null
        ? formatValue
          ? formatValue(included, included)
          : included
        : null
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium leading-6 text-foreground">
          {label}
        </span>
        <span className="text-[15px] tabular-nums leading-6 text-muted-foreground">
          {valueDisplay}
          {totalDisplay !== null ? ` / ${totalDisplay}` : ""}
          {!formatValue && ` ${unit}`}
          {mode === "payg" && metered ? ` ${t("billing.usage.meteredSuffix")}` : ""}
        </span>
      </div>

      {/* Thin progress bar */}
      {mode === "included" && included !== null && included > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              blocked
                ? "bg-destructive"
                : isOver
                  ? "bg-foreground"
                  : "bg-foreground"
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {/* Overage note */}
      {mode === "included" && overageCost > 0 && (
        <span className="text-sm tabular-nums leading-6 text-muted-foreground">
          <Trans
            i18nKey="billing.usage.overIncludedSummary"
            ns="settings"
            values={{
              amount: formatCents(overageCost, locale),
              count: overageCount,
              unit,
            }}
            components={{
              amount: <span className="font-medium text-foreground" />,
            }}
          />
        </span>
      )}
      {mode === "included" && blocked && (
        <span className="text-sm leading-6 text-destructive">
          {t("billing.usage.blockedDescription")}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-ons section — GitBook style with toggle/action
// ---------------------------------------------------------------------------

function AddonsSection({
  status,
  businessId,
  locale,
  t,
}: {
  status: BillingStatus;
  businessId: Id<"businesses">;
  locale: BillingLocale;
  t: BillingTranslation;
}) {
  const startCheckout = useObservedAction(api.billing.startCheckout);
  const [loading, setLoading] = useState<"ai_sms" | "pro" | null>(null);
  const isOperational = status.aiSmsReady;
  const setupRequired =
    status.aiSmsEnabled && !status.aiSmsReady && status.plan !== "self_host";
  const canPurchase = status.canPurchaseAiSmsAddon;
  const canUpgradeToPro =
    status.hasCheckoutAccess &&
    status.availableCheckoutPlans.includes("pro");
  const addonMonthlyPrice = formatCents(
    billingAddonCatalog.ai_sms.recurringMonthlyChargeCents,
    locale,
  );
  const isFreePlanLocked =
    status.plan === "free_cloud" &&
    !isOperational &&
    canUpgradeToPro;

  async function handleAddAiSms() {
    setLoading("ai_sms");
    try {
      const result = await startCheckout({ businessId, target: "ai_sms" });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
    }
  }

  async function handleUpgradeToPro() {
    if (!canUpgradeToPro) {
      return;
    }

    setLoading("pro");
    try {
      const result = await startCheckout({ businessId, target: "pro" });
      window.location.assign(result.url);
    } catch {
      toast.error(t("billing.toast.checkoutFailed"));
    } finally {
      setLoading(null);
    }
  }

  const enableControl = isOperational ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-[11px] tracking-wide text-emerald-700"
    >
      {t("billing.addon.aiSmsActiveBadge")}
    </Badge>
  ) : setupRequired && status.hasBillingManagementAccess ? (
    <Button
      size="sm"
      variant="outline"
      render={<Link to="/settings/plan/ai-sms-compliance" />}
    >
      {t("billing.addon.register")}
    </Button>
  ) : setupRequired ? (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-[11px] tracking-wide text-amber-900"
    >
      {t("billing.addon.aiSmsSetupRequiredBadge")}
    </Badge>
  ) : (
    <Button
      size="sm"
      variant="outline"
      aria-label={t("billing.addon.aiSmsName")}
      disabled={loading !== null || !canPurchase}
      onClick={() => void handleAddAiSms()}
    >
      {loading === "ai_sms"
        ? t("billing.actions.openingCheckout")
        : t("billing.addon.enable")}
    </Button>
  );

  return (
    <BillingSection
      title={t("billing.addon.title")}
      description={t("billing.addon.aiSmsDescription")}
    >
      <BorderedItem>
        <div className="flex w-full flex-col gap-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-medium tracking-tight text-foreground">
                  {t("billing.addon.aiSmsName")}
                </span>
                {isOperational && (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-[11px] tracking-wide text-emerald-700"
                  >
                    {t("billing.addon.aiSmsActiveBadge")}
                  </Badge>
                )}
                {!isOperational && setupRequired && (
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-[11px] tracking-wide text-amber-900"
                  >
                    {t("billing.addon.aiSmsSetupRequiredBadge")}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-2 shrink-0 md:mt-0">
              {isFreePlanLocked ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    {enableControl}
                  </TooltipTrigger>
                  <TooltipContent className="pointer-events-auto gap-1">
                    <span>{t("billing.addon.aiSmsRequiresProPrefix")}</span>
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-background underline underline-offset-2 hover:text-background/80"
                      disabled={loading !== null}
                      onClick={() => void handleUpgradeToPro()}
                    >
                      {t("billing.addon.aiSmsRequiresProLink")}
                    </Button>
                  </TooltipContent>
                </Tooltip>
              ) : (
                enableControl
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 text-emerald-500" />
              <span className="text-[15px] leading-relaxed text-foreground">
                {t("billing.addon.aiSmsFeatures.smsQueries")}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 text-emerald-500" />
              <span className="text-[15px] leading-relaxed text-foreground">
                {t("billing.addon.aiSmsFeatures.staffAlerts")}
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 text-emerald-500" />
              <span className="text-[15px] leading-relaxed text-foreground">
                {t("billing.addon.aiSmsFeatures.compliance")}
              </span>
            </div>
          </div>

          <div className="flex flex-col pt-2">
            <span className="mb-4 text-sm font-medium text-muted-foreground">
              {t("billing.addon.associatedFees")}
            </span>
            <div className="flex items-center justify-between border-b border-border/60 py-3.5 text-[15px]">
              <span className="text-muted-foreground">{t("billing.addon.carrierSetupFees")}</span>
              <span className="font-medium text-foreground">
                {t("billing.addon.oneTimeFeeValue", {
                  amount: formatCents(
                    billingAddonCatalog.ai_sms.oneTimeSetupChargeCents,
                    locale,
                  ),
                })}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border/60 py-3.5 text-[15px]">
              <span className="text-muted-foreground">{t("billing.addon.monthlyFee")}</span>
              <span className="flex items-baseline gap-1 font-medium text-foreground">
                <span>{addonMonthlyPrice}</span>
                <span>{t("billing.currentPlan.monthlySuffix")}</span>
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-[15px]">
              <span className="text-muted-foreground">{t("billing.addon.messagingRate")}</span>
              <span className="font-medium text-foreground">
                {t("billing.addon.perSegmentFeeValue", {
                  amount: formatCents(
                    billingAddonCatalog.ai_sms.usageRatePerSegmentCents,
                    locale,
                  ),
                })}
              </span>
            </div>
          </div>
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function getComplianceBadge(
  status: SmsComplianceStatus,
  t: BillingTranslation,
): { label: string; className: string } {
  switch (status) {
    case "approved":
      return {
        label: t("billing.compliance.status.approved"),
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "pending_brand_verification":
      return {
        label: t("billing.compliance.status.awaitingVerification"),
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "pending_review":
    case "submitting":
      return {
        label: t("billing.compliance.status.underReview"),
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "failed":
      return {
        label: t("billing.compliance.status.failed"),
        className: "border-destructive/20 bg-destructive/10 text-destructive",
      };
    case "suspended":
      return {
        label: t("billing.compliance.status.suspended"),
        className: "border-destructive/20 bg-destructive/10 text-destructive",
      };
    case "not_started":
    case "collecting_info":
    default:
      return {
        label: t("billing.compliance.status.setupRequired"),
        className: "border-amber-200 bg-amber-50 text-amber-900",
      };
  }
}

function getCompliancePrimaryActionLabel(
  status: SmsComplianceStatus,
  t: BillingTranslation,
): string {
  switch (status) {
    case "pending_brand_verification":
      return t("billing.compliance.actions.resume");
    case "pending_review":
    case "approved":
    case "suspended":
      return t("billing.compliance.actions.refresh");
    default:
      return t("billing.compliance.actions.submit");
  }
}

function canEditApprovedPhoneNumber(compliance: SmsComplianceState): boolean {
  const hasStaleApprovedPhoneNumber =
    compliance.approvedPhoneNumberId !== undefined &&
    !compliance.availablePhoneNumbers.some(
      (phoneNumber) => phoneNumber.id === compliance.approvedPhoneNumberId,
    );

  return (
    canEditComplianceDraft(compliance.status) ||
    compliance.status === "pending_brand_verification" ||
    (compliance.status === "approved" && hasStaleApprovedPhoneNumber)
  );
}

function canEditComplianceDraft(status: SmsComplianceStatus): boolean {
  return status === "not_started" || status === "collecting_info" || status === "failed";
}

function isSuccessfulComplianceActionStatus(status: SmsComplianceStatus): boolean {
  return status !== "failed" && status !== "suspended";
}

function getComplianceSenderModeCopy(
  senderMode: SmsComplianceState["senderMode"],
  t: BillingTranslation,
): string {
  switch (senderMode) {
    case "business_messaging_service":
      return t("billing.compliance.senderMode.businessMessagingService");
    case "business_phone":
      return t("billing.compliance.senderMode.businessPhone");
    case "platform_phone":
    default:
      return t("billing.compliance.senderMode.platformPhone");
  }
}

function AiSmsComplianceSection({
  businessId,
  compliance,
  t,
}: {
  businessId: Id<"businesses">;
  compliance: SmsComplianceState;
  t: BillingTranslation;
}) {
  const saveComplianceForm = useObservedMutation(api.smsCompliance.saveComplianceForm);
  const startRegistration = useObservedAction(api.smsCompliance.startRegistration);
  const resumeRegistration = useObservedAction(api.smsCompliance.resumeRegistration);
  const refreshRegistration = useObservedAction(api.smsCompliance.refreshStatus);
  const { data: campaignOptions } = useSmsComplianceCampaignOptions();
  const [form, setForm] = useState<SmsComplianceFormState>(() =>
    buildSmsComplianceFormState(compliance),
  );
  const [loading, setLoading] = useState<null | "save" | "action">(null);
  const isDraftEditable = canEditComplianceDraft(compliance.status);
  const canEditPhoneNumber = canEditApprovedPhoneNumber(compliance);
  const isPublicCompany = form.companyType === "public";

  useEffect(() => {
    setForm(buildSmsComplianceFormState(compliance));
  }, [compliance]);

  const badge = getComplianceBadge(compliance.status, t);
  const primaryActionLabel = getCompliancePrimaryActionLabel(compliance.status, t);
  const availableCampaignOptions = campaignOptions ?? [
    {
      value: "low_volume" as const,
      twilioUsecaseCode: "LOW_VOLUME",
      recommended: true,
    },
    {
      value: "mixed" as const,
      twilioUsecaseCode: "MIXED",
      recommended: false,
    },
  ];

  async function persistDraft() {
    await saveComplianceForm({
      businessId,
      trafficTier: form.trafficTier,
      draft: buildSmsComplianceDraft(form),
      ...(form.approvedPhoneNumberId
        ? { approvedPhoneNumberId: form.approvedPhoneNumberId as Id<"phone_numbers"> }
        : {}),
    });
  }

  async function handleSave() {
    if (!isDraftEditable && !canEditPhoneNumber) {
      return;
    }

    setLoading("save");
    try {
      await persistDraft();
      toast.success(t("billing.compliance.toast.saved"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("billing.compliance.toast.saveFailed")));
    } finally {
      setLoading(null);
    }
  }

  async function handlePrimaryAction() {
    setLoading("action");
    try {
      if (isDraftEditable || canEditPhoneNumber) {
        await persistDraft();
      }

      let result:
        | {
            registrationId: Id<"sms_compliance_registrations">;
            status: SmsComplianceStatus;
          }
        | undefined;

      if (compliance.status === "pending_brand_verification") {
        result = await resumeRegistration({ businessId });
      } else if (
        compliance.status === "pending_review" ||
        compliance.status === "approved" ||
        compliance.status === "suspended"
      ) {
        result = await refreshRegistration({ businessId });
      } else {
        result = await startRegistration({ businessId });
      }

      if (result && isSuccessfulComplianceActionStatus(result.status)) {
        toast.success(t("billing.compliance.toast.submitted"));
      } else {
        toast.error(t("billing.compliance.toast.submitFailed"));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, t("billing.compliance.toast.submitFailed")));
    } finally {
      setLoading(null);
    }
  }

  return (
    <BillingSection
      title={t("billing.compliance.title")}
      description={t("billing.compliance.description")}
    >
      <BorderedItem className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium leading-6 text-foreground">
                {t("billing.compliance.cardTitle")}
              </span>
              <Badge
                variant="outline"
                className={`text-[11px] tracking-wide ${badge.className}`}
              >
                {badge.label}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("billing.compliance.routingSummary", {
                senderMode: getComplianceSenderModeCopy(compliance.senderMode, t),
              })}
            </p>
            {compliance.approvedPhoneNumberE164 && (
              <p className="text-sm leading-6 text-muted-foreground">
                {t("billing.compliance.approvedNumber", {
                  phoneNumber: compliance.approvedPhoneNumberE164,
                })}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void handleSave()}
              disabled={loading !== null || !isDraftEditable}
            >
              {loading === "save" ? t("billing.compliance.actions.saving") : t("billing.compliance.actions.save")}
            </Button>
            <Button onClick={() => void handlePrimaryAction()} disabled={loading !== null}>
              {loading === "action" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("billing.compliance.actions.working")}
                </>
              ) : compliance.status === "pending_review" ||
                compliance.status === "approved" ||
                compliance.status === "suspended" ? (
                <>
                  <RefreshCw className="size-4" />
                  {primaryActionLabel}
                </>
              ) : (
                primaryActionLabel
              )}
            </Button>
          </div>
        </div>

        {(compliance.pendingAction?.message || compliance.failureMessage) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {compliance.pendingAction?.message ?? compliance.failureMessage}
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.approvedPhoneNumber")}</Label>
            <Select
              value={form.approvedPhoneNumberId}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  approvedPhoneNumberId: value ?? current.approvedPhoneNumberId,
                }))
              }
              disabled={
                loading !== null ||
                !canEditPhoneNumber ||
                compliance.availablePhoneNumbers.length === 0
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={t("billing.compliance.fields.approvedPhoneNumber")}
                />
              </SelectTrigger>
              <SelectContent>
                {compliance.availablePhoneNumbers.map((phoneNumber) => (
                  <SelectItem key={phoneNumber.id} value={phoneNumber.id}>
                    {phoneNumber.e164}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset
          className="contents"
          disabled={loading !== null || !isDraftEditable}
        >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-business-name">
              {t("billing.compliance.fields.businessName")}
            </Label>
            <Input
              id="sms-compliance-business-name"
              value={form.businessName}
              onChange={(event) =>
                setForm((current) => ({ ...current, businessName: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-website">
              {t("billing.compliance.fields.websiteUrl")}
            </Label>
            <Input
              id="sms-compliance-website"
              value={form.websiteUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, websiteUrl: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.businessType")}</Label>
            <Select
              value={form.businessType}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessType: value ?? current.businessType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_COMPLIANCE_BUSINESS_TYPE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatSmsComplianceOptionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.businessIndustry")}</Label>
            <Select
              value={form.businessIndustry}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessIndustry: value ?? current.businessIndustry,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_COMPLIANCE_BUSINESS_INDUSTRY_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatSmsComplianceOptionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.businessRegistrationIdentifier")}</Label>
            <Select
              value={form.businessRegistrationIdentifier}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  businessRegistrationIdentifier:
                    value ?? current.businessRegistrationIdentifier,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_COMPLIANCE_REGISTRATION_IDENTIFIER_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatSmsComplianceOptionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-tax-id-number">
              {t("billing.compliance.fields.businessRegistrationNumber")}
            </Label>
            <Input
              id="sms-compliance-tax-id-number"
              value={form.businessRegistrationNumber}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  businessRegistrationNumber: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.companyType")}</Label>
            <Select
              value={form.companyType}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  companyType: value ?? current.companyType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t("billing.compliance.companyTypes.private")}</SelectItem>
                <SelectItem value="non-profit">{t("billing.compliance.companyTypes.nonProfit")}</SelectItem>
                <SelectItem value="government">{t("billing.compliance.companyTypes.government")}</SelectItem>
                <SelectItem value="public">{t("billing.compliance.companyTypes.public")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isPublicCompany && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sms-compliance-stock-exchange">
                  {t("billing.compliance.fields.stockExchange")}
                </Label>
                <Input
                  id="sms-compliance-stock-exchange"
                  value={form.stockExchange}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stockExchange: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sms-compliance-stock-ticker">
                  {t("billing.compliance.fields.stockTicker")}
                </Label>
                <Input
                  id="sms-compliance-stock-ticker"
                  value={form.stockTicker}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stockTicker: event.target.value,
                    }))
                  }
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-brand-contact">
              {t("billing.compliance.fields.brandContactEmail")}
            </Label>
            <Input
              id="sms-compliance-brand-contact"
              value={form.brandContactEmail}
              onChange={(event) =>
                setForm((current) => ({ ...current, brandContactEmail: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-rep-first-name">
              {t("billing.compliance.fields.representativeFirstName")}
            </Label>
            <Input
              id="sms-compliance-rep-first-name"
              value={form.representativeFirstName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  representativeFirstName: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-rep-last-name">
              {t("billing.compliance.fields.representativeLastName")}
            </Label>
            <Input
              id="sms-compliance-rep-last-name"
              value={form.representativeLastName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  representativeLastName: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-rep-title">
              {t("billing.compliance.fields.representativeBusinessTitle")}
            </Label>
            <Input
              id="sms-compliance-rep-title"
              value={form.representativeBusinessTitle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  representativeBusinessTitle: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.representativeJobPosition")}</Label>
            <Select
              value={form.representativeJobPosition}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  representativeJobPosition: value ?? current.representativeJobPosition,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SMS_COMPLIANCE_JOB_POSITION_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatSmsComplianceOptionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-rep-phone">
              {t("billing.compliance.fields.representativePhoneNumber")}
            </Label>
            <Input
              id="sms-compliance-rep-phone"
              value={form.representativePhoneNumber}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  representativePhoneNumber: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-rep-email">
              {t("billing.compliance.fields.representativeEmail")}
            </Label>
            <Input
              id="sms-compliance-rep-email"
              value={form.representativeEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  representativeEmail: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-name">
              {t("billing.compliance.fields.addressCustomerName")}
            </Label>
            <Input
              id="sms-compliance-address-name"
              value={form.addressCustomerName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  addressCustomerName: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-street">
              {t("billing.compliance.fields.addressStreet")}
            </Label>
            <Input
              id="sms-compliance-address-street"
              value={form.addressStreet}
              onChange={(event) =>
                setForm((current) => ({ ...current, addressStreet: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-street-2">
              {t("billing.compliance.fields.addressStreetSecondary")}
            </Label>
            <Input
              id="sms-compliance-address-street-2"
              value={form.addressStreetSecondary}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  addressStreetSecondary: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-city">
              {t("billing.compliance.fields.addressCity")}
            </Label>
            <Input
              id="sms-compliance-address-city"
              value={form.addressCity}
              onChange={(event) =>
                setForm((current) => ({ ...current, addressCity: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-region">
              {t("billing.compliance.fields.addressRegion")}
            </Label>
            <Input
              id="sms-compliance-address-region"
              value={form.addressRegion}
              onChange={(event) =>
                setForm((current) => ({ ...current, addressRegion: event.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-postal-code">
              {t("billing.compliance.fields.addressPostalCode")}
            </Label>
            <Input
              id="sms-compliance-address-postal-code"
              value={form.addressPostalCode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  addressPostalCode: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-address-country">
              {t("billing.compliance.fields.addressIsoCountry")}
            </Label>
            <Input
              id="sms-compliance-address-country"
              value={form.addressIsoCountry}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  addressIsoCountry: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("billing.compliance.fields.trafficTier")}</Label>
            <Select
              value={form.trafficTier}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  trafficTier: value ?? current.trafficTier,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableCampaignOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value === "low_volume"
                      ? t("billing.compliance.trafficTier.lowVolume")
                      : t("billing.compliance.trafficTier.mixed")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-campaign-description">
              {t("billing.compliance.fields.campaignDescription")}
            </Label>
            <Textarea
              id="sms-compliance-campaign-description"
              value={form.campaignDescription}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  campaignDescription: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sms-compliance-message-flow">
              {t("billing.compliance.fields.messageFlow")}
            </Label>
            <Textarea
              id="sms-compliance-message-flow"
              value={form.messageFlow}
              onChange={(event) =>
                setForm((current) => ({ ...current, messageFlow: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sms-compliance-sample-message-one">
                {t("billing.compliance.fields.sampleMessageOne")}
              </Label>
              <Textarea
                id="sms-compliance-sample-message-one"
                value={form.sampleMessageOne}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sampleMessageOne: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sms-compliance-sample-message-two">
                {t("billing.compliance.fields.sampleMessageTwo")}
              </Label>
              <Textarea
                id="sms-compliance-sample-message-two"
                value={form.sampleMessageTwo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sampleMessageTwo: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sms-compliance-opt-in-message">
                {t("billing.compliance.fields.optInMessage")}
              </Label>
              <Textarea
                id="sms-compliance-opt-in-message"
                value={form.optInMessage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, optInMessage: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sms-compliance-opt-out-message">
                {t("billing.compliance.fields.optOutMessage")}
              </Label>
              <Textarea
                id="sms-compliance-opt-out-message"
                value={form.optOutMessage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, optOutMessage: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sms-compliance-help-message">
                {t("billing.compliance.fields.helpMessage")}
              </Label>
              <Textarea
                id="sms-compliance-help-message"
                value={form.helpMessage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, helpMessage: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <Label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={form.hasEmbeddedLinks}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    hasEmbeddedLinks: Boolean(checked),
                  }))
                }
              />
              {t("billing.compliance.fields.hasEmbeddedLinks")}
            </Label>
            <Label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={form.hasEmbeddedPhone}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    hasEmbeddedPhone: Boolean(checked),
                  }))
                }
              />
              {t("billing.compliance.fields.hasEmbeddedPhone")}
            </Label>
          </div>
        </div>
        </fieldset>
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Spending cap placeholder
// ---------------------------------------------------------------------------

function SpendingCapSection({
  status,
  t,
}: {
  status: BillingStatus;
  t: BillingTranslation;
}) {
  if (status.plan !== "pro" && status.plan !== "enterprise") return null;

  return (
    <BillingSection
      title={t("billing.spendingCap.title")}
      description={t("billing.spendingCap.description")}
    >
      <BorderedItem className="opacity-60">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-xs flex-1">
            <Input
              disabled
              placeholder={t("billing.spendingCap.placeholder")}
              className="pr-10"
            />
            <Lock className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] tracking-wide">
            {t("billing.spendingCap.comingSoon")}
          </Badge>
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

function TransactionsSection({
  status,
  locale,
  t,
}: {
  status: BillingStatus;
  locale: BillingLocale;
  t: BillingTranslation;
}) {
  const transactions = status.recentTransactions;
  if (!transactions || transactions.length === 0) return null;

  return (
    <BillingSection
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <TableCard>
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => {
              const isRefund = tx.kind === "refund";
              return (
                <TableRow key={tx.sourceId}>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {formatTransactionDate(tx.occurredAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {tx.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-medium text-foreground">
                    {isRefund ? "−" : ""}
                    {formatCents(tx.amountCents, locale, tx.currency.toUpperCase())}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground capitalize">
                      {tx.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {tx.invoiceUrl ? (
                      <Button
                        render={
                          <a
                            href={tx.invoiceUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          />
                        }
                        variant="ghost"
                        size="sm"
                        className="h-auto gap-1 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("billing.transactions.invoice")}
                        <ArrowUpRight className="size-3" />
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
    </BillingSection>
  );
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function PlanSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection title={t("billing.currentPlan.title")}>
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function UsageSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <div className="flex flex-col gap-10">
      <BillingSection
        title={t("billing.usage.title")}
        description={<Skeleton className="h-4 w-44" />}
      >
        <BorderedItem className="flex flex-col gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </BorderedItem>
      </BillingSection>

      <BillingSection
        title={t("billing.usage.paygTitle")}
        description={<Skeleton className="h-4 w-44" />}
      >
        <BorderedItem className="flex flex-col gap-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </BorderedItem>
      </BillingSection>
    </div>
  );
}

function AddonsSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection
      title={t("billing.addon.title")}
      description={t("billing.addon.aiSmsDescription")}
    >
      <BorderedItem>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function AiSmsComplianceSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection
      title={t("billing.compliance.title")}
      description={t("billing.compliance.description")}
    >
      <BorderedItem className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-8 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </BorderedItem>
    </BillingSection>
  );
}

function SpendingCapSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection
      title={t("billing.spendingCap.title")}
      description={t("billing.spendingCap.description")}
    >
      <BorderedItem className="opacity-60">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 max-w-xs flex-1 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </BorderedItem>
    </BillingSection>
  );
}

function TransactionsSectionSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <BillingSection
      title={t("billing.transactions.title")}
      description={t("billing.transactions.description")}
    >
      <TableCard>
        <Table className="min-w-[42rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.date")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.description")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.amount")}
              </TableHead>
              <TableHead className="text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.status")}
              </TableHead>
              <TableHead className="text-right text-[13px] font-medium text-muted-foreground">
                {t("billing.transactions.columns.invoice")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </BillingSection>
  );
}

function BillingOverviewSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <div className="flex w-full flex-col gap-10">
      <PlanSectionSkeleton t={t} />
      {AI_SMS_DASHBOARD_ENABLED && <AddonsSectionSkeleton t={t} />}
      <SpendingCapSectionSkeleton t={t} />
      <TransactionsSectionSkeleton t={t} />
    </div>
  );
}

function BillingUsageSkeleton({
  t,
}: {
  t: BillingTranslation;
}) {
  return (
    <div className="flex w-full flex-col gap-10">
      <UsageSectionSkeleton t={t} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SettingsBillingPage(props: SettingsBillingPageProps) {
  const { i18n, t } = useTranslation("settings");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const { data: status, isInitialLoading: isLoadingStatus } = useBillingStatus(props.businessId);
  const [searchParams, setSearchParams] = useSearchParams();
  const refreshCheckoutStatus = useObservedAction(api.billing.refreshCheckoutStatus);
  const checkoutRefreshKeyRef = useRef<string | null>(null);
  const checkoutStatus = searchParams.get("checkout");
  const checkoutTarget = parseCheckoutReturnTarget(searchParams.get("checkout_target"));
  const hasCheckoutSessionTokenParam = searchParams.has(
    CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM,
  );

  useEffect(() => {
    if (checkoutStatus !== "success") {
      return;
    }

    const checkoutSessionToken = takeCheckoutSessionToken(searchParams);
    const refreshKey = `${String(props.businessId)}:${checkoutSessionToken ?? "success"}:${checkoutTarget ?? "unknown"}`;
    if (checkoutRefreshKeyRef.current === refreshKey) {
      return;
    }
    checkoutRefreshKeyRef.current = refreshKey;

    if (hasCheckoutSessionTokenParam) {
      setSearchParams(deleteCheckoutSessionTokenParam(searchParams), { replace: true });
    }

    void refreshCheckoutStatus({
      businessId: props.businessId,
      ...(checkoutSessionToken ? { customerSessionToken: checkoutSessionToken } : {}),
      ...(checkoutTarget ? { target: checkoutTarget } : {}),
    })
      .then((result) => {
        if (!result.synced) {
          checkoutRefreshKeyRef.current = null;
          return;
        }

        clearStoredCheckoutSessionToken();
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete("checkout");
        nextSearchParams.delete("checkout_target");
        nextSearchParams.delete(CHECKOUT_CUSTOMER_SESSION_TOKEN_PARAM);
        setSearchParams(nextSearchParams, { replace: true });
      })
      .catch(() => {
        checkoutRefreshKeyRef.current = null;
      });
  }, [
    checkoutStatus,
    checkoutTarget,
    hasCheckoutSessionTokenParam,
    props.businessId,
    refreshCheckoutStatus,
    searchParams,
    setSearchParams,
  ]);

  if (isLoadingStatus || !status) {
    return <BillingOverviewSkeleton t={t} />;
  }

  if (status.plan === "self_host") {
    return (
      <div className="flex w-full flex-col gap-10">
        <PlanSection
          status={status}
          businessId={props.businessId}
          locale={locale}
          t={t}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <PlanSection
        status={status}
        businessId={props.businessId}
        locale={locale}
        t={t}
      />
      {AI_SMS_DASHBOARD_ENABLED && (
        <AddonsSection
          status={status}
          businessId={props.businessId}
          locale={locale}
          t={t}
        />
      )}
      <SpendingCapSection status={status} t={t} />
      <TransactionsSection status={status} locale={locale} t={t} />
    </div>
  );
}

export function SettingsBillingCompliancePage(props: SettingsBillingPageProps) {
  const { t } = useTranslation("settings");
  const { data: status, isInitialLoading: isLoadingStatus } = useBillingStatus(props.businessId);

  const shouldFetchCompliance = Boolean(
    AI_SMS_DASHBOARD_ENABLED &&
      status &&
      status.hasBillingManagementAccess &&
      status.plan !== "self_host" &&
      status.aiSmsEnabled,
  );
  const {
    data: compliance,
    isInitialLoading: isLoadingCompliance,
  } = useSmsComplianceStatus(props.businessId, shouldFetchCompliance);

  if (!AI_SMS_DASHBOARD_ENABLED) {
    return <Navigate replace to="/settings/plan" />;
  }

  if (isLoadingStatus || !status || (shouldFetchCompliance && isLoadingCompliance)) {
    return <AiSmsComplianceSectionSkeleton t={t} />;
  }

  if (!shouldFetchCompliance) {
    return <Navigate replace to="/settings/plan" />;
  }

  if (!compliance) {
    return <AiSmsComplianceSectionSkeleton t={t} />;
  }

  return (
    <div className="flex w-full flex-col gap-10">
      <Link
        className="type-body-muted inline-flex w-fit items-center gap-1.5 transition-colors hover:text-foreground"
        to="/settings/plan"
      >
        <ArrowLeft className="size-4" />
        {t("billing.compliance.actions.backToBilling")}
      </Link>
      <AiSmsComplianceSection
        businessId={props.businessId}
        compliance={compliance}
        t={t}
      />
    </div>
  );
}

export function SettingsBillingUsagePage(props: SettingsBillingPageProps) {
  const { i18n, t } = useTranslation("settings");
  const locale = resolveLocale(i18n.resolvedLanguage, i18n.language);
  const { data: status, isInitialLoading: isLoadingStatus } = useBillingStatus(props.businessId);

  if (isLoadingStatus || !status) {
    return <BillingUsageSkeleton t={t} />;
  }

  return (
    <div className="flex w-full flex-col gap-10">
      {status.plan === "self_host" ? (
        <UsageUnavailableSection t={t} />
      ) : (
        <UsageSection status={status} locale={locale} t={t} />
      )}
    </div>
  );
}
