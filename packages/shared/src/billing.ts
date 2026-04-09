export const billingTiers = ["free", "paid_monthly"] as const;
export type BillingTier = (typeof billingTiers)[number];

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
  voiceSeconds: "billing.voice_seconds",
  smsSegments: "billing.sms_segments",
} as const;

export const billingDefaults = {
  freeVoiceSeconds: 1_800,
  freeSmsSegments: 60,
  paidMonthlyMinimumChargeCents: 500,
} as const;

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
  usage: BillingUsageSnapshot;
  recentTransactions: Array<BillingTransactionSummary>;
};
