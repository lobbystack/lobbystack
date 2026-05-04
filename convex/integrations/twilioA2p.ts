"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { buildTwilioSmsInboundWebhookUrl } from "../lib/twilioUrls";
import {
  assertSmsComplianceDraftReady,
  isSmsComplianceApproved,
  smsComplianceDraftValidator,
  smsCompliancePendingActionValidator,
  smsComplianceStatusValidator,
  smsComplianceTrafficTierValidator,
  type CompletedSmsComplianceDraft,
  type SmsCompliancePendingAction,
  type SmsComplianceStatus,
} from "../lib/smsCompliance";
import { getTwilioClient } from "../lib/node/twilioClient";

import { observedInternalAction as internalAction } from "../telemetry/observedFunctions";
const DEFAULT_TWILIO_A2P_TRUST_PRODUCT_POLICY_SID =
  "RNc97f3d2a7ccf01b0e53a29ee4c54d31a";

type TwilioClientLike = ReturnType<typeof getTwilioClient> & Record<string, unknown>;

type TwilioRegistrationContext = {
  business: Doc<"businesses">;
  registration: Doc<"sms_compliance_registrations">;
  phoneNumber: Doc<"phone_numbers">;
  trafficTier: Doc<"sms_compliance_registrations">["trafficTier"];
  twilioUsecaseCode: string;
  previousCompletedSubmission?: Doc<"sms_compliance_submissions">;
};

type TwilioEvaluationSummary = {
  status: string | null;
  errors: string[];
};

type TwilioBrandSummary = {
  sid?: string;
  status?: string;
  failureMessage?: string;
  errors: string[];
};

type TwilioCampaignSummary = {
  sid?: string;
  campaignStatus?: string;
  errors: string[];
};

function requirePrimaryCustomerProfileSid(): string {
  const primaryCustomerProfileSid = process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
  if (!primaryCustomerProfileSid) {
    throw new Error(
      "TWILIO_PRIMARY_CUSTOMER_PROFILE_SID is required for hosted 10DLC registration.",
    );
  }

  return primaryCustomerProfileSid;
}

function getTwilioA2pTrustProductPolicySid(): string {
  return (
    process.env.TWILIO_A2P_TRUST_PRODUCT_POLICY_SID ??
    DEFAULT_TWILIO_A2P_TRUST_PRODUCT_POLICY_SID
  );
}

function requireTwilioA2pStatusEmail(): string {
  const email = process.env.TWILIO_A2P_STATUS_EMAIL?.trim();
  if (!email) {
    throw new Error(
      "TWILIO_A2P_STATUS_EMAIL is required for hosted 10DLC registration callbacks.",
    );
  }

  return email;
}

