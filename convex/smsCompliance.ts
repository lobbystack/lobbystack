import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireMembership } from "./lib/auth";
import { requireBillingManagementAccess } from "./lib/billingAccess";
import { getBillingSnapshot, isAiSmsEnabled } from "./lib/billing";
import {
  assertSmsComplianceDraftReady,
  getCampaignUsecaseForTrafficTier,
  isSmsComplianceApproved,
  smsComplianceBrandKindValidator,
  smsComplianceCampaignOptions,
  smsComplianceCustomerTypeValidator,
  smsComplianceDraftValidator,
  smsCompliancePendingActionValidator,
  smsComplianceStatusValidator,
  smsComplianceTrafficTierValidator,
  smsSenderModeValidator,
  type SmsComplianceDraft,
  type SmsComplianceStatus,
  type SmsComplianceTrafficTier,
  type SmsSenderMode,
} from "./lib/smsCompliance";

type SmsPhoneNumberDoc = Pick<
  Doc<"phone_numbers">,
  "_id" | "e164" | "smsEnabled" | "status" | "twilioPhoneSid"
>;

type SmsComplianceStatusView = {
  applicable: boolean;
  aiSmsCommerciallyEnabled: boolean;
  alertsUseBusinessSender: boolean;
  aiSmsReady: boolean;
  setupRequired: boolean;
  senderMode: SmsSenderMode;
  status: SmsComplianceStatus;
  customerType: "direct_customer";
  brandKind: "standard_business";
  trafficTier: SmsComplianceTrafficTier;
  availablePhoneNumbers: Array<{
    id: Id<"phone_numbers">;
    e164: string;
  }>;
  draft?: SmsComplianceDraft;
  pendingAction?: NonNullable<Doc<"sms_compliance_registrations">["pendingAction"]>;
  failureCode?: string;
  failureMessage?: string;
  approvedPhoneNumberId?: Id<"phone_numbers">;
  approvedPhoneNumberE164?: string;
  twilioMessagingServiceSid?: string;
};

type SmsComplianceActionResult = {
  registrationId: Id<"sms_compliance_registrations">;
  status: SmsComplianceStatus;
};

type BeginSubmissionAttemptResult = {
  started: boolean;
  registrationId: Id<"sms_compliance_registrations">;
  submissionId?: Id<"sms_compliance_submissions">;
  attemptKey?: string;
};

type TwilioSyncResult = {
  status: SmsComplianceStatus;
  trafficTier?: SmsComplianceTrafficTier;
  draft?: SmsComplianceDraft;
  twilioCustomerProfileSid?: string;
  twilioBusinessInfoSid?: string;
  twilioAuthorizedRepresentativeSid?: string;
  twilioAddressSid?: string;
  twilioAddressDocumentSid?: string;
  twilioTrustProductSid?: string;
  twilioMessagingProfileSid?: string;
  twilioBrandRegistrationSid?: string;
  twilioMessagingServiceSid?: string;
  twilioCampaignSid?: string;
  approvedPhoneNumberId?: Id<"phone_numbers">;
  brandContactEmail?: string;
  lastSubmittedAt?: string;
  lastSyncedAt: string;
  failureCode?: string;
  failureMessage?: string;
  pendingAction?: NonNullable<Doc<"sms_compliance_registrations">["pendingAction"]>;
};

async function getSmsComplianceRegistration(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  businessId: Id<"businesses">,
): Promise<Doc<"sms_compliance_registrations"> | null> {
  return await ctx.db
    .query("sms_compliance_registrations")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .unique();
}

function getEligibleSmsPhoneNumbers(
  phoneNumbers: Array<SmsPhoneNumberDoc>,
): Array<SmsPhoneNumberDoc> {
  return phoneNumbers.filter(
    (phoneNumber) => phoneNumber.status === "active" && phoneNumber.smsEnabled,
  );
}

