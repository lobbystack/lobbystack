import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  runtimeLocaleSourceValidator,
  runtimeLocaleValidator,
} from "./lib/runtimeLocale";
import { appointmentChangePolicyValidator } from "./lib/appointmentChangePolicy";
import {
  smsComplianceBrandKindValidator,
  smsComplianceCustomerTypeValidator,
  smsComplianceDraftValidator,
  smsCompliancePendingActionValidator,
  smsComplianceStatusValidator,
  smsComplianceSubmissionSnapshotValidator,
  smsComplianceTrafficTierValidator,
} from "./lib/smsCompliance";
import { knowledgeSectionValidator } from "./lib/knowledgeSections";
import { localizedServiceNamesValidator } from "./lib/serviceNames";
import {
  operatorNotificationChannelValidator,
  operatorNotificationEventKindValidator,
  operatorNotificationEventPreferencesValidator,
} from "./lib/operatorNotificationPreferences";
import {
  smsConsentActionValidator,
  smsConsentRecipientTypeValidator,
  smsConsentStateScopeValidator,
  smsConsentStateStatusValidator,
} from "./lib/smsConsent";

const serviceSummaryValidator = v.object({
  id: v.string(),
  name: v.string(),
  localizedNames: v.optional(localizedServiceNamesValidator),
  durationMinutes: v.number(),
  description: v.optional(v.string()),
});

const snippetValidator = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  tags: v.array(v.string()),
  priority: v.number(),
});

const hoursWindowValidator = v.object({
  dayOfWeek: v.number(),
  openMinutes: v.number(),
  closeMinutes: v.number(),
});

const closureWindowValidator = v.object({
  startsAt: v.string(),
  endsAt: v.string(),
  reason: v.string(),
});

const messageMediaValidator = v.object({
  url: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")),
  fileName: v.optional(v.string()),
  contentType: v.optional(v.string()),
  byteLength: v.optional(v.number()),
  previewUrl: v.optional(v.string()),
  previewStorageId: v.optional(v.id("_storage")),
  previewFileName: v.optional(v.string()),
  previewContentType: v.optional(v.string()),
  previewByteLength: v.optional(v.number()),
  deliveryMode: v.optional(v.string()),
});

const retentionStatusValidator = v.union(v.literal("active"), v.literal("expired"));
const setupGuideStepIdValidator = v.union(
  v.literal("website"),
  v.literal("sources"),
  v.literal("calendar"),
  v.literal("services"),
  v.literal("rules"),
);

const conversationSessionSummaryKindValidator = v.union(
  v.literal("booked"),
  v.literal("booking_in_progress"),
  v.literal("message_taking"),
  v.literal("summary"),
  v.literal("disposition"),
);

const conversationSessionSummaryValidator = v.object({
  kind: conversationSessionSummaryKindValidator,
  serviceName: v.optional(v.string()),
  startsAt: v.optional(v.string()),
  summary: v.optional(v.string()),
  disposition: v.optional(v.string()),
});

const billingPlanSlugValidator = v.union(
  v.literal("self_host"),
  v.literal("free_cloud"),
  v.literal("starter"),
  v.literal("pro"),
  v.literal("enterprise"),
);

const billingIntervalValidator = v.union(v.literal("monthly"), v.literal("annual"));

const billingAddonSlugValidator = v.union(v.literal("ai_sms"));

const billingUsageKindValidator = v.union(
  v.literal("voice_seconds"),
  v.literal("alert_sms_segments"),
  v.literal("outbound_call_attempts"),
  v.literal("ai_sms_segments"),
);

const smsSenderRoleValidator = v.union(
  v.literal("platform_alert"),
  v.literal("business_ai"),
);

const unitEconomicsEventKindValidator = v.union(
  v.literal("voice_provider"),
  v.literal("sms_provider"),
  v.literal("notification_provider"),
  v.literal("sms_ai"),
  v.literal("voice_ai"),
  v.literal("dashboard_ai"),
  v.literal("infra_allocation"),
);

const unitEconomicsChannelValidator = v.union(
  v.literal("voice"),
  v.literal("sms"),
  v.literal("platform"),
  v.literal("dashboard"),
);

const unitEconomicsQuantityUnitValidator = v.union(
  v.literal("call"),
  v.literal("minute"),
  v.literal("message"),
  v.literal("segment"),
  v.literal("thread"),
  v.literal("generation"),
  v.literal("business"),
  v.literal("user"),
);

const feedbackEmailStatusValidator = v.union(
  v.literal("pending_email"),
  v.literal("email_sent"),
  v.literal("email_failed"),
);