function getTwilioA2pRequestDelayMs(): number {
  const raw = process.env.TWILIO_A2P_REQUEST_DELAY_MS;
  if (!raw) {
    return 1_000;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1_000;
}

function getString(resource: unknown, ...keys: string[]): string | undefined {
  if (!resource || typeof resource !== "object") {
    return undefined;
  }

  const candidate = resource as Record<string, unknown>;
  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function getStringArray(resource: unknown, key: string): string[] {
  if (!resource || typeof resource !== "object") {
    return [];
  }

  const value = (resource as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        return (
          getString(entry, "message", "description", "error_code", "code") ?? JSON.stringify(entry)
        );
      }
      return String(entry);
    })
    .filter((entry) => entry.length > 0);
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function normalizeTwilioErrors(resource: unknown): string[] {
  const errors = getStringArray(resource, "errors");
  if (errors.length > 0) {
    return errors;
  }

  const failureReason = getString(resource, "failureReason", "failure_reason");
  return failureReason ? [failureReason] : [];
}

function normalizeBrand(resource: unknown): TwilioBrandSummary {
  const sid = getString(resource, "sid");
  const status = getString(resource, "status");
  const failureMessage = getString(resource, "failureReason", "failure_reason");

  return {
    ...(sid ? { sid } : {}),
    ...(status ? { status } : {}),
    ...(failureMessage ? { failureMessage } : {}),
    errors: normalizeTwilioErrors(resource),
  };
}

function normalizeCampaign(resource: unknown): TwilioCampaignSummary {
  const sid = getString(resource, "sid");
  const campaignStatus = getString(resource, "campaignStatus", "campaign_status");

  return {
    ...(sid ? { sid } : {}),
    ...(campaignStatus ? { campaignStatus } : {}),
    errors: normalizeTwilioErrors(resource),
  };
}

function normalizeEvaluation(resource: unknown): TwilioEvaluationSummary {
  return {
    status: getString(resource, "status") ?? null,
    errors: getStringArray(resource, "results"),
  };
}

function buildBusinessInformationAttributes(
  draft: CompletedSmsComplianceDraft,
): Record<string, string | string[]> {
  return {
    business_name: draft.businessName,
    business_type: draft.businessType,
    business_industry: draft.businessIndustry,
    business_registration_identifier: draft.businessRegistrationIdentifier,
    business_registration_number: draft.businessRegistrationNumber,
    website_url: draft.websiteUrl,
    business_identity: "direct_customer",
    business_regions_of_operation: draft.businessRegionsOfOperation,
    ...(draft.socialProfileUrls.length > 0
      ? { social_media_profile_urls: draft.socialProfileUrls }
      : {}),
  };
}

function buildAuthorizedRepresentativeAttributes(
  draft: CompletedSmsComplianceDraft,
): Record<string, string> {
  return {
    first_name: draft.authorizedRepresentative.firstName,
    last_name: draft.authorizedRepresentative.lastName,
    business_title: draft.authorizedRepresentative.businessTitle,
    job_position: draft.authorizedRepresentative.jobPosition,
    phone_number: draft.authorizedRepresentative.phoneNumber,
    email: draft.authorizedRepresentative.email,
  };
}

function buildMessagingProfileAttributes(
  draft: CompletedSmsComplianceDraft,
): Record<string, string> {
  return {
    company_type: draft.companyType,
    ...(draft.stockExchange ? { stock_exchange: draft.stockExchange } : {}),
    ...(draft.stockTicker ? { stock_ticker: draft.stockTicker } : {}),
    ...(draft.brandContactEmail ? { brand_contact_email: draft.brandContactEmail } : {}),
  };
}

function buildBusinessAddressParams(
  draft: CompletedSmsComplianceDraft,
): Record<string, string> {
  return {
    friendlyName: `${draft.businessName} Mailing Address`,
    customerName: draft.address.customerName,
    street: draft.address.street,
    ...(draft.address.streetSecondary
      ? { streetSecondary: draft.address.streetSecondary }
      : {}),
    city: draft.address.city,
    region: draft.address.region,
    postalCode: draft.address.postalCode,
  };
}

function buildMessagingServiceParams(
  context: TwilioRegistrationContext,
): Record<string, boolean | string> {
  return {
    friendlyName: `${context.business.name} AI SMS`,
    stickySender: true,
    useInboundWebhookOnNumber: true,
    inboundRequestUrl: buildTwilioSmsInboundWebhookUrl(),
    inboundMethod: "POST",
  };
}

function buildCampaignUpdateParams(
  draft: CompletedSmsComplianceDraft,
): Record<string, boolean | string | string[]> {
  return {
    ageGated: false,
    description: draft.campaignDescription,
    directLending: false,
    hasEmbeddedLinks: draft.hasEmbeddedLinks,
    hasEmbeddedPhone: draft.hasEmbeddedPhone,
    messageFlow: draft.messageFlow,
    messageSamples: draft.sampleMessages,
  };
}

function buildCampaignCreateParams(input: {
  brandRegistrationSid: string;
  draft: CompletedSmsComplianceDraft;
  usecaseCode: string;
}): Record<string, boolean | string | string[]> {
  return {
    brandRegistrationSid: input.brandRegistrationSid,
    ...buildCampaignUpdateParams(input.draft),
    usAppToPersonUsecase: input.usecaseCode,
    subscriberOptIn: true,
    subscriberOptOut: true,
    subscriberHelp: true,
    ...(input.draft.optInMessage ? { optInMessage: input.draft.optInMessage } : {}),
    optOutMessage: input.draft.optOutMessage,
    helpMessage: input.draft.helpMessage,
    ...(input.draft.optInKeywords.length > 0
      ? { optInKeywords: input.draft.optInKeywords }
      : {}),
    ...(input.draft.optOutKeywords.length > 0
      ? { optOutKeywords: input.draft.optOutKeywords }
      : {}),
    ...(input.draft.helpKeywords.length > 0
      ? { helpKeywords: input.draft.helpKeywords }
      : {}),
  };
}

function getPreviousCompletedDraft(
  context: TwilioRegistrationContext,
): CompletedSmsComplianceDraft | undefined {
  const previousDraft = context.previousCompletedSubmission?.snapshot.draft;
  if (!previousDraft) {
    return undefined;
  }

  return assertSmsComplianceDraftReady(previousDraft);
}

function hasImmutableCampaignConfigChanges(input: {
  currentDraft: CompletedSmsComplianceDraft;
  currentTrafficTier: Doc<"sms_compliance_registrations">["trafficTier"];
  previousDraft: CompletedSmsComplianceDraft;
  previousTrafficTier: Doc<"sms_compliance_submissions">["trafficTier"];
}): boolean {
  return (
    input.currentTrafficTier !== input.previousTrafficTier ||
    (input.currentDraft.optInMessage ?? "") !== (input.previousDraft.optInMessage ?? "") ||
    input.currentDraft.optOutMessage !== input.previousDraft.optOutMessage ||
    input.currentDraft.helpMessage !== input.previousDraft.helpMessage ||
    !areStringArraysEqual(input.currentDraft.optInKeywords, input.previousDraft.optInKeywords) ||
    !areStringArraysEqual(input.currentDraft.optOutKeywords, input.previousDraft.optOutKeywords) ||
    !areStringArraysEqual(input.currentDraft.helpKeywords, input.previousDraft.helpKeywords)
  );
}

function buildTwilioErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Twilio A2P registration failed.";
}

function isDuplicateTwilioError(error: unknown): boolean {
  const message = buildTwilioErrorMessage(error).toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("already assigned") ||
    message.includes("duplicate")
  );
}