function selectActiveSmsPhoneNumber(
  phoneNumbers: Array<SmsPhoneNumberDoc>,
  preferredPhoneNumberId?: Id<"phone_numbers">,
): SmsPhoneNumberDoc | null {
  const eligiblePhoneNumbers = getEligibleSmsPhoneNumbers(phoneNumbers);
  if (eligiblePhoneNumbers.length === 0) {
    return null;
  }

  if (preferredPhoneNumberId) {
    const preferredPhoneNumber = eligiblePhoneNumbers.find(
      (phoneNumber) => phoneNumber._id === preferredPhoneNumberId,
    );
    if (preferredPhoneNumber) {
      return preferredPhoneNumber;
    }

    return null;
  }

  return eligiblePhoneNumbers.length === 1 ? eligiblePhoneNumbers[0] ?? null : null;
}

function getPhoneNumberSelectionError(input: {
  phoneNumbers: Array<SmsPhoneNumberDoc>;
  preferredPhoneNumberId?: Id<"phone_numbers">;
}): string {
  const eligiblePhoneNumbers = getEligibleSmsPhoneNumbers(input.phoneNumbers);
  if (eligiblePhoneNumbers.length === 0) {
    return "At least one active SMS-enabled phone number must be mapped to the business.";
  }

  if (input.preferredPhoneNumberId) {
    return "The selected business phone number must remain active and SMS-enabled before continuing 10DLC registration.";
  }

  return "Choose which active SMS-enabled business phone number should be registered for hosted AI SMS before continuing 10DLC registration.";
}

function hasOperationalApprovedPhoneNumber(
  phoneNumber: SmsPhoneNumberDoc | null | undefined,
): boolean {
  return Boolean(phoneNumber && phoneNumber.status === "active" && phoneNumber.smsEnabled);
}

function deriveHostedSenderMode(input: {
  aiSmsCommerciallyEnabled: boolean;
  registration: Doc<"sms_compliance_registrations"> | null;
  approvedPhoneNumber: SmsPhoneNumberDoc | null;
}): "platform_phone" | "business_messaging_service" {
  if (
    input.aiSmsCommerciallyEnabled &&
    input.registration &&
    isSmsComplianceApproved(input.registration.status) &&
    input.registration.twilioMessagingServiceSid &&
    input.approvedPhoneNumber &&
    input.approvedPhoneNumber.status === "active" &&
    input.approvedPhoneNumber.smsEnabled
  ) {
    return "business_messaging_service";
  }

  return "platform_phone";
}

function createDefaultDraft(): SmsComplianceDraft {
  return {
    businessRegionsOfOperation: ["USA_AND_CANADA"],
    companyType: "private",
    sampleMessages: [],
    optInKeywords: ["START"],
    optOutKeywords: ["STOP"],
    helpKeywords: ["HELP"],
    hasEmbeddedLinks: false,
    hasEmbeddedPhone: false,
  };
}

function createDefaultRegistration(
  businessId: Id<"businesses">,
): Omit<Doc<"sms_compliance_registrations">, "_id" | "_creationTime"> {
  return {
    businessId,
    status: "not_started",
    customerType: "direct_customer",
    brandKind: "standard_business",
    trafficTier: "low_volume",
    draft: createDefaultDraft(),
  };
}

async function requireSmsComplianceManagementAccess(
  ctx: Pick<QueryCtx, "auth" | "db"> | Pick<MutationCtx, "auth" | "db">,
  businessId: Id<"businesses">,
): Promise<void> {
  const membership = await requireMembership(ctx, businessId);
  requireBillingManagementAccess(membership.role);
}

function canEditComplianceDraft(status: SmsComplianceStatus): boolean {
  return status === "not_started" || status === "collecting_info" || status === "failed";
}

function canUpdateApprovedPhoneNumber(input: {
  status: SmsComplianceStatus;
  currentApprovedPhoneNumber?: SmsPhoneNumberDoc | null;
}): boolean {
  return (
    canEditComplianceDraft(input.status) ||
    input.status === "pending_brand_verification" ||
    (input.status === "approved" &&
      !hasOperationalApprovedPhoneNumber(input.currentApprovedPhoneNumber))
  );
}

export const assertManagementAccess = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);
    return null;
  },
});

