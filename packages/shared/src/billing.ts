export const billingPlanSlugs = [
  "self_host",
  "free_cloud",
  "starter",
  "pro",
  "enterprise",
] as const;
export type BillingPlanSlug = (typeof billingPlanSlugs)[number];

export const cloudBillingPlanSlugs = [
  "free_cloud",
  "starter",
  "pro",
  "enterprise",
] as const;
export type CloudBillingPlanSlug = (typeof cloudBillingPlanSlugs)[number];

export const hostedCheckoutPlanSlugs = ["starter", "pro"] as const;
export type HostedCheckoutPlanSlug = (typeof hostedCheckoutPlanSlugs)[number];

export const billingIntervals = ["monthly", "annual"] as const;
export type BillingInterval = (typeof billingIntervals)[number];
export type HostedCheckoutPlanIntervals = Record<
  HostedCheckoutPlanSlug,
  Array<BillingInterval>
>;

export const billingAddonSlugs = ["ai_sms"] as const;
export type BillingAddonSlug = (typeof billingAddonSlugs)[number];

export const smsCapabilities = ["alert", "ai"] as const;
export type SmsCapability = (typeof smsCapabilities)[number];

export const smsSenderRoles = ["platform_alert", "business_ai"] as const;
export type SmsSenderRole = (typeof smsSenderRoles)[number];

export const billingUsageKinds = [
  "voice_seconds",
  "alert_sms_segments",
  "outbound_call_attempts",
  "ai_sms_segments",
] as const;
export type BillingUsageKind = (typeof billingUsageKinds)[number];

export const billingTransactionKinds = ["order", "refund"] as const;
export type BillingTransactionKind = (typeof billingTransactionKinds)[number];

export const billingErrorCodes = {
  voiceLimitReached: "voice_limit_reached",
  alertSmsLimitReached: "alert_sms_limit_reached",
  outboundCallAttemptLimitReached: "outbound_call_attempt_limit_reached",
  aiSmsNotEnabled: "ai_sms_not_enabled",
  dedicatedNumberRequiresPaidPlan: "dedicated_number_requires_paid_plan",
} as const;

export type BillingErrorCode =
  (typeof billingErrorCodes)[keyof typeof billingErrorCodes];

export type UsageBillingErrorCode = Exclude<
  BillingErrorCode,
  typeof billingErrorCodes.dedicatedNumberRequiresPaidPlan
>;

export const billingMeterEventNames = {
  voiceMinutes: "billing.voice_minutes",
  alertSmsSegments: "billing.alert_sms_segments",
  outboundCallAttempts: "billing.outbound_call_attempts",
  aiSmsSegments: "billing.ai_sms_segments",
} as const;

export const billingPlanCatalog = {
  self_host: {
    hostedBilling: false,
    monthlyChargeCents: 0,
    annualChargeCents: null,
    annualEffectiveMonthlyChargeCents: null,
    knowledgeStorageBytes: null,
    voiceSecondsIncluded: null,
    alertSmsSegmentsIncluded: null,
    outboundCallAttemptsIncluded: null,
    includedBusinessNumbers: null,
    overagesBillable: false,
    voiceOverageRatePerMinuteCents: null,
    alertSmsOverageRatePerSegmentCents: null,
    outboundCallAttemptOverageRateCents: null,
  },
  free_cloud: {
    hostedBilling: true,
    monthlyChargeCents: 0,
    annualChargeCents: null,
    annualEffectiveMonthlyChargeCents: null,
    knowledgeStorageBytes: 100 * 1024 * 1024,
    voiceSecondsIncluded: 1_800,
    alertSmsSegmentsIncluded: 10,
    outboundCallAttemptsIncluded: 2,
    includedBusinessNumbers: 0,
    overagesBillable: false,
    voiceOverageRatePerMinuteCents: null,
    alertSmsOverageRatePerSegmentCents: null,
    outboundCallAttemptOverageRateCents: null,
  },
  starter: {
    hostedBilling: true,
    monthlyChargeCents: 3_000,
    annualChargeCents: 28_800,
    annualEffectiveMonthlyChargeCents: 2_400,
    knowledgeStorageBytes: 2 * 1024 * 1024 * 1024,
    voiceSecondsIncluded: 9_000,
    alertSmsSegmentsIncluded: 50,
    outboundCallAttemptsIncluded: 20,
    includedBusinessNumbers: 1,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 20,
    alertSmsOverageRatePerSegmentCents: 2,
    outboundCallAttemptOverageRateCents: 2,
  },
  pro: {
    hostedBilling: true,
    monthlyChargeCents: 10_000,
    annualChargeCents: 96_000,
    annualEffectiveMonthlyChargeCents: 8_000,
    knowledgeStorageBytes: 10 * 1024 * 1024 * 1024,
    voiceSecondsIncluded: 30_000,
    alertSmsSegmentsIncluded: 200,
    outboundCallAttemptsIncluded: 100,
    includedBusinessNumbers: 1,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 18,
    alertSmsOverageRatePerSegmentCents: 2,
    outboundCallAttemptOverageRateCents: 2,
  },
  enterprise: {
    hostedBilling: true,
    monthlyChargeCents: null,
    annualChargeCents: null,
    annualEffectiveMonthlyChargeCents: null,
    knowledgeStorageBytes: null,
    voiceSecondsIncluded: null,
    alertSmsSegmentsIncluded: null,
    outboundCallAttemptsIncluded: null,
    includedBusinessNumbers: null,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: null,
    alertSmsOverageRatePerSegmentCents: null,
    outboundCallAttemptOverageRateCents: null,
  },
} as const satisfies Record<
  BillingPlanSlug,
  {
    hostedBilling: boolean;
    monthlyChargeCents: number | null;
    annualChargeCents: number | null;
    annualEffectiveMonthlyChargeCents: number | null;
    knowledgeStorageBytes: number | null;
    voiceSecondsIncluded: number | null;
    alertSmsSegmentsIncluded: number | null;
    outboundCallAttemptsIncluded: number | null;
    includedBusinessNumbers: number | null;
    overagesBillable: boolean;
    voiceOverageRatePerMinuteCents: number | null;
    alertSmsOverageRatePerSegmentCents: number | null;
    outboundCallAttemptOverageRateCents: number | null;
  }