function buildPendingActionFromErrors(
  errors: string[],
  fallbackType: SmsCompliancePendingAction["type"],
): SmsCompliancePendingAction | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  const message = errors.join(" ");
  const normalized = message.toLowerCase();
  if (
    normalized.includes("otp") ||
    normalized.includes("one time passcode") ||
    normalized.includes("verification")
  ) {
    return {
      type: "brand_contact_email_otp",
      message,
      code: "brand_contact_email_otp",
    };
  }

  if (normalized.includes("address") || normalized.includes("business") || normalized.includes("missing")) {
    return {
      type: "missing_information",
      message,
      code: "twilio_missing_information",
    };
  }

  return {
    type: fallbackType,
    message,
  };
}

function deriveRegistrationState(input: {
  customerProfileEvaluation?: TwilioEvaluationSummary;
  trustProductEvaluation?: TwilioEvaluationSummary;
  brand?: TwilioBrandSummary;
  campaign?: TwilioCampaignSummary;
  phoneAttached: boolean;
}): {
  status: SmsComplianceStatus;
  pendingAction?: SmsCompliancePendingAction;
  failureCode?: string;
  failureMessage?: string;
} {
  if (input.customerProfileEvaluation?.status === "noncompliant") {
    const pendingAction = buildPendingActionFromErrors(
      input.customerProfileEvaluation.errors,
      "missing_information",
    );
    return {
      status: "failed",
      ...(pendingAction ? { pendingAction } : {}),
      failureCode: "customer_profile_noncompliant",
      failureMessage:
        pendingAction?.message ?? "Twilio reported missing or invalid customer profile data.",
    };
  }

  if (input.trustProductEvaluation?.status === "noncompliant") {
    const pendingAction = buildPendingActionFromErrors(
      input.trustProductEvaluation.errors,
      "missing_information",
    );
    return {
      status: "failed",
      ...(pendingAction ? { pendingAction } : {}),
      failureCode: "trust_product_noncompliant",
      failureMessage:
        pendingAction?.message ?? "Twilio reported missing or invalid messaging profile data.",
    };
  }

  if (input.brand?.status === "FAILED") {
    const pendingAction = buildPendingActionFromErrors(input.brand.errors, "manual_review");
    return {
      status: "failed",
      ...(pendingAction ? { pendingAction } : {}),
      failureCode: "brand_failed",
      failureMessage:
        input.brand.failureMessage ??
        pendingAction?.message ??
        "Twilio rejected the brand registration.",
    };
  }

  if (input.brand?.status === "SUSPENDED") {
    return {
      status: "suspended",
      pendingAction: {
        type: "manual_review",
        message: "Twilio suspended this 10DLC brand. Contact support before retrying.",
      },
      failureCode: "brand_suspended",
      failureMessage: "Twilio suspended this 10DLC brand.",
    };
  }

  if (input.campaign?.campaignStatus === "FAILED") {
    const pendingAction = buildPendingActionFromErrors(input.campaign.errors, "campaign_review");
    return {
      status: "failed",
      ...(pendingAction ? { pendingAction } : {}),
      failureCode: "campaign_failed",
      failureMessage:
        pendingAction?.message ?? "Twilio rejected the A2P campaign submission.",
    };
  }

  const otpPending = [...(input.brand?.errors ?? []), ...(input.campaign?.errors ?? [])].some(
    (error) => {
      const normalized = error.toLowerCase();
      return normalized.includes("otp") || normalized.includes("verification");
    },
  );
  if (otpPending) {
    return {
      status: "pending_brand_verification",
      pendingAction: {
        type: "brand_contact_email_otp",
        message:
          "Brand contact verification is still pending. Complete the Twilio verification email, then resume registration.",
      },
    };
  }

  if (input.campaign?.campaignStatus === "VERIFIED") {
    if (input.phoneAttached) {
      return {
        status: "approved",
      };
    }

    return {
      status: "pending_review",
      pendingAction: {
        type: "phone_number_association",
        message:
          "The campaign is approved, but the business phone number is still being attached to the Messaging Service.",
      },
    };
  }

  if (
    input.brand?.status === "PENDING" ||
    input.brand?.status === "IN_REVIEW" ||
    input.campaign?.campaignStatus === "IN_PROGRESS" ||
    input.campaign?.campaignStatus === "PENDING"
  ) {
    return {
      status: "pending_review",
      pendingAction: {
        type: "campaign_review",
        message:
          "Twilio is still reviewing this 10DLC registration. Keep alerts on the shared sender until approval completes.",
      },
    };
  }

  return {
    status: "pending_review",
    pendingAction: {
      type: "manual_review",
      message:
        "Twilio accepted the registration request, but the review has not finished yet.",
    },
  };
}