export const getStatus = query({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    applicable: v.boolean(),
    aiSmsCommerciallyEnabled: v.boolean(),
    alertsUseBusinessSender: v.boolean(),
    aiSmsReady: v.boolean(),
    setupRequired: v.boolean(),
    senderMode: smsSenderModeValidator,
    status: smsComplianceStatusValidator,
    customerType: smsComplianceCustomerTypeValidator,
    brandKind: smsComplianceBrandKindValidator,
    trafficTier: smsComplianceTrafficTierValidator,
    availablePhoneNumbers: v.array(
      v.object({
        id: v.id("phone_numbers"),
        e164: v.string(),
      }),
    ),
    draft: v.optional(smsComplianceDraftValidator),
    pendingAction: v.optional(smsCompliancePendingActionValidator),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    approvedPhoneNumberId: v.optional(v.id("phone_numbers")),
    approvedPhoneNumberE164: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SmsComplianceStatusView> => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);

    const [snapshot, registration, phoneNumbers] = await Promise.all([
      getBillingSnapshot(ctx, { businessId: args.businessId }),
      getSmsComplianceRegistration(ctx, args.businessId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    const aiSmsCommerciallyEnabled = isAiSmsEnabled({
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
    });
    const applicable = snapshot.plan !== "self_host" && aiSmsCommerciallyEnabled;
    const approvedPhoneNumber =
      registration?.approvedPhoneNumberId !== undefined
        ? phoneNumbers.find((phoneNumber) => phoneNumber._id === registration.approvedPhoneNumberId) ??
          null
        : null;
    const senderMode: SmsSenderMode =
      snapshot.plan === "self_host"
        ? "business_phone"
        : deriveHostedSenderMode({
            aiSmsCommerciallyEnabled,
            registration,
            approvedPhoneNumber,
          });
    const availablePhoneNumbers = getEligibleSmsPhoneNumbers(phoneNumbers).map((phoneNumber) => ({
      id: phoneNumber._id,
      e164: phoneNumber.e164,
    }));

    return {
      applicable,
      aiSmsCommerciallyEnabled,
      alertsUseBusinessSender:
        snapshot.plan === "self_host" || senderMode === "business_messaging_service",
      aiSmsReady:
        snapshot.plan === "self_host" ||
        (applicable && senderMode === "business_messaging_service"),
      setupRequired:
        applicable &&
        (!registration ||
          registration.status === "not_started" ||
          registration.status === "collecting_info" ||
          registration.status === "failed"),
      senderMode,
      status: registration?.status ?? "not_started",
      customerType: registration?.customerType ?? "direct_customer",
      brandKind: registration?.brandKind ?? "standard_business",
      trafficTier: registration?.trafficTier ?? "low_volume",
      availablePhoneNumbers,
      ...(registration?.draft ? { draft: registration.draft } : {}),
      ...(registration?.pendingAction ? { pendingAction: registration.pendingAction } : {}),
      ...(registration?.failureCode ? { failureCode: registration.failureCode } : {}),
      ...(registration?.failureMessage ? { failureMessage: registration.failureMessage } : {}),
      ...(registration?.approvedPhoneNumberId
        ? { approvedPhoneNumberId: registration.approvedPhoneNumberId }
        : {}),
      ...(approvedPhoneNumber ? { approvedPhoneNumberE164: approvedPhoneNumber.e164 } : {}),
      ...(registration?.twilioMessagingServiceSid
        ? { twilioMessagingServiceSid: registration.twilioMessagingServiceSid }
        : {}),
    };
  },
});

export const getCampaignOptions = query({
  args: {},
  returns: v.array(
    v.object({
      value: smsComplianceTrafficTierValidator,
      twilioUsecaseCode: v.string(),
      recommended: v.boolean(),
    }),
  ),
  handler: async () => smsComplianceCampaignOptions,
});

export const saveComplianceForm = mutation({
  args: {
    businessId: v.id("businesses"),
    trafficTier: smsComplianceTrafficTierValidator,
    draft: smsComplianceDraftValidator,
    approvedPhoneNumberId: v.optional(v.id("phone_numbers")),
  },
  returns: v.object({
    registrationId: v.id("sms_compliance_registrations"),
    status: smsComplianceStatusValidator,
  }),
  handler: async (ctx, args): Promise<SmsComplianceActionResult> => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);
    const existingRegistration = await getSmsComplianceRegistration(ctx, args.businessId);
    const currentApprovedPhoneNumber =
      existingRegistration?.approvedPhoneNumberId !== undefined
        ? await ctx.db.get(existingRegistration.approvedPhoneNumberId)
        : null;
    const approvedPhoneNumber =
      args.approvedPhoneNumberId !== undefined
        ? await ctx.db.get(args.approvedPhoneNumberId)
        : null;
    if (
      args.approvedPhoneNumberId !== undefined &&
      (!approvedPhoneNumber ||
        approvedPhoneNumber.businessId !== args.businessId ||
        approvedPhoneNumber.status !== "active" ||
        !approvedPhoneNumber.smsEnabled)
    ) {
      throw new Error(
        "Select an active SMS-enabled business phone number before saving 10DLC registration.",
      );
    }

    if (existingRegistration) {
      if (
        !canUpdateApprovedPhoneNumber({
          status: existingRegistration.status,
          currentApprovedPhoneNumber,
        })
      ) {
        throw new Error(
          "10DLC registration can't be edited after submission starts. Refresh status instead.",
        );
      }
      const nextApprovedPhoneNumberId =
        args.approvedPhoneNumberId ?? existingRegistration.approvedPhoneNumberId;

      if (!canEditComplianceDraft(existingRegistration.status)) {
        const isRecoveringApprovedSender =
          existingRegistration.status === "approved" &&
          !hasOperationalApprovedPhoneNumber(currentApprovedPhoneNumber) &&
          nextApprovedPhoneNumberId !== undefined &&
          nextApprovedPhoneNumberId !== existingRegistration.approvedPhoneNumberId;

        await ctx.db.patch(existingRegistration._id, {
          ...(isRecoveringApprovedSender
            ? {
                status: "pending_review",
                pendingAction: {
                  type: "phone_number_association",
                  message:
                    "Refresh the 10DLC registration to attach the new business phone number to the Messaging Service.",
                },
                failureCode: undefined,
                failureMessage: undefined,
              }
            : {}),
          ...(nextApprovedPhoneNumberId
            ? { approvedPhoneNumberId: nextApprovedPhoneNumberId }
            : {}),
        });

        return {
          registrationId: existingRegistration._id,
          status: isRecoveringApprovedSender ? "pending_review" : existingRegistration.status,
        };
      }

      await ctx.db.patch(existingRegistration._id, {
        draft: args.draft,
        trafficTier: args.trafficTier,
        status: "collecting_info",
        failureCode: undefined,
        failureMessage: undefined,
        pendingAction: undefined,
        ...(nextApprovedPhoneNumberId ? { approvedPhoneNumberId: nextApprovedPhoneNumberId } : {}),
        ...(args.draft.brandContactEmail
          ? { brandContactEmail: args.draft.brandContactEmail.trim() }
          : {}),
      });

      return {
        registrationId: existingRegistration._id,
        status: "collecting_info",
      };
    }

    const registrationId = await ctx.db.insert("sms_compliance_registrations", {
      ...createDefaultRegistration(args.businessId),
      status: "collecting_info",
      draft: args.draft,
      trafficTier: args.trafficTier,
      ...(args.approvedPhoneNumberId
        ? { approvedPhoneNumberId: args.approvedPhoneNumberId }
        : {}),
      ...(args.draft.brandContactEmail
        ? { brandContactEmail: args.draft.brandContactEmail.trim() }
        : {}),
    });

    return {
      registrationId,
      status: "collecting_info",
    };
  },
});

