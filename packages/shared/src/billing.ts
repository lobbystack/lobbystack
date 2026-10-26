export const billingPlanSlugs = [
  "self_host",
  "free_cloud",
  "starter",
  "pro",
  "enterprise",
] as const;
export type BillingPlanSlug = (typeof billingPlanSlugs)[number];

export function isBillingPlanSlug(value: string | null | undefined): value is BillingPlanSlug {
  return (billingPlanSlugs as readonly (string | null | undefined)[]).includes(value);
}

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

/**
 * What a business may use right now. loadEntitlement in packages/domain gives a
 * business's, and every check that once asked for a paid plan reads it. Amounts
 * are in the minor unit of `overage.currency`.
 */
export type Entitlement = {
  /**
   * For a direct business: its billing account holds a paid plan (Starter, Pro
   * or Enterprise) on a live subscription, past_due included, whatever the
   * deployment mode. That's the answer the paid-plan check gave, and the
   * checks for dedicated numbers and paid features read it. Callers that treat
   * a self-hosted server differently also check `source`. A partner's business
   * billed outside LobbyStack is always live, and one on a package while its
   * Stripe subscription is.
   */
  live: boolean;
  /** Where the terms come from. Direct businesses get "plan", or "unlimited" on a self-hosted server. A partner's business gets "package", or "billed_outside" when it has none. */
  source: "plan" | "package" | "billed_outside" | "unlimited";
  /** Included each month. Null means no limit. */
  allowance: { voiceSeconds: number | null; chats: number | null; alertSms: number | null; outboundAttempts: number | null };
  /** Usage past the allowance, billed per unit at these rates until the spend reaches the cap. */
  overage: { enabled: boolean; currency: string; rates: { voiceMinute: number; chat: number; alertSms: number; outboundAttempt: number }; capMinor: number | null };
  /** The partner whose pool the usage also draws on. Direct businesses have none. */
  poolPartnerId: string | null;
  /** Dedicated numbers the business may hold. Null means no limit. */
  includedNumbers: number | null;
};

/** The billing account fields that decide whether an entitlement is live. */
export type EntitlementAccount = { plan: string | null; subscriptionState: string | null };

/**
 * Whether a billing account holds a live entitlement: a plan the catalog marks
 * paid, on a live subscription. Ignores the deployment mode, as the paid-plan
 * check it replaces did. app.has_live_entitlement applies the same rule in the
 * number-claim SQL. A partner's business billed outside LobbyStack is live
 * whatever its account holds; loadEntitlement and app.has_live_entitlement
 * both say so, since they know the business.
 */
export function hasLiveEntitlement(account: EntitlementAccount | null | undefined): boolean {
  if (!account || !isBillingPlanSlug(account.plan) || !billingPlanCatalog[account.plan].paid) return false;
  return (liveSubscriptionStates as readonly string[]).includes(account.subscriptionState ?? "");
}

/**
 * A direct plan's entitlement, from the plan catalog. `live` and the cap come
 * from the business's billing account; amounts are US cents.
 */
export function planEntitlement(plan: BillingPlanSlug, account: { live: boolean; capMinor: number | null } = { live: false, capMinor: null }): Entitlement {
  const terms = billingPlanCatalog[plan];
  return {
    live: account.live,
    // A plan the host doesn't bill, which only a self-hosted server has, has no limit.
    source: terms.hostedBilling ? "plan" : "unlimited",
    allowance: {
      voiceSeconds: terms.voiceSecondsIncluded,
      chats: terms.chatAiTokensIncluded,
      alertSms: terms.alertSmsSegmentsIncluded,
      outboundAttempts: terms.outboundCallAttemptsIncluded,
    },
    overage: {
      enabled: terms.overagesBillable,
      currency: "USD",
      rates: {
        voiceMinute: terms.voiceOverageRatePerMinuteCents ?? 0,
        // Polar never bills website chats, so a plan's chats add no spend and never use the cap.
        chat: 0,
        alertSms: terms.alertSmsOverageRatePerSegmentCents ?? 0,
        outboundAttempt: terms.outboundCallAttemptOverageRateCents ?? 0,
      },
      capMinor: account.capMinor,
    },
    poolPartnerId: null,
    includedNumbers: terms.includedBusinessNumbers,
  };
}

/** Whether a package's Stripe subscription is paying, past_due included, as a plan's is. */
export function hasLivePackageSubscription(state: string | null | undefined): boolean {
  return (liveSubscriptionStates as readonly string[]).includes(state ?? "");
}

/** The package terms a business's entitlement comes from. */
export type PackageEntitlementTerms = { currency: string; voiceMinutes: number; chats: number };

/**
 * A partner's business's overage on its package, as the partner set it:
 * whether the business keeps answering past the package's allowance, what
 * each minute and chat past it costs, and the monthly cap on what that comes
 * to, or null for none. Amounts are whole numbers of the minor unit of
 * `currency`, the package's currency when the partner set them.
 */
