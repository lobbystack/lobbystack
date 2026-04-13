export const billingPlanSlugs = [
  "self_host",
  "free_cloud",
  "pro",
  "enterprise",
] as const;
export type BillingPlanSlug = (typeof billingPlanSlugs)[number];

export const cloudBillingPlanSlugs = ["free_cloud", "pro", "enterprise"] as const;
export type CloudBillingPlanSlug = (typeof cloudBillingPlanSlugs)[number];

export const hostedCheckoutPlanSlugs = ["pro"] as const;
export type HostedCheckoutPlanSlug = (typeof hostedCheckoutPlanSlugs)[number];

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
} as const;

export type BillingErrorCode =
  (typeof billingErrorCodes)[keyof typeof billingErrorCodes];

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
    voiceSecondsIncluded: 600,
    alertSmsSegmentsIncluded: 10,
    outboundCallAttemptsIncluded: 2,
    includedBusinessNumbers: 0,
    overagesBillable: false,
    voiceOverageRatePerMinuteCents: null,
    alertSmsOverageRatePerSegmentCents: null,
    outboundCallAttemptOverageRateCents: null,
  },
  pro: {
    hostedBilling: true,
    monthlyChargeCents: 1_500,
    voiceSecondsIncluded: 4_800,
    alertSmsSegmentsIncluded: 50,
    outboundCallAttemptsIncluded: 20,
    includedBusinessNumbers: 1,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 18,
    alertSmsOverageRatePerSegmentCents: 2,
    outboundCallAttemptOverageRateCents: 2,
  },
  enterprise: {
    hostedBilling: true,
    monthlyChargeCents: null,
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
  activeAddons: Array<BillingAddonSlug>;
  aiSmsEnabled: boolean;
  overagesBillable: boolean;
  monthlyChargeCents: number | null;
  billingContactEmail: string | null;
  billingContactName: string | null;
  includedBusinessNumbers: number | null;
  hasCustomerPortalAccess: boolean;
  hasCheckoutAccess: boolean;
  availableCheckoutPlans: Array<HostedCheckoutPlanSlug>;
  canPurchaseAiSmsAddon: boolean;
  usage: BillingUsageSnapshot;
  recentTransactions: Array<BillingTransactionSummary>;
};