export const beginSubmissionAttempt = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    started: v.boolean(),
    registrationId: v.id("sms_compliance_registrations"),
    submissionId: v.optional(v.id("sms_compliance_submissions")),
    attemptKey: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<BeginSubmissionAttemptResult> => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);

    const [snapshot, existingRegistration, phoneNumbers] = await Promise.all([
      getBillingSnapshot(ctx, { businessId: args.businessId }),
      getSmsComplianceRegistration(ctx, args.businessId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
        .collect(),
    ]);

    if (snapshot.plan === "self_host") {
      throw new Error("Self-hosted workspaces do not use hosted 10DLC registration.");
    }

    const aiSmsCommerciallyEnabled = isAiSmsEnabled({
      plan: snapshot.plan,
      activeAddons: snapshot.activeAddons,
    });
    if (!aiSmsCommerciallyEnabled) {
      throw new Error("Enable AI SMS before starting 10DLC registration.");
    }

    const activePhoneNumber = selectActiveSmsPhoneNumber(
      phoneNumbers,
      existingRegistration?.approvedPhoneNumberId,
    );
    if (!activePhoneNumber) {
      throw new Error(
        getPhoneNumberSelectionError({
          phoneNumbers,
          ...(existingRegistration?.approvedPhoneNumberId
            ? { preferredPhoneNumberId: existingRegistration.approvedPhoneNumberId }
            : {}),
        }),
      );
    }
    if (!activePhoneNumber.twilioPhoneSid) {
      throw new Error(
        "The business phone number must be synced with Twilio before starting 10DLC registration.",
      );
    }

    const registrationId =
      existingRegistration?._id ??
      (await ctx.db.insert("sms_compliance_registrations", {
        ...createDefaultRegistration(args.businessId),
      }));
    const registration =
      existingRegistration ?? (await ctx.db.get(registrationId));
    if (!registration) {
      throw new Error("SMS compliance registration could not be initialized.");
    }
    if (registration.status === "approved") {
      return {
        started: false,
        registrationId,
      };
    }
    if (registration.status === "submitting") {
      return {
        started: false,
        registrationId,
      };
    }

    const completedDraft = assertSmsComplianceDraftReady(registration.draft);
    const startedAt = new Date().toISOString();
    const attemptKey = `sms-compliance:${String(args.businessId)}:${Date.now()}`;
    const submissionId = await ctx.db.insert("sms_compliance_submissions", {
      registrationId,
      businessId: args.businessId,
      attemptKey,
      status: "submitting",
      trafficTier: registration.trafficTier,
      snapshot: {
        trafficTier: registration.trafficTier,
        draft: registration.draft ?? {},
      },
      createdAt: startedAt,
      submittedAt: startedAt,
    });

    await ctx.db.patch(registrationId, {
      status: "submitting",
      lastSubmittedAt: startedAt,
      lastSyncedAt: startedAt,
      failureCode: undefined,
      failureMessage: undefined,
      pendingAction: undefined,
      approvedPhoneNumberId: activePhoneNumber._id,
      ...(completedDraft.brandContactEmail
        ? { brandContactEmail: completedDraft.brandContactEmail }
        : {}),
    });

    return {
      started: true,
      registrationId,
      submissionId,
      attemptKey,
    };
  },
});