export type PackageOverageTerms = { enabled: boolean; currency: string | null; voiceMinuteRateMinor: number; chatRateMinor: number; capMinor: number | null };

/** A business's overage in its package's currency, as the console shows it. */
export type PackageOverage = { enabled: boolean; currency: string; voiceMinuteRateMinor: number; chatRateMinor: number; capMinor: number | null };

/**
 * The overage that holds for a business on a package in this currency: the
 * terms the partner set when they're in it, and off otherwise, as for a
 * business that moved to a package in another currency.
 */
export function packageOverageIn(currency: string, terms: PackageOverageTerms | null | undefined): PackageOverage {
  const code = currency.toUpperCase();
  if (!terms?.currency || terms.currency.toUpperCase() !== code) return { enabled: false, currency: code, voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null };
  return { enabled: terms.enabled, currency: code, voiceMinuteRateMinor: terms.voiceMinuteRateMinor, chatRateMinor: terms.chatRateMinor, capMinor: terms.capMinor };
}

/**
 * The entitlement of a partner's business on a package: the package's
 * allowance of minutes and chats while its Stripe subscription is live, and
 * nothing once it isn't, so calls forward and chat shows its message. Alert
 * texts and transfer attempts, which a package doesn't sell, have no limit of
 * their own. While it's live and the partner turned its overage on, it keeps
 * answering past the allowance at the partner's minute and chat rates, until
 * what that costs reaches the monthly cap. Amounts are in the package's
 * currency. Its usage also draws on the partner's pool.
 */
export function packageEntitlement(partnerId: string, terms: PackageEntitlementTerms, account: { live: boolean; overage?: PackageOverageTerms | null | undefined }): Entitlement {
  const overage = packageOverageIn(terms.currency, account.overage);
  const billed = account.live && overage.enabled;
  return {
    live: account.live,
    source: "package",
    allowance: account.live
      ? { voiceSeconds: terms.voiceMinutes * 60, chats: terms.chats, alertSms: null, outboundAttempts: null }
      : { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 },
    overage: {
      enabled: billed,
      currency: overage.currency,
      rates: { voiceMinute: billed ? overage.voiceMinuteRateMinor : 0, chat: billed ? overage.chatRateMinor : 0, alertSms: 0, outboundAttempt: 0 },
      capMinor: billed ? overage.capMinor : null,
    },
    poolPartnerId: partnerId,
    includedNumbers: null,
  };
}

/**
 * The entitlement of a partner's business billed outside LobbyStack: the
 * partner bills it however it likes, so the host sets it no allowance, no
 * overage and no number limit, and it's live. Its usage still draws on the
 * partner's pool, which nothing limits until tiers do. It isn't live while
 * its partner's businesses are paused, and then gets nothing, so calls
 * forward and chat shows its message.
 */
export function billedOutsideEntitlement(partnerId: string, account: { live: boolean } = { live: true }): Entitlement {
  return {
    live: account.live,
    source: "billed_outside",
    allowance: account.live
      ? { voiceSeconds: null, chats: null, alertSms: null, outboundAttempts: null }
      : { voiceSeconds: 0, chats: 0, alertSms: 0, outboundAttempts: 0 },
    overage: { enabled: false, currency: "USD", rates: { voiceMinute: 0, chat: 0, alertSms: 0, outboundAttempt: 0 }, capMinor: null },
    poolPartnerId: partnerId,
    includedNumbers: null,
  };
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
  checkoutInProgress: "checkout_in_progress",
  subscriptionActive: "subscription_active",
} as const;

export type BillingErrorCode =
  (typeof billingErrorCodes)[keyof typeof billingErrorCodes];

export const billingMeterEventNames = {
  voiceMinutes: "billing.voice_minutes",
  alertSmsSegments: "billing.alert_sms_segments",
  outboundCallAttempts: "billing.outbound_call_attempts",
  aiSmsSegments: "billing.ai_sms_segments",
  chatAiTokens: "billing.chat_ai_tokens",
  /** A month of a number a partner holds past its tier's included ones. The quantity is what the host pays for it, in US cents. */
  partnerExtraNumbers: "billing.partner_extra_numbers",
  /** Voice minutes a partner's businesses used past its pool, priced at its tier's minute rate. The quantity is that price, in US cents. */
  partnerPoolVoiceOverage: "billing.partner_pool_voice_overage",
  /** Website chats a partner's businesses used past its pool, priced at its tier's chat rate. The quantity is that price, in US cents. */
  partnerPoolChatOverage: "billing.partner_pool_chat_overage",
} as const;