export default defineSchema({
  ...authTables,
  users: defineTable({
    // Keep this optional for older internal lookups while Convex Auth
    // continues to own the canonical user document lifecycle.
    authSubject: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    displayName: v.optional(v.string()),
    activeBusinessId: v.optional(v.id("businesses")),
    platformRole: v.optional(v.string()),
    preferredLocale: v.optional(runtimeLocaleValidator),
    signupAttribution: v.optional(v.string()),
  })
    .index("by_auth_subject", ["authSubject"])
    .index("email", ["email"])
    .index("phone", ["phone"]),

  pending_email_changes: defineTable({
    accountId: v.id("authAccounts"),
    codeHash: v.string(),
    email: v.string(),
    expirationTime: v.number(),
  })
    .index("by_account_id", ["accountId"])
    .index("by_code_hash", ["codeHash"]),

  auth_email_claims: defineTable({
    provider: v.string(),
    normalizedEmail: v.string(),
    accountId: v.id("authAccounts"),
    userId: v.id("users"),
  })
    .index("by_provider_and_normalized_email", ["provider", "normalizedEmail"])
    .index("by_account_id", ["accountId"])
    .index("by_user_id", ["userId"]),

  user_email_claims: defineTable({
    normalizedEmail: v.string(),
    userId: v.id("users"),
  })
    .index("by_normalized_email", ["normalizedEmail"])
    .index("by_user_id", ["userId"]),

  auth_email_claim_backfill_state: defineTable({
    key: v.string(),
    completedAt: v.number(),
  }).index("by_key", ["key"]),

  businesses: defineTable({
    slug: v.string(),
    name: v.string(),
    timezone: v.string(),
    defaultLocale: v.optional(runtimeLocaleValidator),
    websiteUrl: v.optional(v.string()),
    onboardingStage: v.optional(v.string()),
    setupGuideSkippedSteps: v.optional(v.array(setupGuideStepIdValidator)),
    businessType: v.string(),
    deploymentMode: v.string(),
    status: v.string(),
    phoneNumberReplacementReservedAt: v.optional(v.string()),
    phoneNumberReplacementUsedAt: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  business_memberships: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    role: v.string(),
    status: v.string(),
  })
    .index("by_user_id_and_business_id", ["userId", "businessId"])
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_role", ["businessId", "role"]),

  business_invitations: defineTable({
    businessId: v.id("businesses"),
    email: v.string(),
    role: v.string(),
    status: v.string(),
    tokenHash: v.string(),
    expirationTime: v.number(),
    invitedByUserId: v.id("users"),
    invitedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.id("users")),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_email", ["businessId", "email"])
    .index("by_token_hash", ["tokenHash"]),

  feedback_submissions: defineTable({
    userId: v.id("users"),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    businessId: v.optional(v.id("businesses")),
    businessName: v.optional(v.string()),
    message: v.string(),
    pagePath: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    emailStatus: feedbackEmailStatusValidator,
    recipientEmail: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    emailError: v.optional(v.string()),
    submittedAt: v.string(),
    emailedAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index("by_business_id_and_submitted_at", ["businessId", "submittedAt"])
    .index("by_user_id_and_submitted_at", ["userId", "submittedAt"])
    .index("by_email_status_and_submitted_at", ["emailStatus", "submittedAt"]),

  staff: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    timezone: v.string(),
    active: v.boolean(),
    transferNumber: v.optional(v.string()),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_active", ["businessId", "active"]),

  services: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    localizedNames: v.optional(localizedServiceNamesValidator),
    slug: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.number(),
    active: v.boolean(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_slug", ["businessId", "slug"]),

  staff_service_assignments: defineTable({
    businessId: v.id("businesses"),
    staffId: v.id("staff"),
    serviceId: v.id("services"),
  })
    .index("by_business_id", ["businessId"])
    .index("by_staff_id_and_service_id", ["staffId", "serviceId"])
    .index("by_service_id_and_staff_id", ["serviceId", "staffId"]),

  business_hours: defineTable({
    businessId: v.id("businesses"),
    dayOfWeek: v.number(),
    openMinutes: v.number(),
    closeMinutes: v.number(),
  }).index("by_business_id_and_day_of_week", ["businessId", "dayOfWeek"]),

  closures: defineTable({
    businessId: v.id("businesses"),
    startsAt: v.string(),
    endsAt: v.string(),
    reason: v.string(),
  }).index("by_business_id_and_starts_at", ["businessId", "startsAt"]),

  phone_numbers: defineTable({
    businessId: v.id("businesses"),
    e164: v.string(),
    twilioPhoneSid: v.optional(v.string()),
    voiceEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    status: v.string(),
    voiceWebhookStatus: v.optional(v.string()),
    voiceWebhookTargetUrl: v.optional(v.string()),
    voiceWebhookLastSyncedAt: v.optional(v.string()),
    voiceWebhookLastError: v.optional(v.string()),
    smsWebhookStatus: v.optional(v.string()),
    smsWebhookTargetUrl: v.optional(v.string()),
    smsWebhookLastSyncedAt: v.optional(v.string()),
    smsWebhookLastError: v.optional(v.string()),
  })
    .index("by_e164", ["e164"])
    .index("by_twilio_phone_sid", ["twilioPhoneSid"])
    .index("by_business_id", ["businessId"]),

  platform_sms_senders: defineTable({
    role: v.literal("platform_alert"),
    label: v.string(),
    e164: v.string(),
    twilioPhoneSid: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
    status: v.string(),
    smsEnabled: v.boolean(),
    compliantDestinationCountries: v.optional(v.array(v.string())),
  })
    .index("by_role", ["role"])
    .index("by_e164", ["e164"]),

  sms_compliance_registrations: defineTable({
    businessId: v.id("businesses"),
    status: smsComplianceStatusValidator,
    customerType: smsComplianceCustomerTypeValidator,
    brandKind: smsComplianceBrandKindValidator,
    trafficTier: smsComplianceTrafficTierValidator,
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
    lastSyncedAt: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    pendingAction: v.optional(smsCompliancePendingActionValidator),
  })
    .index("by_business_id", ["businessId"])
    .index("by_status", ["status"]),

  sms_compliance_submissions: defineTable({
    registrationId: v.id("sms_compliance_registrations"),
    businessId: v.id("businesses"),
    attemptKey: v.string(),
    status: smsComplianceStatusValidator,
    trafficTier: smsComplianceTrafficTierValidator,
    snapshot: smsComplianceSubmissionSnapshotValidator,
    createdAt: v.string(),
    submittedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    resultStatus: v.optional(smsComplianceStatusValidator),
    twilioCustomerProfileSid: v.optional(v.string()),
    twilioTrustProductSid: v.optional(v.string()),
    twilioBrandRegistrationSid: v.optional(v.string()),
    twilioMessagingServiceSid: v.optional(v.string()),
    twilioCampaignSid: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    pendingAction: v.optional(smsCompliancePendingActionValidator),
  })
    .index("by_registration_id", ["registrationId"])
    .index("by_business_id", ["businessId"])
    .index("by_attempt_key", ["attemptKey"]),

  onboarding_phone_verifications: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    phoneE164: v.string(),
    countryCode: v.string(),
    lineType: v.optional(v.string()),
    verificationSid: v.string(),
    status: v.string(),
    startedAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_business_id_and_user_id", ["businessId", "userId"])
    .index("by_verification_sid", ["verificationSid"])
    .index("by_phone_e164", ["phoneE164"]),

  onboarding_number_claim_events: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    phoneNumberId: v.optional(v.id("phone_numbers")),
    twilioPhoneSid: v.optional(v.string()),
    status: v.optional(v.union(v.literal("reserved"), v.literal("claimed"))),
    purchasedAt: v.number(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_user_id_and_purchased_at", ["userId", "purchasedAt"]),

  receptionist_profiles: defineTable({
    businessId: v.id("businesses"),
    greeting: v.string(),
    tone: v.string(),
    summary: v.string(),
    bookingPolicy: v.string(),
    voiceInstructions: v.optional(v.string()),
    smsInstructions: v.optional(v.string()),
    transferMode: v.string(),
    transferNumber: v.optional(v.string()),
    appointmentChangePolicy: v.optional(appointmentChangePolicyValidator),
  }).index("by_business_id", ["businessId"]),

  website_ingestion_jobs: defineTable({
    businessId: v.id("businesses"),
    websiteUrl: v.string(),
    provider: v.string(),
    status: v.string(),
    workflowId: v.optional(v.string()),
    providerJobId: v.optional(v.string()),
    firecrawlScrapeJobs: v.optional(
      v.array(
        v.object({
          url: v.string(),
          jobId: v.string(),
        }),
      ),
    ),
    crawlMode: v.string(),
    fallbackTriggered: v.boolean(),
    pageLimit: v.number(),
    depth: v.number(),
    importedCount: v.number(),
    indexedCount: v.number(),
    errorCount: v.number(),
    crawlFinishedCount: v.optional(v.number()),
    crawlTotalCount: v.optional(v.number()),
    lastProgressAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_website_url", ["businessId", "websiteUrl"]),

  knowledge_documents: defineTable({
    businessId: v.id("businesses"),
    section: v.optional(knowledgeSectionValidator),
    active: v.optional(v.boolean()),
    sourceType: v.string(),
    title: v.string(),
    sourceUrl: v.optional(v.string()),
    websiteIngestionJobId: v.optional(v.id("website_ingestion_jobs")),
    storageId: v.optional(v.id("_storage")),
    extractedTextStorageId: v.optional(v.id("_storage")),
    mimeType: v.optional(v.string()),
    textContent: v.optional(v.string()),
    status: v.string(),
    processingProgress: v.optional(v.number()),
    tags: v.array(v.string()),
    importance: v.number(),
    contentHash: v.optional(v.string()),
    lastIndexedAt: v.optional(v.string()),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_source_type", ["businessId", "sourceType"])
    .index("by_business_id_and_source_url", ["businessId", "sourceUrl"])
    .index("by_website_ingestion_job_id", ["websiteIngestionJobId"]),

  knowledge_snippets: defineTable({
    businessId: v.id("businesses"),
    section: v.optional(knowledgeSectionValidator),
    title: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    priority: v.number(),
    active: v.boolean(),
    lastIndexedAt: v.optional(v.string()),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_business_id_and_active", ["businessId", "active"]),

  business_context_snapshots: defineTable({
    businessId: v.id("businesses"),
    version: v.string(),
    generatedAt: v.string(),
    displayName: v.string(),
    legalName: v.optional(v.string()),
    timezone: v.string(),
    defaultLocale: v.optional(runtimeLocaleValidator),
    businessType: v.string(),
    greeting: v.string(),
    voiceInstructions: v.string(),
    smsInstructions: v.string(),
    summary: v.string(),
    bookingPolicy: v.string(),
    knowledgeDigest: v.string(),
    transferPolicy: v.object({
      mode: v.string(),
      transferNumber: v.optional(v.string()),
    }),
    appointmentChangePolicy: v.optional(appointmentChangePolicyValidator),
    hours: v.array(hoursWindowValidator),
    closures: v.array(closureWindowValidator),
    services: v.array(serviceSummaryValidator),
    knowledgeSnippets: v.optional(v.array(snippetValidator)),
    contactChannels: v.object({
      phoneNumber: v.optional(v.string()),
      smsNumber: v.optional(v.string()),
      email: v.optional(v.string()),
    }),
  }).index("by_business_id", ["businessId"]),

  contacts: defineTable({
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    phone: v.string(),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    preferredLocale: v.optional(runtimeLocaleValidator),
    smsConsentStatus: v.optional(v.string()),
    smsConsentUpdatedAt: v.optional(v.string()),
    smsConsentSource: v.optional(v.string()),
    operatorBlockedAt: v.optional(v.string()),
    operatorBlockedByUserId: v.optional(v.id("users")),
  })
    .index("by_business_id_and_phone", ["businessId", "phone"])
    .index("by_business_id_and_email", ["businessId", "email"]),

  sms_consent_events: defineTable({
    businessId: v.optional(v.id("businesses")),
    contactId: v.optional(v.id("contacts")),
    userId: v.optional(v.id("users")),
    appointmentId: v.optional(v.id("appointments")),
    recipientType: smsConsentRecipientTypeValidator,
    phone: v.string(),
    action: smsConsentActionValidator,
    source: v.string(),
    disclosureVersion: v.optional(v.string()),
    disclosureText: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_phone_and_created_at", ["phone", "createdAt"])
    .index("by_business_id_and_created_at", ["businessId", "createdAt"])
    .index("by_contact_id_and_created_at", ["contactId", "createdAt"])
    .index("by_user_id_and_created_at", ["userId", "createdAt"]),

  sms_consent_states: defineTable({
    scope: smsConsentStateScopeValidator,
    phone: v.string(),
    status: smsConsentStateStatusValidator,
    source: v.string(),
    updatedAt: v.string(),
  }).index("by_scope_and_phone", ["scope", "phone"]),

  conversations: defineTable({
    businessId: v.id("businesses"),
    contactId: v.optional(v.id("contacts")),
    channel: v.string(),
    status: v.string(),
    automationState: v.optional(
      v.union(v.literal("ai_active"), v.literal("human_handoff")),
    ),
    automationPausedAt: v.optional(v.string()),
    automationPausedByUserId: v.optional(v.id("users")),
    summary: v.optional(v.string()),
    currentIntent: v.optional(v.string()),
    locale: v.optional(runtimeLocaleValidator),
    localeSource: v.optional(runtimeLocaleSourceValidator),
  })
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_channel", ["businessId", "channel"])
    .index("by_business_id_and_contact_id", ["businessId", "contactId"])
    .index("by_business_id_and_contact_id_and_channel_and_status", [
      "businessId",
      "contactId",
      "channel",
      "status",
    ]),

  conversation_ai_state: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    threadId: v.string(),
    lastSummaryAt: v.optional(v.string()),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_thread_id", ["threadId"]),

  conversation_booking_state: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    mode: v.optional(v.string()),
    selectedServiceId: v.optional(v.id("services")),
    requestedDate: v.optional(v.string()),
    preferredHour24: v.optional(v.number()),
    preferredMinute: v.optional(v.number()),
    lastOfferedDate: v.optional(v.string()),
    lastOfferedStartsAt: v.optional(v.array(v.string())),
    pendingStartsAt: v.optional(v.string()),
    pendingConfirmationAppointmentId: v.optional(v.id("appointments")),
    lastConfirmedAppointmentId: v.optional(v.id("appointments")),
    lastConfirmedServiceId: v.optional(v.id("services")),
    lastConfirmedStartsAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_conversation_id", ["conversationId"]),

  appointment_change_verifications: defineTable({
    businessId: v.id("businesses"),
    appointmentId: v.id("appointments"),
    contactId: v.id("contacts"),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
    channel: v.string(),
    callerPhone: v.string(),
    verificationMode: v.string(),
    status: v.string(),
    otpPhone: v.optional(v.string()),
    verificationSid: v.optional(v.string()),
    verifiedAt: v.optional(v.string()),
    expiresAt: v.string(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_appointment_id", ["appointmentId"])
    .index("by_call_id", ["callId"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_business_id_and_caller_phone", ["businessId", "callerPhone"]),

  appointment_change_audit_logs: defineTable({
    businessId: v.id("businesses"),
    appointmentId: v.id("appointments"),
    contactId: v.id("contacts"),
    verificationId: v.optional(v.id("appointment_change_verifications")),
    action: v.string(),
    channel: v.string(),
    callerPhone: v.string(),
    verificationMode: v.string(),
    status: v.string(),
    oldStatus: v.optional(v.string()),
    oldStartsAt: v.optional(v.string()),
    oldEndsAt: v.optional(v.string()),
    oldStaffId: v.optional(v.id("staff")),
    newStatus: v.optional(v.string()),
    newStartsAt: v.optional(v.string()),
    newEndsAt: v.optional(v.string()),
    newStaffId: v.optional(v.id("staff")),
    payload: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_business_id_and_created_at", ["businessId", "createdAt"])
    .index("by_appointment_id_and_created_at", ["appointmentId", "createdAt"]),

  messages: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    conversationSessionId: v.optional(v.id("conversation_sessions")),
    direction: v.string(),
    channel: v.string(),
    fromPhoneNumber: v.optional(v.string()),
    appointmentId: v.optional(v.id("appointments")),
    providerMessageSid: v.optional(v.string()),
    media: v.optional(v.array(messageMediaValidator)),
    body: v.string(),
    status: v.string(),
    providerStatus: v.optional(v.string()),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerNumSegments: v.optional(v.number()),
    providerErrorCode: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    providerRawDlrDoneDate: v.optional(v.string()),
    senderRole: v.optional(smsSenderRoleValidator),
    aiGenerated: v.boolean(),
    contentRetentionStatus: v.optional(retentionStatusValidator),
    contentExpiresAt: v.optional(v.string()),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_provider_updated_at", ["businessId", "providerUpdatedAt"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_conversation_session_id", ["conversationSessionId"])
    .index("by_provider_message_sid", ["providerMessageSid"])
    .index("by_content_retention_status_and_content_expires_at", [
      "contentRetentionStatus",
      "contentExpiresAt",
    ]),

  conversation_sessions: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    channel: v.string(),
    callId: v.optional(v.id("calls")),
    status: v.string(),
    startedAt: v.number(),
    lastMessageAt: v.number(),
    closedAt: v.optional(v.number()),
    summaryGeneratedAt: v.optional(v.number()),
    summaryKind: v.optional(conversationSessionSummaryKindValidator),
    summary: v.optional(conversationSessionSummaryValidator),
  })
    .index("by_conversation_id_and_started_at", ["conversationId", "startedAt"])
    .index("by_conversation_id_and_status", ["conversationId", "status"])
    .index("by_call_id", ["callId"]),

  message_attachment_uploads: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    uploaderUserId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    byteLength: v.number(),
    previewStorageId: v.optional(v.id("_storage")),
    previewFileName: v.optional(v.string()),
    previewContentType: v.optional(v.string()),
    previewByteLength: v.optional(v.number()),
    deliveryMode: v.string(),
    status: v.string(),
    expiresAt: v.optional(v.string()),
    sentMessageId: v.optional(v.id("messages")),
  })
    .index("by_business_id_and_conversation_id", ["businessId", "conversationId"])
    .index("by_uploader_user_id_and_conversation_id", ["uploaderUserId", "conversationId"])
    .index("by_status_and_expires_at", ["status", "expiresAt"])
    .index("by_sent_message_id", ["sentMessageId"]),

  message_attachment_download_tokens: defineTable({
    businessId: v.id("businesses"),
    messageId: v.id("messages"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    disposition: v.string(),
    nonce: v.string(),
    expiresAt: v.string(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expires_at", ["expiresAt"])
    .index("by_message_id", ["messageId"]),

  call_recording_download_tokens: defineTable({
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    nonce: v.string(),
    expiresAt: v.string(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expires_at", ["expiresAt"])
    .index("by_call_id", ["callId"]),

  calls: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.optional(v.id("conversations")),
    contactId: v.optional(v.id("contacts")),
    twilioCallSid: v.optional(v.string()),
    provider: v.optional(v.string()),
    providerCallId: v.optional(v.string()),
    transport: v.optional(v.string()),
    originUrl: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    widgetId: v.optional(v.string()),
    gatewaySessionId: v.optional(v.string()),
    webCallMaxDurationMs: v.optional(v.number()),
    status: v.string(),
    transferState: v.optional(v.string()),
    disposition: v.optional(v.string()),
    providerCallStatus: v.optional(v.string()),
    providerCallStatusSequence: v.optional(v.number()),
    providerCallStatusSource: v.optional(v.string()),
    providerCallDurationSeconds: v.optional(v.number()),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerUpdatedAt: v.optional(v.string()),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    recordingStorageId: v.optional(v.id("_storage")),
    recordingContentType: v.optional(v.string()),
    recordingByteLength: v.optional(v.number()),
    recordingDurationMs: v.optional(v.number()),
    recordingRetentionStatus: v.optional(retentionStatusValidator),
    recordingExpiresAt: v.optional(v.string()),
  })
    .index("by_twilio_call_sid", ["twilioCallSid"])
    .index("by_provider_and_provider_call_id", ["provider", "providerCallId"])
    .index("by_gateway_session_id", ["gatewaySessionId"])
    .index("by_business_id_and_started_at", ["businessId", "startedAt"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_recording_retention_status_and_recording_expires_at", [
      "recordingRetentionStatus",
      "recordingExpiresAt",
    ]),

  transcripts: defineTable({
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    sequence: v.number(),
    speaker: v.string(),
    text: v.string(),
    confidence: v.optional(v.number()),
    final: v.boolean(),
    expiresAt: v.optional(v.string()),
  })
    .index("by_call_id_and_sequence", ["callId", "sequence"])
    .index("by_expires_at", ["expiresAt"]),

  appointments: defineTable({
    businessId: v.id("businesses"),
    contactId: v.id("contacts"),
    staffId: v.id("staff"),
    serviceId: v.id("services"),
    startsAt: v.string(),
    endsAt: v.string(),
    timezone: v.string(),
    status: v.string(),
    sourceChannel: v.string(),
    calendarSyncState: v.union(
      v.literal("not_required"),
      v.literal("pending"),
      v.literal("syncing"),
      v.literal("synced"),
      v.literal("failed"),
      v.literal("drifted"),
      v.literal("synced_mock"),
    ),
    calendarLastSyncAttemptAt: v.optional(v.string()),
    calendarLastSyncedAt: v.optional(v.string()),
    calendarLastSyncError: v.optional(v.string()),
    calendarReconcileAfter: v.optional(v.string()),
    calendarSyncIssueId: v.optional(v.id("inbox_items")),
    calendarExternalEventId: v.optional(v.string()),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_starts_at", ["businessId", "startsAt"])
    .index("by_business_id_and_calendar_sync_state_and_starts_at", [
      "businessId",
      "calendarSyncState",
      "startsAt",
    ])
    .index("by_staff_id_and_starts_at", ["staffId", "startsAt"])
    .index("by_contact_id_and_starts_at", ["contactId", "startsAt"]),

  calendar_connections: defineTable({
    businessId: v.id("businesses"),
    provider: v.string(),
    ownerUserId: v.id("users"),
    staffId: v.optional(v.id("staff")),
    externalAccountId: v.string(),
    externalAccountEmail: v.optional(v.string()),
    selectedCalendarId: v.optional(v.string()),
    selectedCalendarSummary: v.optional(v.string()),
    status: v.string(),
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.string()),
    syncCursor: v.optional(v.string()),
    syncWindowStartsAt: v.optional(v.string()),
    lastSyncAttemptAt: v.optional(v.string()),
    lastSyncedAt: v.optional(v.string()),
    lastSyncError: v.optional(v.string()),
  })
    .index("by_business_id_and_provider", ["businessId", "provider"])
    .index("by_business_id_and_provider_and_staff_id", [
      "businessId",
      "provider",
      "staffId",
    ])
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_owner_user_id_and_provider", ["ownerUserId", "provider"])
    .index("by_provider_and_external_account_id", ["provider", "externalAccountId"]),

  calendar_busy_blocks: defineTable({
    businessId: v.id("businesses"),
    staffId: v.optional(v.id("staff")),
    connectionId: v.id("calendar_connections"),
    startsAt: v.string(),
    endsAt: v.string(),
    externalEventId: v.optional(v.string()),
    sourceCalendarId: v.optional(v.string()),
    externalUpdatedAt: v.optional(v.string()),
  })
    .index("by_staff_id_and_starts_at", ["staffId", "startsAt"])
    .index("by_business_id_and_starts_at", ["businessId", "startsAt"])
    .index("by_connection_id_and_starts_at", ["connectionId", "startsAt"])
    .index("by_connection_id_and_external_event_id", [
      "connectionId",
      "externalEventId",
    ]),

  calendar_oauth_states: defineTable({
    provider: v.string(),
    businessId: v.id("businesses"),
    userId: v.id("users"),
    staffId: v.id("staff"),
    nonce: v.string(),
    expiresAt: v.string(),
  })
    .index("by_nonce", ["nonce"])
    .index("by_expires_at", ["expiresAt"]),

  notifications: defineTable({
    businessId: v.id("businesses"),
    channel: v.string(),
    kind: v.string(),
    relatedId: v.optional(v.string()),
    scheduledFor: v.string(),
    status: v.string(),
    senderRole: v.optional(smsSenderRoleValidator),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerNumSegments: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerErrorCode: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    providerRawDlrDoneDate: v.optional(v.string()),
  })
    .index("by_business_id", ["businessId"])
    .index("by_business_id_and_scheduled_for", ["businessId", "scheduledFor"])
    .index("by_business_id_and_provider_updated_at", ["businessId", "providerUpdatedAt"])
    .index("by_kind_and_related_id", ["kind", "relatedId"])
    .index("by_status_and_scheduled_for", ["status", "scheduledFor"])
    .index("by_provider_message_id", ["providerMessageId"]),

  operator_notification_preferences: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    emailEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    eventPreferences: operatorNotificationEventPreferencesValidator,
    dailySummaryEnabled: v.optional(v.boolean()),
    dailySummarySendTime: v.optional(v.string()),
    smsConsentGrantedAt: v.optional(v.string()),
    smsConsentRevokedAt: v.optional(v.string()),
    smsConsentSource: v.optional(v.string()),
    smsConsentDisclosureVersion: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index("by_business_id_and_user_id", ["businessId", "userId"])
    .index("by_user_id_and_business_id", ["userId", "businessId"]),

  operator_notification_deliveries: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    eventKind: operatorNotificationEventKindValidator,
    eventKey: v.string(),
    channel: operatorNotificationChannelValidator,
    status: v.string(),
    subject: v.string(),
    body: v.string(),
    scheduledFor: v.optional(v.string()),
    sentAt: v.optional(v.string()),
    error: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerErrorCode: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerNumSegments: v.optional(v.number()),
    senderRole: v.optional(smsSenderRoleValidator),
    digestForDate: v.optional(v.string()),
    contentRetentionStatus: v.optional(retentionStatusValidator),
    contentExpiresAt: v.optional(v.string()),
    createdAt: v.string(),
  })
    .index("by_user_id_and_channel_and_event_key", ["userId", "channel", "eventKey"])
    .index("by_provider_message_id", ["providerMessageId"])
    .index("by_business_id_and_event_kind", ["businessId", "eventKind"])
    .index("by_business_id_and_event_kind_and_event_key", [
      "businessId",
      "eventKind",
      "eventKey",
    ])
    .index("by_content_retention_status_and_content_expires_at", [
      "contentRetentionStatus",
      "contentExpiresAt",
    ])
    .index("by_status_and_scheduled_for", ["status", "scheduledFor"]),

  unit_economics_events: defineTable({
    businessId: v.id("businesses"),
    monthKey: v.string(),
    occurredAt: v.string(),
    eventKey: v.string(),
    eventKind: unitEconomicsEventKindValidator,
    channel: unitEconomicsChannelValidator,
    costUsd: v.number(),
    quantity: v.optional(v.number()),
    quantityUnit: v.optional(unitEconomicsQuantityUnitValidator),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    operation: v.optional(v.string()),
    callId: v.optional(v.id("calls")),
    conversationId: v.optional(v.id("conversations")),
    messageId: v.optional(v.id("messages")),
    notificationId: v.optional(v.id("notifications")),
    operatorNotificationDeliveryId: v.optional(v.id("operator_notification_deliveries")),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_business_id_and_month_key_and_occurred_at", [
      "businessId",
      "monthKey",
      "occurredAt",
    ])
    .index("by_business_id_and_event_kind_and_occurred_at", [
      "businessId",
      "eventKind",
      "occurredAt",
    ])
    .index("by_call_id", ["callId"])
    .index("by_message_id", ["messageId"])
    .index("by_notification_id", ["notificationId"])
    .index("by_operator_notification_delivery_id", ["operatorNotificationDeliveryId"])
    .index("by_conversation_id", ["conversationId"]),

  unit_economics_rollups: defineTable({
    businessId: v.id("businesses"),
    monthKey: v.string(),
    totalCostUsd: v.number(),
    providerCostUsd: v.number(),
    aiCostUsd: v.number(),
    infraCostUsd: v.number(),
    voiceCostUsd: v.number(),
    smsCostUsd: v.number(),
    alertSmsCostUsd: v.number(),
    voiceCallCount: v.number(),
    voiceMinutes: v.number(),
    outboundSmsCount: v.number(),
    smsThreadCount: v.number(),
    activeUserCount: v.number(),
    costPerVoiceCallUsd: v.number(),
    costPerVoiceMinuteUsd: v.number(),
    costPerOutboundSmsUsd: v.number(),
    costPerSmsThreadUsd: v.number(),
    costPerActiveUserUsd: v.number(),
    costPerBusinessUsd: v.number(),
    recomputedAt: v.string(),
  })
    .index("by_business_id_and_month_key", ["businessId", "monthKey"])
    .index("by_month_key", ["monthKey"]),

  inbox_items: defineTable({
    businessId: v.id("businesses"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    relatedId: v.optional(v.string()),
    status: v.string(),
    contentRetentionStatus: v.optional(retentionStatusValidator),
    contentExpiresAt: v.optional(v.string()),
  })
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_kind", ["businessId", "kind"])
    .index("by_business_id_and_kind_and_status", ["businessId", "kind", "status"])
    .index("by_content_retention_status_and_content_expires_at", [
      "contentRetentionStatus",
      "contentExpiresAt",
    ])
    .index("by_kind_and_related_id", ["kind", "relatedId"])
    .index("by_related_id", ["relatedId"]),

  audit_logs: defineTable({
    businessId: v.id("businesses"),
    actorUserId: v.optional(v.id("users")),
    eventType: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    payload: v.optional(v.string()),
  })
    .index("by_business_id_and_event_type", ["businessId", "eventType"])
    .index("by_actor_user_id_and_event_type", ["actorUserId", "eventType"]),

  telemetry_outbox: defineTable({
    destination: v.string(),
    status: v.string(),
    availableAt: v.string(),
    attemptCount: v.number(),
    eventName: v.string(),
    distinctId: v.string(),
    businessId: v.optional(v.id("businesses")),
    groupKey: v.optional(v.string()),
    payloadJson: v.string(),
    lastError: v.optional(v.string()),
  })
    .index("by_status_and_available_at", ["status", "availableAt"])
    .index("by_destination_and_status", ["destination", "status"])
    .index("by_business_id_and_status", ["businessId", "status"]),

  workflow_jobs: defineTable({
    businessId: v.optional(v.id("businesses")),
    kind: v.string(),
    status: v.string(),
    dedupKey: v.string(),
    nextRunAt: v.string(),
    lastError: v.optional(v.string()),
  })
    .index("by_status_and_next_run_at", ["status", "nextRunAt"])
    .index("by_dedup_key", ["dedupKey"]),

  idempotency_keys: defineTable({
    scope: v.string(),
    key: v.string(),
    status: v.string(),
    resourceTable: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  }).index("by_scope_and_key", ["scope", "key"]),

  preview_sessions: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    prompt: v.string(),
    streamId: v.string(),
    threadId: v.optional(v.string()),
    response: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  })
    .index("by_business_id_and_user_id", ["businessId", "userId"])
    .index("by_user_id", ["userId"])
    .index("by_stream_id", ["streamId"])
    .index("by_expires_at", ["expiresAt"]),

  billing_accounts: defineTable({
    businessId: v.id("businesses"),
    billingKey: v.string(),
    currentPlan: v.optional(billingPlanSlugValidator),
    activeAddons: v.optional(v.array(billingAddonSlugValidator)),
    billingInterval: v.optional(billingIntervalValidator),
    subscriptionState: v.optional(v.string()),
    billingContactEmail: v.optional(v.string()),
    billingContactName: v.optional(v.string()),
    polarCustomerId: v.optional(v.string()),
    polarCustomerExternalId: v.optional(v.string()),
    proSubscriptionId: v.optional(v.string()),
    proSubscriptionProductId: v.optional(v.string()),
    proSubscriptionPriceId: v.optional(v.string()),
    aiSmsSubscriptionId: v.optional(v.string()),
    aiSmsSubscriptionProductId: v.optional(v.string()),
    aiSmsSubscriptionPriceId: v.optional(v.string()),
    aiSmsSetupOrderId: v.optional(v.string()),
    currentPeriodStart: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.string()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    checkoutId: v.optional(v.string()),
    lastWebhookEventType: v.optional(v.string()),
    lastSyncedAt: v.string(),
  })
    .index("by_business_id", ["businessId"])
    .index("by_billing_key", ["billingKey"])
    .index("by_polar_customer_id", ["polarCustomerId"]),

  billing_usage_months: defineTable({
    businessId: v.id("businesses"),
    periodKey: v.string(),
    planAtSnapshot: v.optional(billingPlanSlugValidator),
    voiceSecondsUsed: v.optional(v.number()),
    alertSmsSegmentsUsed: v.optional(v.number()),
    outboundCallAttemptsUsed: v.optional(v.number()),
    aiSmsSegmentsUsed: v.optional(v.number()),
    voiceSecondsIncluded: v.optional(v.number()),
    alertSmsSegmentsIncluded: v.optional(v.number()),
    outboundCallAttemptsIncluded: v.optional(v.number()),
    voiceBlocked: v.optional(v.boolean()),
    alertSmsBlocked: v.optional(v.boolean()),
    outboundCallAttemptsBlocked: v.optional(v.boolean()),
    lastRecordedAt: v.string(),
  }).index("by_business_id_and_period_key", ["businessId", "periodKey"]),

  billing_usage_events: defineTable({
    businessId: v.id("businesses"),
    periodKey: v.string(),
    sourceKey: v.string(),
    usageKind: billingUsageKindValidator,
    quantity: v.number(),
    planAtRecordTime: v.optional(billingPlanSlugValidator),
    activeAddonsAtRecordTime: v.optional(v.array(billingAddonSlugValidator)),
    recordedAt: v.string(),
    syncStatus: v.string(),
    syncAttemptedAt: v.optional(v.string()),
    syncedAt: v.optional(v.string()),
    syncError: v.optional(v.string()),
  })
    .index("by_business_id_and_source_key", ["businessId", "sourceKey"])
    .index("by_sync_status_and_recorded_at", ["syncStatus", "recordedAt"])
    .index("by_business_id_and_period_key", ["businessId", "periodKey"]),

  billing_transactions: defineTable({
    businessId: v.id("businesses"),
    kind: v.string(),
    sourceId: v.string(),
    status: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    description: v.optional(v.string()),
    invoiceUrl: v.optional(v.string()),
    orderId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    polarCustomerId: v.optional(v.string()),
    occurredAt: v.string(),
    lastSyncedAt: v.string(),
  })
    .index("by_kind_and_source_id", ["kind", "sourceId"])
    .index("by_business_id_and_occurred_at", ["businessId", "occurredAt"]),
});