export const applySubmissionResult = internalMutation({
  args: {
    registrationId: v.id("sms_compliance_registrations"),
    submissionId: v.optional(v.id("sms_compliance_submissions")),
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
  },
  returns: v.object({
    registrationId: v.id("sms_compliance_registrations"),
    status: smsComplianceStatusValidator,
  }),
  handler: async (ctx, args): Promise<SmsComplianceActionResult> => {
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) {
      throw new Error("SMS compliance registration not found.");
    }

    await ctx.db.patch(args.registrationId, {
      status: args.status,
      ...(args.trafficTier ? { trafficTier: args.trafficTier } : {}),
      ...(args.draft ? { draft: args.draft } : {}),
      ...(args.twilioCustomerProfileSid
        ? { twilioCustomerProfileSid: args.twilioCustomerProfileSid }
        : {}),
      ...(args.twilioBusinessInfoSid ? { twilioBusinessInfoSid: args.twilioBusinessInfoSid } : {}),
      ...(args.twilioAuthorizedRepresentativeSid
        ? { twilioAuthorizedRepresentativeSid: args.twilioAuthorizedRepresentativeSid }
        : {}),
      ...(args.twilioAddressSid ? { twilioAddressSid: args.twilioAddressSid } : {}),
      ...(args.twilioAddressDocumentSid
        ? { twilioAddressDocumentSid: args.twilioAddressDocumentSid }
        : {}),
      ...(args.twilioTrustProductSid ? { twilioTrustProductSid: args.twilioTrustProductSid } : {}),
      ...(args.twilioMessagingProfileSid
        ? { twilioMessagingProfileSid: args.twilioMessagingProfileSid }
        : {}),
      ...(args.twilioBrandRegistrationSid
        ? { twilioBrandRegistrationSid: args.twilioBrandRegistrationSid }
        : {}),
      ...(args.twilioMessagingServiceSid
        ? { twilioMessagingServiceSid: args.twilioMessagingServiceSid }
        : {}),
      ...(args.twilioCampaignSid ? { twilioCampaignSid: args.twilioCampaignSid } : {}),
      ...(args.approvedPhoneNumberId ? { approvedPhoneNumberId: args.approvedPhoneNumberId } : {}),
      ...(args.brandContactEmail ? { brandContactEmail: args.brandContactEmail } : {}),
      ...(args.lastSubmittedAt ? { lastSubmittedAt: args.lastSubmittedAt } : {}),
      lastSyncedAt: args.lastSyncedAt,
      ...(args.failureCode ? { failureCode: args.failureCode } : { failureCode: undefined }),
      ...(args.failureMessage
        ? { failureMessage: args.failureMessage }
        : { failureMessage: undefined }),
      ...(args.pendingAction
        ? { pendingAction: args.pendingAction }
        : { pendingAction: undefined }),
    });

    if (args.submissionId) {
      await ctx.db.patch(args.submissionId, {
        status: args.status,
        completedAt: args.lastSyncedAt,
        resultStatus: args.status,
        ...(args.twilioCustomerProfileSid
          ? { twilioCustomerProfileSid: args.twilioCustomerProfileSid }
          : {}),
        ...(args.twilioTrustProductSid ? { twilioTrustProductSid: args.twilioTrustProductSid } : {}),
        ...(args.twilioBrandRegistrationSid
          ? { twilioBrandRegistrationSid: args.twilioBrandRegistrationSid }
          : {}),
        ...(args.twilioMessagingServiceSid
          ? { twilioMessagingServiceSid: args.twilioMessagingServiceSid }
          : {}),
        ...(args.twilioCampaignSid ? { twilioCampaignSid: args.twilioCampaignSid } : {}),
        ...(args.failureCode ? { failureCode: args.failureCode } : {}),
        ...(args.failureMessage ? { failureMessage: args.failureMessage } : {}),
        ...(args.pendingAction ? { pendingAction: args.pendingAction } : {}),
      });
    }

    return {
      registrationId: args.registrationId,
      status: args.status,
    };
  },
});