export const billingPlanCatalog = {
  self_host: {
    hostedBilling: false,
    paid: false,
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
    paid: false,
    monthlyChargeCents: 0,
    annualChargeCents: null,
    annualEffectiveMonthlyChargeCents: null,
    knowledgeStorageBytes: 1 * 1024 * 1024,
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
    paid: true,
    monthlyChargeCents: 3_000,
    annualChargeCents: 28_800,
    annualEffectiveMonthlyChargeCents: 2_400,
    knowledgeStorageBytes: 5 * 1024 * 1024,
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
    paid: true,
    monthlyChargeCents: 10_000,
    annualChargeCents: 96_000,
    annualEffectiveMonthlyChargeCents: 8_000,
    knowledgeStorageBytes: 20 * 1024 * 1024,
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
    paid: true,
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
    /** A business pays for the plan, so it holds a live entitlement only while its subscription is live. */
    paid: boolean;
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

/**
 * The tiers a partner buys from the host: what it pays the host each month
 * and the pool all its businesses share. Free needs no card. A partner on no
 * live paid tier is on Free.
 */
export const partnerTierSlugs = ["free", "starter", "growth", "scale"] as const;
export type PartnerTierSlug = (typeof partnerTierSlugs)[number];

/** The tiers Polar sells, one product per billing interval each. */
export const paidPartnerTierSlugs = ["starter", "growth", "scale"] as const;
export type PaidPartnerTierSlug = (typeof paidPartnerTierSlugs)[number];

export function isPartnerTierSlug(value: unknown): value is PartnerTierSlug {
  return typeof value === "string" && (partnerTierSlugs as readonly string[]).includes(value);
}

export function isPaidPartnerTierSlug(value: unknown): value is PaidPartnerTierSlug {
  return typeof value === "string" && (paidPartnerTierSlugs as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string" && (billingIntervals as readonly string[]).includes(value);
}

/**
 * LobbyStack's cloud tiers, from docs/white-label.md. Annual billing takes 20%
 * off, rounded down to whole dollars a month, so it saves a little more. Prices and rates are US cents; a chat rate can hold
 * half a cent, as Polar's metered prices can. Free includes no number of its
 * own, only one 14-day trial number per partner, ever.
 */
export const partnerTierCatalog = {
  free: {
    paid: false,
    monthlyChargeCents: 0,
    annualChargeCents: null,
    annualEffectiveMonthlyChargeCents: null,
    poolVoiceSeconds: 1_800,
    poolChats: 50,
    includedNumbers: 0,
    trialNumbers: 1,
    overagesBillable: false,
    voiceOverageRatePerMinuteCents: null,
    chatOverageRatePerChatCents: null,
  },
  starter: {
    paid: true,
    monthlyChargeCents: 4_900,
    annualChargeCents: 46_800,
    annualEffectiveMonthlyChargeCents: 3_900,
    poolVoiceSeconds: 15_000,
    poolChats: 1_000,
    includedNumbers: 2,
    trialNumbers: 0,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 20,
    chatOverageRatePerChatCents: 2,
  },
  growth: {
    paid: true,
    monthlyChargeCents: 19_900,
    annualChargeCents: 190_800,
    annualEffectiveMonthlyChargeCents: 15_900,
    poolVoiceSeconds: 78_000,
    poolChats: 5_000,
    includedNumbers: 10,
    trialNumbers: 0,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 15,
    chatOverageRatePerChatCents: 1.5,
  },
  scale: {
    paid: true,
    monthlyChargeCents: 49_900,
    annualChargeCents: 478_800,
    annualEffectiveMonthlyChargeCents: 39_900,
    poolVoiceSeconds: 240_000,
    poolChats: 10_000,
    includedNumbers: 25,
    trialNumbers: 0,
    overagesBillable: true,
    voiceOverageRatePerMinuteCents: 12,
    chatOverageRatePerChatCents: 1,
  },
} as const satisfies Record<
  PartnerTierSlug,
  {
    /** The partner pays for the tier, so it holds it only while its Polar subscription is live. */
    paid: boolean;
    monthlyChargeCents: number;
    annualChargeCents: number | null;
    annualEffectiveMonthlyChargeCents: number | null;
    /** The pool's voice minutes each month, in seconds, shared by all the partner's businesses. */
    poolVoiceSeconds: number;
    /** The pool's website chat conversations each month. */
    poolChats: number;
    /** Phone numbers the partner's businesses hold between them before extra numbers cost more. */
    includedNumbers: number;
    /** 14-day trial numbers the partner gets, ever. */
    trialNumbers: number;
    overagesBillable: boolean;
    voiceOverageRatePerMinuteCents: number | null;
    chatOverageRatePerChatCents: number | null;
  }
>;

/** The Polar billing account fields that decide a partner's tier. */
export type PartnerTierAccount = { tier: string | null; subscriptionState: string | null };

/**
 * The tier a partner holds now: a paid tier while its subscription is live,
 * past_due included as on direct plans, and Free otherwise.
 */
export function partnerTierInForce(account: PartnerTierAccount | null | undefined): PartnerTierSlug {
  if (!account || !isPaidPartnerTierSlug(account.tier)) return "free";
  return (liveSubscriptionStates as readonly string[]).includes(account.subscriptionState ?? "") ? account.tier : "free";
}

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
