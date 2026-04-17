import { v } from "convex/values";

export const smsComplianceStatuses = [
  "not_started",
  "collecting_info",
  "submitting",
  "pending_brand_verification",
  "pending_review",
  "approved",
  "failed",
  "suspended",
] as const;
export type SmsComplianceStatus = (typeof smsComplianceStatuses)[number];

export const smsComplianceCustomerTypes = ["direct_customer"] as const;
export type SmsComplianceCustomerType = (typeof smsComplianceCustomerTypes)[number];

export const smsComplianceBrandKinds = ["standard_business"] as const;
export type SmsComplianceBrandKind = (typeof smsComplianceBrandKinds)[number];

export const smsComplianceTrafficTiers = ["low_volume", "mixed"] as const;
export type SmsComplianceTrafficTier = (typeof smsComplianceTrafficTiers)[number];

export const smsSenderModes = [
  "platform_phone",
  "business_phone",
  "business_messaging_service",
] as const;
export type SmsSenderMode = (typeof smsSenderModes)[number];

export const smsCompliancePendingActionTypes = [
  "brand_contact_email_otp",
  "missing_information",
  "manual_review",
  "customer_profile_review",
  "campaign_review",
  "phone_number_association",
] as const;
export type SmsCompliancePendingActionType =
  (typeof smsCompliancePendingActionTypes)[number];

export const smsComplianceStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("collecting_info"),
  v.literal("submitting"),
  v.literal("pending_brand_verification"),
  v.literal("pending_review"),
  v.literal("approved"),
  v.literal("failed"),
  v.literal("suspended"),
);

export const smsComplianceCustomerTypeValidator = v.literal("direct_customer");
export const smsComplianceBrandKindValidator = v.literal("standard_business");
export const smsComplianceTrafficTierValidator = v.union(
  v.literal("low_volume"),
  v.literal("mixed"),
);
export const smsSenderModeValidator = v.union(
  v.literal("platform_phone"),
  v.literal("business_phone"),
  v.literal("business_messaging_service"),
);

export const smsCompliancePendingActionValidator = v.object({
  type: v.union(
    v.literal("brand_contact_email_otp"),
    v.literal("missing_information"),
    v.literal("manual_review"),
    v.literal("customer_profile_review"),
    v.literal("campaign_review"),
    v.literal("phone_number_association"),
  ),
  message: v.string(),
  code: v.optional(v.string()),
  submittedAt: v.optional(v.string()),
  expiresAt: v.optional(v.string()),
});

export type SmsCompliancePendingAction = {
  type: SmsCompliancePendingActionType;
  message: string;
  code?: string;
  submittedAt?: string;
  expiresAt?: string;
};