export const getTwilioRegistrationContext = internalQuery({
  args: {
    registrationId: v.id("sms_compliance_registrations"),
  },
  handler: async (ctx, args) => {
    const registration = await ctx.db.get(args.registrationId);
    if (!registration) {
      throw new Error("SMS compliance registration not found.");
    }

    const [business, phoneNumbers, submissions] = await Promise.all([
      ctx.db.get(registration.businessId),
      ctx.db
        .query("phone_numbers")
        .withIndex("by_business_id", (q) => q.eq("businessId", registration.businessId))
        .collect(),
      ctx.db
        .query("sms_compliance_submissions")
        .withIndex("by_registration_id", (q) => q.eq("registrationId", args.registrationId))
        .collect(),
    ]);
    if (!business) {
      throw new Error("Business not found for SMS compliance registration.");
    }

    const activePhoneNumber = selectActiveSmsPhoneNumber(
      phoneNumbers,
      registration.approvedPhoneNumberId,
    );
    if (!activePhoneNumber) {
      throw new Error(
        getPhoneNumberSelectionError({
          phoneNumbers,
          ...(registration.approvedPhoneNumberId
            ? { preferredPhoneNumberId: registration.approvedPhoneNumberId }
            : {}),
        }),
      );
    }
    if (!activePhoneNumber.twilioPhoneSid) {
      throw new Error("The approved business phone number is missing a Twilio phone SID.");
    }

    const previousCompletedSubmission = submissions
      .filter((submission) => submission.resultStatus !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    return {
      business,
      registration,
      phoneNumber: activePhoneNumber,
      trafficTier: registration.trafficTier,
      twilioUsecaseCode: getCampaignUsecaseForTrafficTier(registration.trafficTier),
      ...(previousCompletedSubmission ? { previousCompletedSubmission } : {}),
    };
  },
});

async function runA2pSyncAction(
  ctx: ActionCtx,
  input: {
    businessId: Id<"businesses">;
    registrationId: Id<"sms_compliance_registrations">;
    submissionId?: Id<"sms_compliance_submissions">;
    mode: "submit" | "refresh";
  },
): Promise<SmsComplianceActionResult> {
  const result: TwilioSyncResult = await ctx.runAction(
    internal.integrations.twilioA2p.syncRegistration,
    {
    registrationId: input.registrationId,
    mode: input.mode,
    },
  );

  return await ctx.runMutation(internal.smsCompliance.applySubmissionResult, {
    registrationId: input.registrationId,
    ...(input.submissionId ? { submissionId: input.submissionId } : {}),
    status: result.status,
    ...(result.trafficTier ? { trafficTier: result.trafficTier } : {}),
    ...(result.draft ? { draft: result.draft } : {}),
    ...(result.twilioCustomerProfileSid
      ? { twilioCustomerProfileSid: result.twilioCustomerProfileSid }
      : {}),
    ...(result.twilioBusinessInfoSid ? { twilioBusinessInfoSid: result.twilioBusinessInfoSid } : {}),
    ...(result.twilioAuthorizedRepresentativeSid
      ? { twilioAuthorizedRepresentativeSid: result.twilioAuthorizedRepresentativeSid }
      : {}),
    ...(result.twilioAddressSid ? { twilioAddressSid: result.twilioAddressSid } : {}),
    ...(result.twilioAddressDocumentSid
      ? { twilioAddressDocumentSid: result.twilioAddressDocumentSid }
      : {}),
    ...(result.twilioTrustProductSid ? { twilioTrustProductSid: result.twilioTrustProductSid } : {}),
    ...(result.twilioMessagingProfileSid
      ? { twilioMessagingProfileSid: result.twilioMessagingProfileSid }
      : {}),
    ...(result.twilioBrandRegistrationSid
      ? { twilioBrandRegistrationSid: result.twilioBrandRegistrationSid }
      : {}),
    ...(result.twilioMessagingServiceSid
      ? { twilioMessagingServiceSid: result.twilioMessagingServiceSid }
      : {}),
    ...(result.twilioCampaignSid ? { twilioCampaignSid: result.twilioCampaignSid } : {}),
    ...(result.approvedPhoneNumberId ? { approvedPhoneNumberId: result.approvedPhoneNumberId } : {}),
    ...(result.brandContactEmail ? { brandContactEmail: result.brandContactEmail } : {}),
    ...(result.lastSubmittedAt ? { lastSubmittedAt: result.lastSubmittedAt } : {}),
    lastSyncedAt: result.lastSyncedAt,
    ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    ...(result.failureMessage ? { failureMessage: result.failureMessage } : {}),
    ...(result.pendingAction ? { pendingAction: result.pendingAction } : {}),
  });
}

async function handleA2pSyncFailure(
  ctx: ActionCtx,
  input: {
    registrationId: Id<"sms_compliance_registrations">;
    submissionId?: Id<"sms_compliance_submissions">;
    error: unknown;
  },
): Promise<SmsComplianceActionResult> {
  const message =
    input.error instanceof Error ? input.error.message : "SMS compliance registration failed.";

  return await ctx.runMutation(internal.smsCompliance.applySubmissionResult, {
    registrationId: input.registrationId,
    ...(input.submissionId ? { submissionId: input.submissionId } : {}),
    status: "failed",
    lastSyncedAt: new Date().toISOString(),
    failureCode: "twilio_sync_failed",
    failureMessage: message,
    pendingAction: {
      type: "manual_review",
      message,
    },
  });
}

export const startRegistration = action({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    registrationId: v.id("sms_compliance_registrations"),
    status: smsComplianceStatusValidator,
  }),
  handler: async (ctx, args): Promise<SmsComplianceActionResult> => {
    await ctx.runQuery(internal.smsCompliance.assertManagementAccess, {
      businessId: args.businessId,
    });
    const attempt: BeginSubmissionAttemptResult = await ctx.runMutation(
      internal.smsCompliance.beginSubmissionAttempt,
      {
      businessId: args.businessId,
      },
    );

    if (!attempt.started || !attempt.submissionId) {
      const registrationStatus = await ctx.runQuery(
        internal.smsCompliance.getRegistrationStatusForBusiness,
        {
          businessId: args.businessId,
        },
      );
      return {
        registrationId: attempt.registrationId,
        status: registrationStatus,
      };
    }

    try {
      return await runA2pSyncAction(ctx, {
        businessId: args.businessId,
        registrationId: attempt.registrationId,
        submissionId: attempt.submissionId,
        mode: "submit",
      });
    } catch (error) {
      return await handleA2pSyncFailure(ctx, {
        registrationId: attempt.registrationId,
        submissionId: attempt.submissionId,
        error,
      });
    }
  },
});

