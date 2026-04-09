export const billingTiers = ["free", "starter", "growth"] as const;
export type BillingTier = (typeof billingTiers)[number];
export const billingPaidTiers = ["starter", "growth"] as const;
export type BillingPaidTier = (typeof billingPaidTiers)[number];

export const billingUsageKinds = ["voice_seconds", "sms_segments"] as const;
export type BillingUsageKind = (typeof billingUsageKinds)[number];

export const billingTransactionKinds = ["order", "refund"] as const;
export type BillingTransactionKind = (typeof billingTransactionKinds)[number];

export const billingErrorCodes = {
  voiceQuotaExhausted: "voice_quota_exhausted",
  smsQuotaExhausted: "sms_quota_exhausted",
} as const;

export type BillingErrorCode =
  (typeof billingErrorCodes)[keyof typeof billingErrorCodes];

export const billingMeterEventNames = {
  usageCents: "billing.usage_cents",
} as const;

export const billingDefaults = {
  freeVoiceSeconds: 1_800,
  freeSmsSegments: 60,
} as const;

export const billingPlanCatalog = {
  free: {
    includedLocalNumbers: 0,
    minimumMonthlyChargeCents: null,
    smsRatePerMessageCents: null,
    voiceRatePerMinuteCents: null,
  },
  starter: {
    includedLocalNumbers: 1,
    minimumMonthlyChargeCents: 500,
    smsRatePerMessageCents: 3,
    voiceRatePerMinuteCents: 22,
  },
  growth: {
    includedLocalNumbers: 1,
    minimumMonthlyChargeCents: 2_000,
    smsRatePerMessageCents: 2.5,
    voiceRatePerMinuteCents: 18,
  },
} as const satisfies Record<
  BillingTier,
  {
    includedLocalNumbers: number;
    minimumMonthlyChargeCents: number | null;
    smsRatePerMessageCents: number | null;
    voiceRatePerMinuteCents: number | null;
  }
>;

export function isPaidBillingTier(tier: BillingTier): tier is BillingPaidTier {
  return tier === "starter" || tier === "growth";
}

export function getPolarBillableUsageCents(
  tier: BillingPaidTier,
  usageKind: BillingUsageKind,
  quantity: number,
): number {
  const plan = billingPlanCatalog[tier];

  if (usageKind === "voice_seconds") {
    return (quantity * plan.voiceRatePerMinuteCents) / 60;
  }

  return quantity * plan.smsRatePerMessageCents;
}

export type BillingUsageSnapshot = {
  periodKey: string;
  resetAt: string;
  voiceSecondsUsed: number;
  smsSegmentsUsed: number;
  voiceSecondsIncluded: number | null;
  smsSegmentsIncluded: number | null;
  voiceSecondsRemaining: number | null;
  smsSegmentsRemaining: number | null;
  voiceBlocked: boolean;
  smsBlocked: boolean;
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
  tier: BillingTier;
  billingKey: string;
  subscriptionState: string;
  minimumMonthlyChargeCents: number | null;
  billingContactEmail: string | null;
  billingContactName: string | null;
  hasCustomerPortalAccess: boolean;
  hasCheckoutAccess: boolean;
  availableCheckoutPlans: Array<BillingPaidTier>;
  usage: BillingUsageSnapshot;
  recentTransactions: Array<BillingTransactionSummary>;
};