export const smsComplianceAddressDraftValidator = v.object({
  customerName: v.optional(v.string()),
  street: v.optional(v.string()),
  streetSecondary: v.optional(v.string()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  isoCountry: v.optional(v.string()),
});

export type SmsComplianceAddressDraft = {
  customerName?: string;
  street?: string;
  streetSecondary?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  isoCountry?: string;
};

export const smsComplianceAuthorizedRepresentativeDraftValidator = v.object({
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  businessTitle: v.optional(v.string()),
  jobPosition: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
  email: v.optional(v.string()),
});

export type SmsComplianceAuthorizedRepresentativeDraft = {
  firstName?: string;
  lastName?: string;
  businessTitle?: string;
  jobPosition?: string;
  phoneNumber?: string;
  email?: string;
};

export const smsComplianceDraftValidator = v.object({
  businessName: v.optional(v.string()),
  businessType: v.optional(v.string()),
  businessIndustry: v.optional(v.string()),
  businessRegistrationIdentifier: v.optional(v.string()),
  businessRegistrationNumber: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
  socialProfileUrls: v.optional(v.array(v.string())),
  businessRegionsOfOperation: v.optional(v.array(v.string())),
  companyType: v.optional(v.string()),
  stockExchange: v.optional(v.string()),
  stockTicker: v.optional(v.string()),
  brandContactEmail: v.optional(v.string()),
  campaignDescription: v.optional(v.string()),
  messageFlow: v.optional(v.string()),
  sampleMessages: v.optional(v.array(v.string())),
  hasEmbeddedLinks: v.optional(v.boolean()),
  hasEmbeddedPhone: v.optional(v.boolean()),
  optInMessage: v.optional(v.string()),
  optOutMessage: v.optional(v.string()),
  helpMessage: v.optional(v.string()),
  optInKeywords: v.optional(v.array(v.string())),
  optOutKeywords: v.optional(v.array(v.string())),
  helpKeywords: v.optional(v.array(v.string())),
  address: v.optional(smsComplianceAddressDraftValidator),
  authorizedRepresentative: v.optional(
    smsComplianceAuthorizedRepresentativeDraftValidator,
  ),
});

export type SmsComplianceDraft = {
  businessName?: string;
  businessType?: string;
  businessIndustry?: string;
  businessRegistrationIdentifier?: string;
  businessRegistrationNumber?: string;
  websiteUrl?: string;
  socialProfileUrls?: string[];
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
  address?: SmsComplianceAddressDraft;
  authorizedRepresentative?: SmsComplianceAuthorizedRepresentativeDraft;
};

export type CompletedSmsComplianceDraft = {
  businessName: string;
  businessType: string;
  businessIndustry: string;
  businessRegistrationIdentifier: string;
  businessRegistrationNumber: string;
  websiteUrl: string;
  socialProfileUrls: string[];
  businessRegionsOfOperation: string[];
  companyType: string;
  stockExchange?: string;
  stockTicker?: string;
  brandContactEmail?: string;
  campaignDescription: string;
  messageFlow: string;
  sampleMessages: string[];
  hasEmbeddedLinks: boolean;
  hasEmbeddedPhone: boolean;
  optInMessage?: string;
  optOutMessage: string;
  helpMessage: string;
  optInKeywords: string[];
  optOutKeywords: string[];
  helpKeywords: string[];
  address: {
    customerName: string;
    street: string;
    streetSecondary?: string;
    city: string;
    region: string;
    postalCode: string;
    isoCountry: string;
  };
  authorizedRepresentative: {
    firstName: string;
    lastName: string;
    businessTitle: string;
    jobPosition: string;
    phoneNumber: string;
    email: string;
  };
};

export const smsComplianceSubmissionSnapshotValidator = v.object({
  trafficTier: smsComplianceTrafficTierValidator,
  draft: smsComplianceDraftValidator,
});

export type SmsComplianceSubmissionSnapshot = {
  trafficTier: SmsComplianceTrafficTier;
  draft: SmsComplianceDraft;
};

export const smsComplianceCampaignOptions = [
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

const BUSINESS_TYPES = new Set([
  "Co-operative",
  "Corporation",
  "Limited Liability Corporation",
  "Non-profit Corporation",
  "Partnership",
]);

const BUSINESS_INDUSTRIES = new Set([
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
]);

const BUSINESS_REGISTRATION_IDENTIFIERS = new Set([
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
]);

const BUSINESS_REGIONS_OF_OPERATION = new Set([
  "AFRICA",
  "ASIA",
  "EUROPE",
  "LATIN_AMERICA",
  "USA_AND_CANADA",
]);

const COMPANY_TYPES = new Set(["government", "non-profit", "private", "public"]);

const JOB_POSITIONS = new Set([
  "Director",
  "GM",
  "VP",
  "CEO",
  "CFO",
  "General Counsel",
  "Other",
]);

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
}

function requireText(
  value: string | undefined,
  field: string,
): string {
  if (!hasText(value)) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function requireAllowedValue(
  value: string | undefined,
  field: string,
  allowedValues: Set<string>,
): string {
  const normalized = requireText(value, field);
  if (!allowedValues.has(normalized)) {
    throw new Error(`${field} must be one of: ${Array.from(allowedValues).join(", ")}.`);
  }
  return normalized;
}

export function isSmsComplianceApproved(
  status: SmsComplianceStatus | undefined | null,
): status is "approved" {
  return status === "approved";
}

export function getCampaignUsecaseForTrafficTier(
  trafficTier: SmsComplianceTrafficTier,
): "LOW_VOLUME" | "MIXED" {
  return trafficTier === "mixed" ? "MIXED" : "LOW_VOLUME";
}

export function isTerminalSmsComplianceStatus(
  status: SmsComplianceStatus,
): boolean {
  return status === "approved" || status === "failed" || status === "suspended";
}

export function assertSmsComplianceDraftReady(
  draft: SmsComplianceDraft | undefined,
): CompletedSmsComplianceDraft {
  if (!draft) {
    throw new Error("SMS compliance information is required before submission.");
  }

  const businessName = requireText(draft.businessName, "Business legal name");
  const businessType = requireAllowedValue(
    draft.businessType,
    "Business type",
    BUSINESS_TYPES,
  );
  const businessIndustry = requireAllowedValue(
    draft.businessIndustry,
    "Business industry",
    BUSINESS_INDUSTRIES,
  );
  const businessRegistrationIdentifier = requireAllowedValue(
    draft.businessRegistrationIdentifier,
    "Business registration identifier",
    BUSINESS_REGISTRATION_IDENTIFIERS,
  );
  const businessRegistrationNumber = requireText(
    draft.businessRegistrationNumber,
    "Business registration number",
  );
  const websiteUrl = requireText(draft.websiteUrl, "Website URL");
  const businessRegionsOfOperation = normalizeStringArray(
    draft.businessRegionsOfOperation,
  );
  if (businessRegionsOfOperation.length === 0) {
    throw new Error("At least one business region of operation is required.");
  }
  for (const region of businessRegionsOfOperation) {
    if (!BUSINESS_REGIONS_OF_OPERATION.has(region)) {
      throw new Error(
        `Business regions of operation must be one of: ${Array.from(BUSINESS_REGIONS_OF_OPERATION).join(", ")}.`,
      );
    }
  }

  const companyType = requireAllowedValue(draft.companyType, "Company type", COMPANY_TYPES);
  const brandContactEmail = hasText(draft.brandContactEmail)
    ? draft.brandContactEmail.trim()
    : undefined;
  const campaignDescription = requireText(
    draft.campaignDescription,
    "Campaign description",
  );
  const messageFlow = requireText(draft.messageFlow, "Message flow");
  const sampleMessages = normalizeStringArray(draft.sampleMessages);
  if (sampleMessages.length < 2) {
    throw new Error("At least two sample messages are required.");
  }

  const optInKeywords = normalizeStringArray(draft.optInKeywords);
  const optOutKeywords = normalizeStringArray(draft.optOutKeywords);
  const helpKeywords = normalizeStringArray(draft.helpKeywords);
  const optOutMessage = requireText(draft.optOutMessage, "Opt-out message");
  const helpMessage = requireText(draft.helpMessage, "Help message");

  const address = draft.address;
  if (!address) {
    throw new Error("Business mailing address is required.");
  }

  const authorizedRepresentative = draft.authorizedRepresentative;
  if (!authorizedRepresentative) {
    throw new Error("Authorized representative details are required.");
  }

  const normalizedAddress = {
    customerName: requireText(address.customerName, "Business mailing name"),
    street: requireText(address.street, "Street address"),
    ...(hasText(address.streetSecondary)
      ? { streetSecondary: address.streetSecondary.trim() }
      : {}),
    city: requireText(address.city, "City"),
    region: requireText(address.region, "State or province"),
    postalCode: requireText(address.postalCode, "Postal code"),
    isoCountry: requireText(address.isoCountry, "Country code"),
  };

  const normalizedAuthorizedRepresentative = {
    firstName: requireText(
      authorizedRepresentative.firstName,
      "Authorized representative first name",
    ),
    lastName: requireText(
      authorizedRepresentative.lastName,
      "Authorized representative last name",
    ),
    businessTitle: requireText(
      authorizedRepresentative.businessTitle,
      "Authorized representative business title",
    ),
    jobPosition: requireAllowedValue(
      authorizedRepresentative.jobPosition,
      "Authorized representative job position",
      JOB_POSITIONS,
    ),
    phoneNumber: requireText(
      authorizedRepresentative.phoneNumber,
      "Authorized representative phone number",
    ),
    email: requireText(authorizedRepresentative.email, "Authorized representative email"),
  };

  if (companyType === "public" && !brandContactEmail) {
    throw new Error("Brand contact email is required for public companies.");
  }

  return {
    businessName,
    businessType,
    businessIndustry,
    businessRegistrationIdentifier,
    businessRegistrationNumber,
    websiteUrl,
    socialProfileUrls: normalizeStringArray(draft.socialProfileUrls),
    businessRegionsOfOperation,
    companyType,
    ...(hasText(draft.stockExchange) ? { stockExchange: draft.stockExchange.trim() } : {}),
    ...(hasText(draft.stockTicker) ? { stockTicker: draft.stockTicker.trim() } : {}),
    ...(brandContactEmail ? { brandContactEmail } : {}),
    campaignDescription,
    messageFlow,
    sampleMessages,
    hasEmbeddedLinks: draft.hasEmbeddedLinks ?? false,
    hasEmbeddedPhone: draft.hasEmbeddedPhone ?? false,
    ...(hasText(draft.optInMessage) ? { optInMessage: draft.optInMessage.trim() } : {}),
    optOutMessage,
    helpMessage,
    optInKeywords,
    optOutKeywords,
    helpKeywords,
    address: normalizedAddress,
    authorizedRepresentative: normalizedAuthorizedRepresentative,
  };
}