async function maybePauseForTwilioRateLimit(): Promise<void> {
  const delayMs = getTwilioA2pRequestDelayMs();
  if (delayMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchPrimaryCustomerProfilePolicySid(
  client: TwilioClientLike,
): Promise<string> {
  const primaryCustomerProfileSid = requirePrimaryCustomerProfileSid();
  const resource = await (client as any).trusthub.v1
    .customerProfiles(primaryCustomerProfileSid)
    .fetch();

  const policySid = getString(resource, "policySid", "policy_sid");
  if (!policySid) {
    throw new Error("Twilio primary customer profile is missing a policy SID.");
  }

  return policySid;
}

async function createSecondaryCustomerProfile(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
): Promise<string> {
  const policySid = await fetchPrimaryCustomerProfilePolicySid(client);
  const resource = await (client as any).trusthub.v1.customerProfiles.create({
    friendlyName: `${context.business.name} Secondary Customer Profile`,
    email: requireTwilioA2pStatusEmail(),
    policySid,
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a customer profile SID.");
  }

  return sid;
}

async function createBusinessInformationEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  draft: CompletedSmsComplianceDraft,
): Promise<string> {
  const resource = await (client as any).trusthub.v1.endUsers.create({
    friendlyName: `${context.business.name} Business Information`,
    type: "customer_profile_business_information",
    attributes: buildBusinessInformationAttributes(draft),
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a business information end user SID.");
  }
  return sid;
}

async function updateBusinessInformationEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  businessInfoSid: string,
  draft: CompletedSmsComplianceDraft,
): Promise<void> {
  await (client as any).trusthub.v1.endUsers(businessInfoSid).update({
    friendlyName: `${context.business.name} Business Information`,
    attributes: buildBusinessInformationAttributes(draft),
  });
}

async function createAuthorizedRepresentativeEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  draft: CompletedSmsComplianceDraft,
): Promise<string> {
  const resource = await (client as any).trusthub.v1.endUsers.create({
    friendlyName: `${context.business.name} Authorized Representative`,
    type: "authorized_representative_1",
    attributes: buildAuthorizedRepresentativeAttributes(draft),
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return an authorized representative SID.");
  }
  return sid;
}

async function updateAuthorizedRepresentativeEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  authorizedRepresentativeSid: string,
  draft: CompletedSmsComplianceDraft,
): Promise<void> {
  await (client as any).trusthub.v1.endUsers(authorizedRepresentativeSid).update({
    friendlyName: `${context.business.name} Authorized Representative`,
    attributes: buildAuthorizedRepresentativeAttributes(draft),
  });
}

async function createBusinessAddress(
  client: TwilioClientLike,
  draft: CompletedSmsComplianceDraft,
): Promise<string> {
  const resource = await (client as any).api.v2010.account.addresses.create({
    ...buildBusinessAddressParams(draft),
    isoCountry: draft.address.isoCountry,
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a mailing address SID.");
  }
  return sid;
}

async function updateBusinessAddress(
  client: TwilioClientLike,
  addressSid: string,
  draft: CompletedSmsComplianceDraft,
): Promise<void> {
  await (client as any).api.v2010.account.addresses(addressSid).update(
    buildBusinessAddressParams(draft),
  );
}

async function createCustomerProfileAddressDocument(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  addressSid: string,
): Promise<string> {
  const resource = await (client as any).trusthub.v1.supportingDocuments.create({
    friendlyName: `${context.business.name} Customer Profile Address`,
    type: "customer_profile_address",
    attributes: {
      address_sids: addressSid,
    },
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a customer profile address document SID.");
  }
  return sid;
}

async function updateCustomerProfileAddressDocument(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  addressDocumentSid: string,
  addressSid: string,
): Promise<void> {
  await (client as any).trusthub.v1.supportingDocuments(addressDocumentSid).update({
    friendlyName: `${context.business.name} Customer Profile Address`,
    attributes: {
      address_sids: addressSid,
    },
  });
}

async function createMessagingProfileEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  draft: CompletedSmsComplianceDraft,
): Promise<string> {
  const resource = await (client as any).trusthub.v1.endUsers.create({
    friendlyName: `${context.business.name} A2P Messaging Profile`,
    type: "us_a2p_messaging_profile_information",
    attributes: buildMessagingProfileAttributes(draft),
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a messaging profile SID.");
  }
  return sid;
}

async function updateMessagingProfileEndUser(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  messagingProfileSid: string,
  draft: CompletedSmsComplianceDraft,
): Promise<void> {
  await (client as any).trusthub.v1.endUsers(messagingProfileSid).update({
    friendlyName: `${context.business.name} A2P Messaging Profile`,
    attributes: buildMessagingProfileAttributes(draft),
  });
}

async function createTrustProduct(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
): Promise<string> {
  const resource = await (client as any).trusthub.v1.trustProducts.create({
    friendlyName: `${context.business.name} A2P Messaging Profile`,
    email: requireTwilioA2pStatusEmail(),
    policySid: getTwilioA2pTrustProductPolicySid(),
  });

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a TrustProduct SID.");
  }
  return sid;
}

async function assignObjectToCustomerProfile(
  client: TwilioClientLike,
  customerProfileSid: string,
  objectSid: string,
): Promise<void> {
  try {
    await (client as any).trusthub.v1
      .customerProfiles(customerProfileSid)
      .customerProfilesEntityAssignments.create({
        objectSid,
      });
  } catch (error) {
    if (isDuplicateTwilioError(error)) {
      return;
    }
    throw error;
  }
}

async function assignObjectToTrustProduct(
  client: TwilioClientLike,
  trustProductSid: string,
  objectSid: string,
): Promise<void> {
  try {
    await (client as any).trusthub.v1
      .trustProducts(trustProductSid)
      .trustProductsEntityAssignments.create({
        objectSid,
      });
  } catch (error) {
    if (isDuplicateTwilioError(error)) {
      return;
    }
    throw error;
  }
}

async function evaluateCustomerProfile(
  client: TwilioClientLike,
  customerProfileSid: string,
): Promise<TwilioEvaluationSummary> {
  const resource = await (client as any).trusthub.v1
    .customerProfiles(customerProfileSid)
    .evaluations.create({
      policySid: await fetchPrimaryCustomerProfilePolicySid(client),
    });

  return normalizeEvaluation(resource);
}

async function submitCustomerProfileForReview(
  client: TwilioClientLike,
  customerProfileSid: string,
): Promise<void> {
  await (client as any).trusthub.v1.customerProfiles(customerProfileSid).update({
    status: "pending-review",
  });
}

async function evaluateTrustProduct(
  client: TwilioClientLike,
  trustProductSid: string,
): Promise<TwilioEvaluationSummary> {
  const resource = await (client as any).trusthub.v1
    .trustProducts(trustProductSid)
    .evaluations.create({
      policySid: getTwilioA2pTrustProductPolicySid(),
    });

  return normalizeEvaluation(resource);
}

async function submitTrustProductForReview(
  client: TwilioClientLike,
  trustProductSid: string,
): Promise<void> {
  await (client as any).trusthub.v1.trustProducts(trustProductSid).update({
    status: "pending-review",
  });
}

async function createBrandRegistration(
  client: TwilioClientLike,
  input: {
    customerProfileSid: string;
    trustProductSid: string;
    lowVolume: boolean;
  },
): Promise<TwilioBrandSummary> {
  await maybePauseForTwilioRateLimit();

  const resource = await (client as any).messaging.v1.brandRegistrations.create({
    customerProfileBundleSid: input.customerProfileSid,
    a2PProfileBundleSid: input.trustProductSid,
    brandType: "STANDARD",
    skipAutomaticSecVet: input.lowVolume,
  });

  return normalizeBrand(resource);
}

async function fetchBrandRegistration(
  client: TwilioClientLike,
  brandRegistrationSid: string,
): Promise<TwilioBrandSummary> {
  const resource = await (client as any).messaging.v1
    .brandRegistrations(brandRegistrationSid)
    .fetch();
  return normalizeBrand(resource);
}

async function resubmitBrandRegistration(
  client: TwilioClientLike,
  brandRegistrationSid: string,
): Promise<TwilioBrandSummary> {
  await maybePauseForTwilioRateLimit();

  const resource = await (client as any).messaging.v1
    .brandRegistrations(brandRegistrationSid)
    .update();
  return normalizeBrand(resource);
}

async function createMessagingService(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
): Promise<string> {
  const resource = await (client as any).messaging.v1.services.create(
    buildMessagingServiceParams(context),
  );

  const sid = getString(resource, "sid");
  if (!sid) {
    throw new Error("Twilio did not return a Messaging Service SID.");
  }
  return sid;
}

async function updateMessagingService(
  client: TwilioClientLike,
  context: TwilioRegistrationContext,
  messagingServiceSid: string,
): Promise<void> {
  await (client as any).messaging.v1
    .services(messagingServiceSid)
    .update(buildMessagingServiceParams(context));
}

async function createCampaign(
  client: TwilioClientLike,
  input: {
    messagingServiceSid: string;
    brandRegistrationSid: string;
    draft: CompletedSmsComplianceDraft;
    usecaseCode: string;
  },
): Promise<TwilioCampaignSummary> {
  await maybePauseForTwilioRateLimit();

  const resource = await (client as any).messaging.v1
    .services(input.messagingServiceSid)
    .usAppToPerson.create(
      buildCampaignCreateParams({
        brandRegistrationSid: input.brandRegistrationSid,
        draft: input.draft,
        usecaseCode: input.usecaseCode,
      }),
    );

  return normalizeCampaign(resource);
}

async function updateCampaign(
  client: TwilioClientLike,
  input: {
    messagingServiceSid: string;
    campaignSid: string;
    draft: CompletedSmsComplianceDraft;
  },
): Promise<TwilioCampaignSummary> {
  await maybePauseForTwilioRateLimit();

  const resource = await (client as any).messaging.v1
    .services(input.messagingServiceSid)
    .usAppToPerson(input.campaignSid)
    .update(buildCampaignUpdateParams(input.draft));
  return normalizeCampaign(resource);
}

async function deleteCampaign(
  client: TwilioClientLike,
  input: {
    messagingServiceSid: string;
    campaignSid: string;
  },
): Promise<void> {
  await maybePauseForTwilioRateLimit();

  await (client as any).messaging.v1
    .services(input.messagingServiceSid)
    .usAppToPerson(input.campaignSid)
    .remove();
}

async function fetchCampaign(
  client: TwilioClientLike,
  messagingServiceSid: string,
  campaignSid?: string,
): Promise<TwilioCampaignSummary | undefined> {
  if (campaignSid) {
    const resource = await (client as any).messaging.v1
      .services(messagingServiceSid)
      .usAppToPerson(campaignSid)
      .fetch();
    return normalizeCampaign(resource);
  }

  const resources = await (client as any).messaging.v1
    .services(messagingServiceSid)
    .usAppToPerson.list({
      limit: 1,
    });

  const resource = Array.isArray(resources) ? resources[0] : undefined;
  return resource ? normalizeCampaign(resource) : undefined;
}

async function ensurePhoneNumberAttachedToMessagingService(
  client: TwilioClientLike,
  input: {
    messagingServiceSid: string;
    phoneNumberSid: string;
  },
): Promise<boolean> {
  const phoneNumbers = await (client as any).messaging.v1
    .services(input.messagingServiceSid)
    .phoneNumbers.list({
      limit: 100,
    });
  if (
    Array.isArray(phoneNumbers) &&
    phoneNumbers.some(
      (phoneNumber) => getString(phoneNumber, "sid", "phoneNumberSid") === input.phoneNumberSid,
    )
  ) {
    return true;
  }

  await (client as any).messaging.v1
    .services(input.messagingServiceSid)
    .phoneNumbers.create({
      phoneNumberSid: input.phoneNumberSid,
    });
  return true;
}

export const syncRegistration = internalAction({
  args: {
    registrationId: v.id("sms_compliance_registrations"),
    mode: v.union(v.literal("submit"), v.literal("refresh")),
  },
  returns: v.object({
    status: smsComplianceStatusValidator,
    trafficTier: v.optional(smsComplianceTrafficTierValidator),
    draft: v.optional(smsComplianceDraftValidator),
    twilioCustomerProfileSid: v.optional(v.string()),
    twilioBusinessInfoSid: v.optional(v.string()),
    twilioAuthorizedRepresentativeSid: v.optional(v.string()),
    twilioAddressSid: v.optional(v.string()),
    twilioAddressDocumentSid: v.optional(v.string()),
    twilioTrustProductSid: v.optional(v.string()),
    twilioMessagingProfileSid: v.optional(v.string()),
    twilioBrandRegistrationSid: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
    twilioCampaignSid: v.optional(v.string()),
    approvedPhoneNumberId: v.optional(v.id("phone_numbers")),
    brandContactEmail: v.optional(v.string()),
    lastSubmittedAt: v.optional(v.string()),
    lastSyncedAt: v.string(),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    pendingAction: v.optional(smsCompliancePendingActionValidator),
  }),
  handler: async (ctx, args) => {
    const client = getTwilioClient() as TwilioClientLike;
    const context = (await ctx.runQuery(internal.smsCompliance.getTwilioRegistrationContext, {
      registrationId: args.registrationId,
    })) as unknown as TwilioRegistrationContext;
    const draft = assertSmsComplianceDraftReady(context.registration.draft);
    const previousCompletedDraft = getPreviousCompletedDraft(context);
    const now = new Date().toISOString();

    let customerProfileSid = context.registration.twilioCustomerProfileSid;
    let businessInfoSid = context.registration.twilioBusinessInfoSid;
    let authorizedRepresentativeSid = context.registration.twilioAuthorizedRepresentativeSid;
    let addressSid = context.registration.twilioAddressSid;
    let addressDocumentSid = context.registration.twilioAddressDocumentSid;
    let trustProductSid = context.registration.twilioTrustProductSid;
    let messagingProfileSid = context.registration.twilioMessagingProfileSid;
    let brandRegistrationSid = context.registration.twilioBrandRegistrationSid;
    let messagingServiceSid = context.registration.twilioMessagingServiceSid;
    let campaignSid = context.registration.twilioCampaignSid;

    let customerProfileEvaluation: TwilioEvaluationSummary | undefined;
    let trustProductEvaluation: TwilioEvaluationSummary | undefined;
    let brand: TwilioBrandSummary | undefined;
    let campaign: TwilioCampaignSummary | undefined;

    try {
      if (args.mode === "submit") {
        if (!customerProfileSid) {
          customerProfileSid = await createSecondaryCustomerProfile(client, context);
        }
        if (!businessInfoSid) {
          businessInfoSid = await createBusinessInformationEndUser(client, context, draft);
        } else {
          await updateBusinessInformationEndUser(client, context, businessInfoSid, draft);
        }
        await assignObjectToCustomerProfile(client, customerProfileSid, businessInfoSid);
        if (!authorizedRepresentativeSid) {
          authorizedRepresentativeSid = await createAuthorizedRepresentativeEndUser(
            client,
            context,
            draft,
          );
        } else {
          await updateAuthorizedRepresentativeEndUser(
            client,
            context,
            authorizedRepresentativeSid,
            draft,
          );
        }
        await assignObjectToCustomerProfile(
          client,
          customerProfileSid,
          authorizedRepresentativeSid,
        );
        const shouldRecreateAddress =
          Boolean(addressSid) &&
          Boolean(previousCompletedDraft) &&
          previousCompletedDraft!.address.isoCountry !== draft.address.isoCountry;
        if (!addressSid || shouldRecreateAddress) {
          addressSid = await createBusinessAddress(client, draft);
        } else {
          await updateBusinessAddress(client, addressSid, draft);
        }
        if (!addressDocumentSid) {
          addressDocumentSid = await createCustomerProfileAddressDocument(
            client,
            context,
            addressSid,
          );
        } else {
          await updateCustomerProfileAddressDocument(
            client,
            context,
            addressDocumentSid,
            addressSid,
          );
        }
        await assignObjectToCustomerProfile(client, customerProfileSid, addressDocumentSid);

        await assignObjectToCustomerProfile(
          client,
          customerProfileSid,
          requirePrimaryCustomerProfileSid(),
        );
        customerProfileEvaluation = await evaluateCustomerProfile(client, customerProfileSid);
        if (customerProfileEvaluation.status !== "noncompliant") {
          await submitCustomerProfileForReview(client, customerProfileSid);
        }

        if (!trustProductSid) {
          trustProductSid = await createTrustProduct(client, context);
        }
        if (!messagingProfileSid) {
          messagingProfileSid = await createMessagingProfileEndUser(client, context, draft);
        } else {
          await updateMessagingProfileEndUser(client, context, messagingProfileSid, draft);
        }
        await assignObjectToTrustProduct(client, trustProductSid, messagingProfileSid);
        await assignObjectToTrustProduct(client, trustProductSid, customerProfileSid);
        trustProductEvaluation = await evaluateTrustProduct(client, trustProductSid);
        if (trustProductEvaluation.status !== "noncompliant") {
          await submitTrustProductForReview(client, trustProductSid);
        }

        if (!brandRegistrationSid && trustProductEvaluation.status !== "noncompliant") {
          brand = await createBrandRegistration(client, {
            customerProfileSid,
            trustProductSid,
            lowVolume: context.trafficTier === "low_volume",
          });
          brandRegistrationSid = brand.sid;
        } else if (brandRegistrationSid && trustProductEvaluation.status !== "noncompliant") {
          brand = await fetchBrandRegistration(client, brandRegistrationSid);
          if (brand.status === "FAILED") {
            brand = await resubmitBrandRegistration(client, brandRegistrationSid);
          }
        }

        if (!messagingServiceSid) {
          messagingServiceSid = await createMessagingService(client, context);
        } else {
          await updateMessagingService(client, context, messagingServiceSid);
        }

        if (
          brandRegistrationSid &&
          messagingServiceSid &&
          trustProductEvaluation.status !== "noncompliant"
        ) {
          if (!campaignSid) {
            campaign = await createCampaign(client, {
              messagingServiceSid,
              brandRegistrationSid,
              draft,
              usecaseCode: context.twilioUsecaseCode,
            });
            campaignSid = campaign.sid;
          } else {
            const existingCampaign = await fetchCampaign(client, messagingServiceSid, campaignSid);
            const recreateFailedCampaign =
              existingCampaign?.campaignStatus === "FAILED" &&
              Boolean(previousCompletedDraft) &&
              Boolean(context.previousCompletedSubmission) &&
              hasImmutableCampaignConfigChanges({
                currentDraft: draft,
                currentTrafficTier: context.trafficTier,
                previousDraft: previousCompletedDraft!,
                previousTrafficTier: context.previousCompletedSubmission!.trafficTier,
              });

            if (recreateFailedCampaign) {
              await deleteCampaign(client, {
                messagingServiceSid,
                campaignSid,
              });
              campaign = await createCampaign(client, {
                messagingServiceSid,
                brandRegistrationSid,
                draft,
                usecaseCode: context.twilioUsecaseCode,
              });
              campaignSid = campaign.sid;
            } else if (existingCampaign) {
              campaign = await updateCampaign(client, {
                messagingServiceSid,
                campaignSid,
                draft,
              });
              campaignSid = campaign.sid ?? campaignSid;
            } else {
              campaign = await createCampaign(client, {
                messagingServiceSid,
                brandRegistrationSid,
                draft,
                usecaseCode: context.twilioUsecaseCode,
              });
              campaignSid = campaign.sid;
            }
          }
        }
      }

      if (!brand && brandRegistrationSid) {
        brand = await fetchBrandRegistration(client, brandRegistrationSid);
      }
      if (!campaign && messagingServiceSid) {
        campaign = await fetchCampaign(client, messagingServiceSid, campaignSid);
      }

      let phoneAttached = false;
      if (
        messagingServiceSid &&
        campaign?.campaignStatus === "VERIFIED" &&
        context.phoneNumber.twilioPhoneSid
      ) {
        try {
          phoneAttached = await ensurePhoneNumberAttachedToMessagingService(client, {
            messagingServiceSid,
            phoneNumberSid: context.phoneNumber.twilioPhoneSid,
          });
        } catch (error) {
          phoneAttached = false;
        }
      }

      const derivedState = deriveRegistrationState({
        ...(customerProfileEvaluation ? { customerProfileEvaluation } : {}),
        ...(trustProductEvaluation ? { trustProductEvaluation } : {}),
        ...(brand ? { brand } : {}),
        ...(campaign ? { campaign } : {}),
        phoneAttached,
      });

      return {
        status: derivedState.status,
        trafficTier: context.registration.trafficTier,
        ...(context.registration.draft ? { draft: context.registration.draft } : {}),
        ...(customerProfileSid ? { twilioCustomerProfileSid: customerProfileSid } : {}),
        ...(businessInfoSid ? { twilioBusinessInfoSid: businessInfoSid } : {}),
        ...(authorizedRepresentativeSid
          ? { twilioAuthorizedRepresentativeSid: authorizedRepresentativeSid }
          : {}),
        ...(addressSid ? { twilioAddressSid: addressSid } : {}),
        ...(addressDocumentSid ? { twilioAddressDocumentSid: addressDocumentSid } : {}),
        ...(trustProductSid ? { twilioTrustProductSid: trustProductSid } : {}),
        ...(messagingProfileSid ? { twilioMessagingProfileSid: messagingProfileSid } : {}),
        ...(brandRegistrationSid ? { twilioBrandRegistrationSid: brandRegistrationSid } : {}),
        ...(messagingServiceSid ? { twilioMessagingServiceSid: messagingServiceSid } : {}),
        ...(campaign?.sid ?? campaignSid ? { twilioCampaignSid: campaign?.sid ?? campaignSid } : {}),
        approvedPhoneNumberId: context.phoneNumber._id,
        ...(draft.brandContactEmail ? { brandContactEmail: draft.brandContactEmail } : {}),
        ...(args.mode === "submit" ? { lastSubmittedAt: now } : {}),
        lastSyncedAt: now,
        ...(derivedState.failureCode ? { failureCode: derivedState.failureCode } : {}),
        ...(derivedState.failureMessage ? { failureMessage: derivedState.failureMessage } : {}),
        ...(derivedState.pendingAction ? { pendingAction: derivedState.pendingAction } : {}),
      };
    } catch (error) {
      const message = buildTwilioErrorMessage(error);
      if (args.mode === "refresh" && isSmsComplianceApproved(context.registration.status)) {
        return {
          status: context.registration.status,
          trafficTier: context.registration.trafficTier,
          ...(context.registration.draft ? { draft: context.registration.draft } : {}),
          ...(customerProfileSid ? { twilioCustomerProfileSid: customerProfileSid } : {}),
          ...(businessInfoSid ? { twilioBusinessInfoSid: businessInfoSid } : {}),
          ...(authorizedRepresentativeSid
            ? { twilioAuthorizedRepresentativeSid: authorizedRepresentativeSid }
            : {}),
          ...(addressSid ? { twilioAddressSid: addressSid } : {}),
          ...(addressDocumentSid ? { twilioAddressDocumentSid: addressDocumentSid } : {}),
          ...(trustProductSid ? { twilioTrustProductSid: trustProductSid } : {}),
          ...(messagingProfileSid ? { twilioMessagingProfileSid: messagingProfileSid } : {}),
          ...(brandRegistrationSid ? { twilioBrandRegistrationSid: brandRegistrationSid } : {}),
          ...(messagingServiceSid ? { twilioMessagingServiceSid: messagingServiceSid } : {}),
          ...(campaignSid ? { twilioCampaignSid: campaignSid } : {}),
          approvedPhoneNumberId: context.phoneNumber._id,
          ...(draft.brandContactEmail ? { brandContactEmail: draft.brandContactEmail } : {}),
          lastSyncedAt: context.registration.lastSyncedAt ?? now,
          ...(context.registration.failureCode
            ? { failureCode: context.registration.failureCode }
            : {}),
          ...(context.registration.failureMessage
            ? { failureMessage: context.registration.failureMessage }
            : {}),
          ...(context.registration.pendingAction
            ? { pendingAction: context.registration.pendingAction }
            : {}),
        };
      }
      if (args.mode === "refresh") {
        throw error;
      }
      const pendingAction = buildPendingActionFromErrors([message], "manual_review");
      const failureStatus: SmsComplianceStatus =
        pendingAction?.type === "brand_contact_email_otp"
          ? "pending_brand_verification"
          : "failed";
      return {
        status: failureStatus,
        trafficTier: context.registration.trafficTier,
        ...(context.registration.draft ? { draft: context.registration.draft } : {}),
        ...(customerProfileSid ? { twilioCustomerProfileSid: customerProfileSid } : {}),
        ...(businessInfoSid ? { twilioBusinessInfoSid: businessInfoSid } : {}),
        ...(authorizedRepresentativeSid
          ? { twilioAuthorizedRepresentativeSid: authorizedRepresentativeSid }
          : {}),
        ...(addressSid ? { twilioAddressSid: addressSid } : {}),
        ...(addressDocumentSid ? { twilioAddressDocumentSid: addressDocumentSid } : {}),
        ...(trustProductSid ? { twilioTrustProductSid: trustProductSid } : {}),
        ...(messagingProfileSid ? { twilioMessagingProfileSid: messagingProfileSid } : {}),
        ...(brandRegistrationSid ? { twilioBrandRegistrationSid: brandRegistrationSid } : {}),
        ...(messagingServiceSid ? { twilioMessagingServiceSid: messagingServiceSid } : {}),
        ...(campaignSid ? { twilioCampaignSid: campaignSid } : {}),
        approvedPhoneNumberId: context.phoneNumber._id,
        ...(draft.brandContactEmail ? { brandContactEmail: draft.brandContactEmail } : {}),
        ...(args.mode === "submit" ? { lastSubmittedAt: now } : {}),
        lastSyncedAt: now,
        failureCode: "twilio_registration_error",
        failureMessage: message,
        ...(pendingAction ? { pendingAction } : {}),
      };
    }
  },
});
