import {
  billingPlanCatalog,
  cloudBillingPlanSlugs,
  type CloudBillingPlanSlug,
} from "./billing";

/**
 * Factual status for a product capability. These describe what the product does
 * today, not a marketing promise. `restricted` means the product does not offer
 * the capability for new activation while existing configuration keeps working.
 */
export const capabilityStatuses = ["available", "restricted"] as const;
export type CapabilityStatus = (typeof capabilityStatuses)[number];

export const productCapabilityIds = [
  "browser_voice_testing",
  "telephone_voice",
  "website_chat",
  "alert_sms",
  "ai_sms",
] as const;
export type ProductCapabilityId = (typeof productCapabilityIds)[number];

export type ProductCapability = {
  id: ProductCapabilityId;
  status: CapabilityStatus;
};

/**
 * Website chat stays restricted: it is not a public offer and the product does
 * not issue new widget keys by default. Existing keys and their configuration
 * are untouched. Telephone voice, browser voice testing, and alert SMS are
 * supported today.
 */
export const productCapabilities = {
  browser_voice_testing: { id: "browser_voice_testing", status: "available" },
  telephone_voice: { id: "telephone_voice", status: "available" },
  website_chat: { id: "website_chat", status: "restricted" },
  alert_sms: { id: "alert_sms", status: "available" },
  ai_sms: { id: "ai_sms", status: "available" },
} as const satisfies Record<ProductCapabilityId, ProductCapability>;

export function isProductCapabilityRestricted(
  id: ProductCapabilityId,
): boolean {
  return productCapabilities[id].status === "restricted";
}

/**
 * Factual, typed allowances for one hosted plan. Values are read from the
 * billing plan catalog so plan copy and the plan comparison cannot drift from
 * the allowances billing enforces. This module never changes those allowances.
 */
export type CloudPlanFactSheet = {
  slug: CloudBillingPlanSlug;
  voiceMinutesIncluded: number | null;
  alertSmsSegmentsIncluded: number | null;
  alertSmsOverageRatePerSegmentCents: number | null;
  outboundCallAttemptsIncluded: number | null;
  knowledgeStorageBytes: number | null;
  dedicatedBusinessNumbers: number | null;
  /** True when the plan includes voice testing without a telephone number. */
  browserVoiceOnly: boolean;
};

function secondsToMinutes(seconds: number | null): number | null {
  return seconds === null ? null : Math.round(seconds / 60);
}

export function getCloudPlanFactSheet(
  slug: CloudBillingPlanSlug,
): CloudPlanFactSheet {
  const plan = billingPlanCatalog[slug];
  return {
    slug,
    voiceMinutesIncluded: secondsToMinutes(plan.voiceSecondsIncluded),
    alertSmsSegmentsIncluded: plan.alertSmsSegmentsIncluded,
    alertSmsOverageRatePerSegmentCents: plan.alertSmsOverageRatePerSegmentCents,
    outboundCallAttemptsIncluded: plan.outboundCallAttemptsIncluded,
    knowledgeStorageBytes: plan.knowledgeStorageBytes,
    dedicatedBusinessNumbers: plan.includedBusinessNumbers,
    browserVoiceOnly:
      plan.voiceSecondsIncluded !== null &&
      (plan.includedBusinessNumbers ?? 0) === 0,
  };
}

export const cloudPlanFactSheets = Object.fromEntries(
  cloudBillingPlanSlugs.map((slug) => [slug, getCloudPlanFactSheet(slug)]),
) as Record<CloudBillingPlanSlug, CloudPlanFactSheet>;

/**
 * Whether the operator may create new widget keys. Website chat is restricted,
 * so issuance is off by default. An operator opts in deliberately with
 * `WIDGET_KEY_ISSUANCE_ENABLED=true`. The gate only runs on creation: existing
 * keys, their configuration, and the runtime widget paths are unaffected.
 */
export function isWidgetKeyIssuanceEnabled(
  source: Record<string, string | undefined> = {},
): boolean {
  if (!isProductCapabilityRestricted("website_chat")) return true;
  return source.WIDGET_KEY_ISSUANCE_ENABLED === "true";
}