>;

export function getKnowledgeStorageLimitBytes(
  plan: BillingPlanSlug,
): number | null {
  return billingPlanCatalog[plan].knowledgeStorageBytes;
}

export const billingAddonCatalog = {
  ai_sms: {
    recurringMonthlyChargeCents: 500,
    oneTimeSetupChargeCents: 1_900,
    usageRatePerSegmentCents: 3,
  },
} as const satisfies Record<
  BillingAddonSlug,
  {
    recurringMonthlyChargeCents: number;
    oneTimeSetupChargeCents: number;
    usageRatePerSegmentCents: number;
  }
>;

export function getBillingMonthlyChargeCents(input: {
  plan: BillingPlanSlug;
  billingInterval?: BillingInterval | null;
  activeAddons?: Array<BillingAddonSlug>;
}): number | null {
  const planConfig = billingPlanCatalog[input.plan];
  const baseMonthlyChargeCents =
    input.billingInterval === "annual"
      ? planConfig.annualEffectiveMonthlyChargeCents
      : planConfig.monthlyChargeCents;
  if (baseMonthlyChargeCents === null) {
    return null;
  }

  const recurringAddonChargeCents = (input.activeAddons ?? []).reduce<number>(
    (total, addon) => total + billingAddonCatalog[addon].recurringMonthlyChargeCents,
    0,
  );

  return baseMonthlyChargeCents + recurringAddonChargeCents;
}

export function getBillingPeriodChargeCents(input: {
  plan: BillingPlanSlug;
  billingInterval?: BillingInterval | null;
}): number | null {
  const planConfig = billingPlanCatalog[input.plan];
  if (input.billingInterval === "annual") {
    return planConfig.annualChargeCents;
  }
  return planConfig.monthlyChargeCents;
}

export function isHostedBillingPlan(
  plan: BillingPlanSlug,
): plan is CloudBillingPlanSlug {
  return plan !== "self_host";
}

export type PolarMeteredUsagePayload = {
  eventName:
    (typeof billingMeterEventNames)[keyof typeof billingMeterEventNames];
  quantity: number;
};

export function getPolarMeteredUsagePayload(
  usageKind: BillingUsageKind,
  quantity: number,
): PolarMeteredUsagePayload {
  switch (usageKind) {
    case "voice_seconds":
      return {
        eventName: billingMeterEventNames.voiceMinutes,
        quantity: quantity / 60,
      };
    case "alert_sms_segments":
      return {
        eventName: billingMeterEventNames.alertSmsSegments,
        quantity,
      };
    case "outbound_call_attempts":
      return {
        eventName: billingMeterEventNames.outboundCallAttempts,
        quantity,
      };
    case "ai_sms_segments":
      return {
        eventName: billingMeterEventNames.aiSmsSegments,
        quantity,
      };
  }
}

export type BillingUsageSnapshot = {
  periodKey: string;
  resetAt: string;
  knowledgeStorageBytesUsed: number;
  knowledgeStorageBytesIncluded: number | null;
  voiceSecondsUsed: number;
  alertSmsSegmentsUsed: number;
  outboundCallAttemptsUsed: number;
  aiSmsSegmentsUsed: number;
  voiceSecondsIncluded: number | null;
  alertSmsSegmentsIncluded: number | null;
  outboundCallAttemptsIncluded: number | null;
  voiceSecondsRemaining: number | null;
  alertSmsSegmentsRemaining: number | null;
  outboundCallAttemptsRemaining: number | null;
  voiceBlocked: boolean;
  alertSmsBlocked: boolean;
  outboundCallAttemptsBlocked: boolean;
  knowledgeStorageBlocked: boolean;
};

export type BillingTransactionSummary = {
  kind: BillingTransactionKind;
  sourceId: string;
  status: string;
  amountCents: number;
  currency: string;
  description: string | null;
  occurredAt: string;
  invoiceUrl: string | null;
};

export type BillingStatus = {
  plan: BillingPlanSlug;
  billingKey: string;
  subscriptionState: string;
  billingInterval: BillingInterval | null;
  activeAddons: Array<BillingAddonSlug>;
  aiSmsEnabled: boolean;
  aiSmsReady: boolean;
  overagesBillable: boolean;
  monthlyChargeCents: number | null;
  billingPeriodChargeCents: number | null;
  billingContactEmail: string | null;
  billingContactName: string | null;
  includedBusinessNumbers: number | null;
  phoneNumberReclaimScheduledAt: number | null;
  hasBillingManagementAccess: boolean;
  hasCustomerPortalAccess: boolean;
  hasCheckoutAccess: boolean;
  availableCheckoutPlans: Array<HostedCheckoutPlanSlug>;
  availableCheckoutIntervals: HostedCheckoutPlanIntervals;
  canPurchaseAiSmsAddon: boolean;
  usage: BillingUsageSnapshot;
  recentTransactions: Array<BillingTransactionSummary>;
};
