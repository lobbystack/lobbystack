import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const serviceSummaryValidator = v.object({
  id: v.string(),
  name: v.string(),
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
  url: v.string(),
  contentType: v.optional(v.string()),
});

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
  })
    .index("by_auth_subject", ["authSubject"])
    .index("email", ["email"])
    .index("phone", ["phone"]),

  businesses: defineTable({
    slug: v.string(),
    name: v.string(),
    timezone: v.string(),
    businessType: v.string(),
    deploymentMode: v.string(),
    status: v.string(),
  }).index("by_slug", ["slug"]),

  business_memberships: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    role: v.string(),
    status: v.string(),
  })
    .index("by_user_id_and_business_id", ["userId", "businessId"])
    .index("by_business_id_and_role", ["businessId", "role"]),

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
  })
    .index("by_e164", ["e164"])
    .index("by_twilio_phone_sid", ["twilioPhoneSid"])
    .index("by_business_id", ["businessId"]),

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
  }).index("by_business_id", ["businessId"]),

  knowledge_documents: defineTable({
    businessId: v.id("businesses"),
    sourceType: v.string(),
    title: v.string(),
    storageId: v.optional(v.id("_storage")),
    mimeType: v.optional(v.string()),
    textContent: v.optional(v.string()),
    status: v.string(),
    tags: v.array(v.string()),
    importance: v.number(),
    contentHash: v.optional(v.string()),
    lastIndexedAt: v.optional(v.string()),
    indexedEntryId: v.optional(v.string()),
    indexVersion: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_business_id_and_status", ["businessId", "status"])
    .index("by_business_id_and_source_type", ["businessId", "sourceType"]),

  knowledge_snippets: defineTable({
    businessId: v.id("businesses"),
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
    hours: v.array(hoursWindowValidator),
    closures: v.array(closureWindowValidator),
    services: v.array(serviceSummaryValidator),
    priorityFaqs: v.array(snippetValidator),
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
  })
    .index("by_business_id_and_phone", ["businessId", "phone"])
    .index("by_business_id_and_email", ["businessId", "email"]),

  conversations: defineTable({
    businessId: v.id("businesses"),
    contactId: v.optional(v.id("contacts")),
    channel: v.string(),
    status: v.string(),
    summary: v.optional(v.string()),
    currentIntent: v.optional(v.string()),
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
    lastConfirmedAppointmentId: v.optional(v.id("appointments")),
    lastConfirmedServiceId: v.optional(v.id("services")),
    lastConfirmedStartsAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_conversation_id", ["conversationId"]),

  messages: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    direction: v.string(),
    channel: v.string(),
    fromPhoneNumber: v.optional(v.string()),
    providerMessageSid: v.optional(v.string()),
    media: v.optional(v.array(messageMediaValidator)),
    body: v.string(),
    status: v.string(),
    providerStatus: v.optional(v.string()),
    providerErrorCode: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    providerRawDlrDoneDate: v.optional(v.string()),
    aiGenerated: v.boolean(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_provider_message_sid", ["providerMessageSid"]),

  calls: defineTable({
    businessId: v.id("businesses"),
    conversationId: v.optional(v.id("conversations")),
    twilioCallSid: v.string(),
    gatewaySessionId: v.optional(v.string()),
    status: v.string(),
    transferState: v.optional(v.string()),
    disposition: v.optional(v.string()),
    providerCallStatus: v.optional(v.string()),
    providerCallStatusSequence: v.optional(v.number()),
    providerCallStatusSource: v.optional(v.string()),
    providerCallDurationSeconds: v.optional(v.number()),
    providerUpdatedAt: v.optional(v.string()),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    recordingStorageId: v.optional(v.id("_storage")),
    recordingContentType: v.optional(v.string()),
    recordingByteLength: v.optional(v.number()),
    recordingDurationMs: v.optional(v.number()),
  })
    .index("by_twilio_call_sid", ["twilioCallSid"])
    .index("by_business_id_and_started_at", ["businessId", "startedAt"])
    .index("by_conversation_id", ["conversationId"]),

  transcripts: defineTable({
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    sequence: v.number(),
    speaker: v.string(),
    text: v.string(),
    confidence: v.optional(v.number()),
    final: v.boolean(),
  }).index("by_call_id_and_sequence", ["callId", "sequence"]),

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
    calendarSyncState: v.string(),
  })
    .index("by_business_id_and_starts_at", ["businessId", "startsAt"])
    .index("by_staff_id_and_starts_at", ["staffId", "startsAt"])
    .index("by_contact_id_and_starts_at", ["contactId", "startsAt"]),

  calendar_connections: defineTable({
    businessId: v.id("businesses"),
    provider: v.string(),
    ownerUserId: v.id("users"),
    externalAccountId: v.string(),
    selectedCalendarId: v.optional(v.string()),
    status: v.string(),
    encryptedAccessToken: v.optional(v.string()),
    encryptedRefreshToken: v.optional(v.string()),
    syncCursor: v.optional(v.string()),
  })
    .index("by_business_id_and_provider", ["businessId", "provider"])
    .index("by_owner_user_id_and_provider", ["ownerUserId", "provider"])
    .index("by_provider_and_external_account_id", ["provider", "externalAccountId"]),

  calendar_busy_blocks: defineTable({
    businessId: v.id("businesses"),
    staffId: v.optional(v.id("staff")),
    connectionId: v.id("calendar_connections"),
    startsAt: v.string(),
    endsAt: v.string(),
  })
    .index("by_staff_id_and_starts_at", ["staffId", "startsAt"])
    .index("by_business_id_and_starts_at", ["businessId", "startsAt"])
    .index("by_connection_id_and_starts_at", ["connectionId", "startsAt"]),

  notifications: defineTable({
    businessId: v.id("businesses"),
    channel: v.string(),
    kind: v.string(),
    relatedId: v.optional(v.string()),
    scheduledFor: v.string(),
    status: v.string(),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerErrorCode: v.optional(v.string()),
    providerUpdatedAt: v.optional(v.string()),
    providerRawDlrDoneDate: v.optional(v.string()),
  })
    .index("by_business_id_and_scheduled_for", ["businessId", "scheduledFor"])
    .index("by_status_and_scheduled_for", ["status", "scheduledFor"])
    .index("by_provider_message_id", ["providerMessageId"]),

  inbox_items: defineTable({
    businessId: v.id("businesses"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    relatedId: v.optional(v.string()),
    status: v.string(),
  })
    .index("by_business_id_and_status", ["businessId", "status"])
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
  })
    .index("by_business_id_and_user_id", ["businessId", "userId"])
    .index("by_user_id", ["userId"])
    .index("by_stream_id", ["streamId"]),
});
