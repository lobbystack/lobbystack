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
  "chat_ai_tokens",
] as const;
export type BillingUsageKind = (typeof billingUsageKinds)[number];

/**
 * States in which a subscription is paying. `past_due` counts, so a failed charge
 * does not strip the number or the voice allowance while the provider retries.
 */
export const liveSubscriptionStates = ["active", "trialing", "past_due"] as const;

/** A billable plan on a live subscription: the gate for numbers and paid prompts. */
export function isPaidSubscription(plan: string | null | undefined, state: string | null | undefined): boolean {
  return ["starter", "pro", "enterprise"].includes(plan ?? "") && (liveSubscriptionStates as readonly string[]).includes(state ?? "");
}

export const billingTransactionKinds = ["order", "refund"] as const;
export type BillingTransactionKind = (typeof billingTransactionKinds)[number];

export const billingErrorCodes = {
  voiceLimitReached: "voice_limit_reached",
  alertSmsLimitReached: "alert_sms_limit_reached",
  outboundCallAttemptLimitReached: "outbound_call_attempt_limit_reached",
  aiSmsNotEnabled: "ai_sms_not_enabled",
  dedicatedNumberRequiresPaidPlan: "dedicated_number_requires_paid_plan",
  chatAiLimitReached: "chat_ai_limit_reached",
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
  chatAiTokens: "billing.chat_ai_tokens",
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
    chatAiTokensIncluded: null,
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
    knowledgeStorageBytes: 25 * 1024 * 1024,
    voiceSecondsIncluded: 1_800,
    alertSmsSegmentsIncluded: 10,
    outboundCallAttemptsIncluded: 2,
    chatAiTokensIncluded: 5,
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
    knowledgeStorageBytes: 100 * 1024 * 1024,
    voiceSecondsIncluded: 9_000,
    alertSmsSegmentsIncluded: 50,
    outboundCallAttemptsIncluded: 20,
    chatAiTokensIncluded: 50,
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
    knowledgeStorageBytes: 500 * 1024 * 1024,
    voiceSecondsIncluded: 30_000,
    alertSmsSegmentsIncluded: 200,
    outboundCallAttemptsIncluded: 100,
    chatAiTokensIncluded: 200,
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
    chatAiTokensIncluded: null,
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
    chatAiTokensIncluded: number | null;
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

export const contentRetentionCategories = [
  "messages",
  "transcripts",
  "recordings",
  "follow_ups",
] as const;
export type ContentRetentionCategory = (typeof contentRetentionCategories)[number];

export type ContentRetentionOverrides = Partial<
  Record<ContentRetentionCategory, number | undefined>
>;

/** Free content is a hard maximum: an override can never extend it past 30 days. */
export const FREE_CONTENT_RETENTION_MAX_DAYS = 30;

export const contentRetentionDaysByPlan = {
  self_host: { messages: 365, transcripts: 90, recordings: 90, follow_ups: 365 },
  free_cloud: { messages: 30, transcripts: 30, recordings: 30, follow_ups: 30 },
  starter: { messages: 365, transcripts: 90, recordings: 90, follow_ups: 365 },
  pro: { messages: 365, transcripts: 90, recordings: 90, follow_ups: 365 },
  enterprise: { messages: 365, transcripts: 90, recordings: 90, follow_ups: 365 },
} as const satisfies Record<
  BillingPlanSlug,
  Record<ContentRetentionCategory, number>
>;

export function contentRetentionDaysForPlan(
  plan: BillingPlanSlug,
  category: ContentRetentionCategory,
  overrides?: ContentRetentionOverrides | null,
): number {
  const base = contentRetentionDaysByPlan[plan][category];
  if (plan === "free_cloud") {
    return Math.min(base, FREE_CONTENT_RETENTION_MAX_DAYS);
  }
  return overrides?.[category] ?? base;
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
    case "chat_ai_tokens":
      return {
        eventName: billingMeterEventNames.chatAiTokens,
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
  chatAiTokensUsed: number;
  voiceSecondsIncluded: number | null;
  alertSmsSegmentsIncluded: number | null;
  outboundCallAttemptsIncluded: number | null;
  chatAiTokensIncluded: number | null;
  voiceSecondsRemaining: number | null;
  alertSmsSegmentsRemaining: number | null;
  outboundCallAttemptsRemaining: number | null;
  voiceBlocked: boolean;
  alertSmsBlocked: boolean;
  outboundCallAttemptsBlocked: boolean;
  chatAiBlocked: boolean;
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
  overageSpendingCapCents: number | null;
  overageSpendCents: number;
  overageSpendCentsComplete: boolean;
  overageSpendingCapReached: boolean;
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

// Voice usage exemptions. Restored from the pre-PostgreSQL billing rules, which the
// plan comparison and the public pricing pages still advertise.
export const MIN_BILLABLE_VOICE_DURATION_SECONDS = 10;

export const nonBillableCallDispositions = ["spam_ended"] as const;
export type NonBillableCallDisposition = (typeof nonBillableCallDispositions)[number];

export function isNonBillableCallDisposition(disposition: string | null | undefined): boolean {
  return typeof disposition === "string" && (nonBillableCallDispositions as readonly string[]).includes(disposition);
}

/**
 * Voice seconds a call adds to usage: wrong numbers, instant hang-ups, and spam cost the caller nothing.
 *
 * Providers report whole seconds and round up, so a 9.2 second call arrives as 10. `measuredSeconds`
 * carries the unrounded elapsed time from the call record and decides the exemption when it is shorter.
 */
export function billableVoiceSeconds(durationSeconds: number, disposition?: string | null, measuredSeconds?: number): number {
  const normalizedDurationSeconds = Math.max(0, durationSeconds);
  if (isNonBillableCallDisposition(disposition)) return 0;
  const shortestObservedSeconds = measuredSeconds === undefined ? normalizedDurationSeconds : Math.min(normalizedDurationSeconds, Math.max(0, measuredSeconds));
  return shortestObservedSeconds < MIN_BILLABLE_VOICE_DURATION_SECONDS ? 0 : normalizedDurationSeconds;
}