export const resumeRegistration = action({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    registrationId: v.id("sms_compliance_registrations"),
    status: smsComplianceStatusValidator,
  }),
  handler: async (ctx, args): Promise<SmsComplianceActionResult> => {
    await ctx.runQuery(internal.smsCompliance.assertManagementAccess, {
      businessId: args.businessId,
    });
    const attempt: BeginSubmissionAttemptResult = await ctx.runMutation(
      internal.smsCompliance.beginSubmissionAttempt,
      {
      businessId: args.businessId,
      },
    );

    if (!attempt.started || !attempt.submissionId) {
      const registrationStatus = await ctx.runQuery(
        internal.smsCompliance.getRegistrationStatusForBusiness,
        {
          businessId: args.businessId,
        },
      );
      return {
        registrationId: attempt.registrationId,
        status: registrationStatus,
      };
    }

    try {
      return await runA2pSyncAction(ctx, {
        businessId: args.businessId,
        registrationId: attempt.registrationId,
        submissionId: attempt.submissionId,
        mode: "submit",
      });
    } catch (error) {
      return await handleA2pSyncFailure(ctx, {
        registrationId: attempt.registrationId,
        submissionId: attempt.submissionId,
        error,
      });
    }
  },
});

export const refreshStatus = action({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.object({
    registrationId: v.id("sms_compliance_registrations"),
    status: smsComplianceStatusValidator,
  }),
  handler: async (ctx, args): Promise<SmsComplianceActionResult> => {
    await ctx.runQuery(internal.smsCompliance.assertManagementAccess, {
      businessId: args.businessId,
    });
    const currentRegistration: Id<"sms_compliance_registrations"> | null = await ctx.runQuery(
      internal.smsCompliance.getRegistrationIdForBusiness,
      {
        businessId: args.businessId,
      },
    );
    if (!currentRegistration) {
      throw new Error("SMS compliance registration has not been started for this workspace.");
    }

    try {
      return await runA2pSyncAction(ctx, {
        businessId: args.businessId,
        registrationId: currentRegistration,
        mode: "refresh",
      });
    } catch (error) {
      const persistedStatus: SmsComplianceStatus = await ctx.runQuery(
        internal.smsCompliance.getRegistrationStatusForBusiness,
        {
          businessId: args.businessId,
        },
      );
      if (
        isSmsComplianceApproved(persistedStatus) ||
        persistedStatus === "suspended"
      ) {
        return {
          registrationId: currentRegistration,
          status: persistedStatus,
        };
      }

      return await handleA2pSyncFailure(ctx, {
        registrationId: currentRegistration,
        error,
      });
    }
  },
});

export const getRegistrationIdForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.union(v.id("sms_compliance_registrations"), v.null()),
  handler: async (ctx, args) => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);
    const registration = await getSmsComplianceRegistration(ctx, args.businessId);
    return registration?._id ?? null;
  },
});

export const getRegistrationStatusForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  returns: smsComplianceStatusValidator,
  handler: async (ctx, args): Promise<SmsComplianceStatus> => {
    await requireSmsComplianceManagementAccess(ctx, args.businessId);
    const registration = await getSmsComplianceRegistration(ctx, args.businessId);
    return registration?.status ?? "not_started";
  },
});
