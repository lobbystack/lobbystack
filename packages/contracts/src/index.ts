import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const traceContextSchema = z.object({
  traceparent: z
    .string()
    .regex(/^00-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/i),
  tracestate: z.string().min(1).optional(),
});
export type TraceContext = z.infer<typeof traceContextSchema>;

export const traceContextCarrierSchema = z.record(z.string());
export type TraceContextCarrier = z.infer<typeof traceContextCarrierSchema>;

export const errorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1),
  requestId: z.string().min(1).optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  version: z.string().min(1),
  checks: z.record(z.enum(["ok", "degraded", "failed"])),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

const voiceCallIdentifiersSchema = z.object({
  businessId: z.string().min(1),
  callId: z.string().min(1),
});

export const startVoiceCallRequestSchema = z.object({
  businessId: z.string().min(1),
  twilioCallSid: z.string().min(1),
  gatewaySessionId: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  startedAt: z.string().datetime({ offset: true }),
});
export type StartVoiceCallRequest = z.infer<typeof startVoiceCallRequestSchema>;

export const startWebCallRequestSchema = z.object({
  businessSlug: z.string().min(1),
  providerCallId: z.string().min(1),
  gatewaySessionId: z.string().min(1).optional(),
  ipHash: z.string().min(1).optional(),
  originUrl: z.string().url().optional(),
  userAgent: z.string().min(1).optional(),
  visitorId: z.string().min(1).optional(),
  widgetId: z.string().min(1).optional(),
  maxDurationMs: z.number().positive().optional(),
  startedAt: z.string().datetime({ offset: true }),
  prospectDemoToken: z.string().min(1).optional(),
  dashboardTestCallToken: z.string().min(1).optional(),
});
export type StartWebCallRequest = z.infer<typeof startWebCallRequestSchema>;

export const appendTranscriptRequestSchema = voiceCallIdentifiersSchema.extend({
  sequence: z.number().int().nonnegative(),
  speaker: z.enum(["caller", "assistant", "system"]),
  text: z.string(),
  final: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
});
export type AppendTranscriptRequest = z.infer<typeof appendTranscriptRequestSchema>;

export const completeCallRequestSchema = z.object({
  callId: z.string().min(1),
  status: z.string().min(1),
  endedAt: z.string().datetime({ offset: true }),
  disposition: z.string().min(1).optional(),
  providerDurationSeconds: z.number().nonnegative().optional(),
});
export type CompleteCallRequest = z.infer<typeof completeCallRequestSchema>;

export const transferStateRequestSchema = z.object({
  callId: z.string().min(1),
  transferState: z.string().min(1),
});
export type TransferStateRequest = z.infer<typeof transferStateRequestSchema>;

export const prepareTransferRequestSchema = z
  .object({
    callId: z.string().min(1).optional(),
    twilioCallSid: z.string().min(1).optional(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => value.callId !== undefined || value.twilioCallSid !== undefined, {
    message: "callId or twilioCallSid is required",
  });
export type PrepareTransferRequest = z.infer<typeof prepareTransferRequestSchema>;

export const recordVoiceAiCostRequestSchema = z.object({
  businessId: uuidSchema,
  callId: uuidSchema,
  occurredAt: z.string().datetime({ offset: true }),
  eventKey: z.string().min(1).max(255),
  costUsd: z.number().finite().nonnegative(),
  provider: z.string().min(1).max(120),
  model: z.string().min(1).max(160),
  operation: z.string().min(1).max(160).optional(),
  conversationId: uuidSchema.optional(),
});
export type RecordVoiceAiCostRequest = z.infer<typeof recordVoiceAiCostRequestSchema>;

export const webRecordingTargetRequestSchema = z.object({
  gatewaySessionId: z.string().min(1),
});
export type WebRecordingTargetRequest = z.infer<typeof webRecordingTargetRequestSchema>;

export const reconcileVoiceCallStatusRequestSchema = z.object({
  twilioCallSid: z.string().min(1),
  callStatus: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative().optional(),
  callbackSource: z.string().min(1).optional(),
  providerUpdatedAt: z.string().datetime({ offset: true }),
  providerDurationSeconds: z.number().int().nonnegative().optional(),
});
export type ReconcileVoiceCallStatusRequest = z.infer<
  typeof reconcileVoiceCallStatusRequestSchema
>;

export const voiceContextRequestSchema = z.object({
  phoneNumber: z.string().min(1),
  channel: z.enum(["voice", "sms"]).optional(),
});
export type VoiceContextRequest = z.infer<typeof voiceContextRequestSchema>;

export const voiceContextBySlugRequestSchema = z.object({
  businessSlug: z.string().min(1),
  dashboardTestCallToken: z.string().min(1).optional(),
  origin: z.string().min(1).optional(),
  ipHash: z.string().min(1).optional(),
  visitorId: z.string().min(1).optional(),
  widgetId: z.string().min(1).optional(),
  prospectDemoToken: z.string().min(1).optional(),
});
export type VoiceContextBySlugRequest = z.infer<typeof voiceContextBySlugRequestSchema>;

export const findAvailabilityToolRequestSchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  date: z.string().min(1),
  timezone: z.string().min(1),
  preferredStaffId: z.string().min(1).optional(),
  preferredHour24: z.number().int().min(0).max(23).optional(),
  preferredMinute: z.number().int().min(0).max(59).optional(),
  limit: z.number().int().positive().optional(),
});
export type FindAvailabilityToolRequest = z.infer<typeof findAvailabilityToolRequestSchema>;

export const checkAvailabilityToolRequestSchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  preferredStaffId: z.string().min(1).optional(),
});
export type CheckAvailabilityToolRequest = z.infer<typeof checkAvailabilityToolRequestSchema>;

export const bookAppointmentToolRequestSchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  channel: z.enum(["voice", "web_voice"]).optional(),
  preferredStaffId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  contactPhone: z.string().min(1),
  smsConsentGranted: z.boolean(),
});
export type BookAppointmentToolRequest = z.infer<typeof bookAppointmentToolRequestSchema>;

export const lookupAppointmentForChangeToolRequestSchema = z.object({
  businessId: z.string().min(1),
  callerPhone: z.string().min(1),
});
export type LookupAppointmentForChangeToolRequest = z.infer<
  typeof lookupAppointmentForChangeToolRequestSchema
>;

export const takeMessageToolRequestSchema = z.object({
  businessId: z.string().min(1),
  callId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  channel: z.enum(["voice", "web_voice"]).optional(),
  callerName: z.string().min(1).optional(),
  callbackPhone: z.string().min(1).optional(),
  message: z.string().min(1),
  urgency: z.string().min(1).optional(),
  callbackWindow: z.string().min(1).optional(),
});
export type TakeMessageToolRequest = z.infer<typeof takeMessageToolRequestSchema>;

export const searchKnowledgeToolRequestSchema = z.object({
  businessId: z.string().min(1),
  query: z.string().min(1),
});
export type SearchKnowledgeToolRequest = z.infer<typeof searchKnowledgeToolRequestSchema>;

export const appointmentChangeVerificationRequestSchema = z.object({
  businessId: uuidSchema,
  appointmentId: uuidSchema.optional(),
  callerPhone: z.string().min(1),
  action: z.enum(["cancel", "reschedule"]),
  verificationMode: z
    .enum(["phone_match_and_facts", "otp_required", "operator_only"])
    .optional(),
  callId: uuidSchema.optional(),
  conversationId: uuidSchema.optional(),
  channel: z.string().min(1).optional(),
});
export type AppointmentChangeVerificationRequest = z.infer<
  typeof appointmentChangeVerificationRequestSchema
>;

export const appointmentChangeOtpStartRequestSchema = z.object({
  verificationId: uuidSchema,
});
export type AppointmentChangeOtpStartRequest = z.infer<
  typeof appointmentChangeOtpStartRequestSchema
>;

export const appointmentChangeOtpCheckRequestSchema = z.object({
  verificationId: uuidSchema,
  code: z.string().regex(/^\d{4,8}$/),
});
export type AppointmentChangeOtpCheckRequest = z.infer<
  typeof appointmentChangeOtpCheckRequestSchema
>;

export const voiceCallResponseSchema = z.object({
  callId: z.string().min(1),
  blocked: z.boolean().optional(),
  conversationId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
});
export type VoiceCallResponse = z.infer<typeof voiceCallResponseSchema>;

export const signedRequestHeadersSchema = z.object({
  "x-lobbystack-service-id": z.string().min(1),
  "x-lobbystack-timestamp": z.string().regex(/^\d+$/),
  "x-lobbystack-nonce": z.string().min(16),
  "x-lobbystack-body-sha256": z.string().regex(/^[\da-f]{64}$/i),
  "x-lobbystack-signature": z.string().regex(/^[\da-f]{64}$/i),
});
export type SignedRequestHeaders = z.infer<typeof signedRequestHeadersSchema>;

export const uploadFinalizeRequestSchema = z.object({
  objectId: uuidSchema,
  length: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  checksumSha256: z.string().regex(/^[\da-f]{64}$/i),
});
export type UploadFinalizeRequest = z.infer<typeof uploadFinalizeRequestSchema>;

export const createUploadRequestSchema = z.object({
  purpose: z.string().min(1).max(80),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(160),
  length: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[\da-f]{64}$/i),
});
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const createKnowledgeDocumentRequestSchema = z.object({
  title: z.string().min(1).max(255),
  textContent: z.string().min(1).max(2_000_000),
  sourceType: z.enum(["manual", "text", "markdown", "website"]).default("manual"),
  sourceUri: z.string().url().optional(),
});
export type CreateKnowledgeDocumentRequest = z.infer<
  typeof createKnowledgeDocumentRequestSchema
>;

export const twilioSmsInboundPayloadSchema = z
  .object({
    From: z.string().min(1),
    To: z.string().min(1),
    Body: z.string(),
    MessageSid: z.string().min(1).optional(),
    SmsSid: z.string().min(1).optional(),
    NumMedia: z.string().min(1).optional(),
    OptOutType: z.string().min(1).optional(),
  })
  .catchall(z.string());
export type TwilioSmsInboundPayload = z.infer<typeof twilioSmsInboundPayloadSchema>;

export const twilioSmsStatusPayloadSchema = z
  .object({
    MessageSid: z.string().min(1).optional(),
    SmsSid: z.string().min(1).optional(),
    MessageStatus: z.string().min(1),
    ErrorCode: z.string().min(1).optional(),
    RawDlrDoneDate: z.string().min(1).optional(),
  })
  .catchall(z.string());
export type TwilioSmsStatusPayload = z.infer<typeof twilioSmsStatusPayloadSchema>;

export const emailSendJobPayloadSchema = z.object({
  businessId: uuidSchema,
  messageId: uuidSchema,
});
export type EmailSendJobPayload = z.infer<typeof emailSendJobPayloadSchema>;

export const smsSendJobPayloadSchema = z.object({
  businessId: uuidSchema,
  messageId: uuidSchema,
});
export type SmsSendJobPayload = z.infer<typeof smsSendJobPayloadSchema>;

export const smsProcessInboundJobPayloadSchema = z.object({
  to: z.string().min(1),
  from: z.string().min(1),
  body: z.string(),
  providerMessageId: z.string().min(1).optional(),
  optOutType: z.string().min(1).optional(),
});
export type SmsProcessInboundJobPayload = z.infer<typeof smsProcessInboundJobPayloadSchema>;

export const smsReconcileStatusJobPayloadSchema = z.object({
  providerMessageId: z.string().min(1),
  providerStatus: z.string().min(1),
  providerUpdatedAt: z.string().datetime({ offset: true }),
  providerErrorCode: z.string().min(1).optional(),
});
export type SmsReconcileStatusJobPayload = z.infer<typeof smsReconcileStatusJobPayloadSchema>;

export const smsSyncPriceJobPayloadSchema = z.object({
  businessId: uuidSchema,
  messageId: uuidSchema,
  providerMessageId: z.string().min(1),
  providerStatus: z.string().min(1),
});
export type SmsSyncPriceJobPayload = z.infer<typeof smsSyncPriceJobPayloadSchema>;

export const callSyncPriceJobPayloadSchema = z.object({
  businessId: uuidSchema,
  callId: uuidSchema,
  providerCallId: z.string().min(1),
});
export type CallSyncPriceJobPayload = z.infer<typeof callSyncPriceJobPayloadSchema>;

export const knowledgeExtractDocumentJobPayloadSchema = z.object({
  businessId: uuidSchema,
  documentId: uuidSchema,
});
export type KnowledgeExtractDocumentJobPayload = z.infer<
  typeof knowledgeExtractDocumentJobPayloadSchema
>;

export const knowledgeIndexDocumentJobPayloadSchema = z.object({
  businessId: uuidSchema,
  documentId: uuidSchema,
});
export type KnowledgeIndexDocumentJobPayload = z.infer<
  typeof knowledgeIndexDocumentJobPayloadSchema
>;

export const knowledgeReindexBusinessJobPayloadSchema = z.object({
  businessId: uuidSchema,
});
export type KnowledgeReindexBusinessJobPayload = z.infer<
  typeof knowledgeReindexBusinessJobPayloadSchema
>;

export const knowledgeCrawlWebsiteJobPayloadSchema = z.object({
  businessId: uuidSchema,
  url: z.string().url(),
  title: z.string().min(1).max(255).optional(),
});
export type KnowledgeCrawlWebsiteJobPayload = z.infer<
  typeof knowledgeCrawlWebsiteJobPayloadSchema
>;

export const snapshotRefreshJobPayloadSchema = z.object({
  businessId: uuidSchema,
});
export type SnapshotRefreshJobPayload = z.infer<typeof snapshotRefreshJobPayloadSchema>;

export const notificationDispatchJobPayloadSchema = z.object({
  businessId: uuidSchema,
  notificationId: uuidSchema,
});
export type NotificationDispatchJobPayload = z.infer<
  typeof notificationDispatchJobPayloadSchema
>;

export const billingUsageKindSchema = z.enum([
  "voice_seconds",
  "alert_sms_segments",
  "outbound_call_attempts",
  "ai_sms_segments",
]);
export type BillingUsageKind = z.infer<typeof billingUsageKindSchema>;

export const billingSyncUsageJobPayloadSchema = z.object({
  businessId: uuidSchema,
  usageEventId: uuidSchema,
  attempt: z.number().int().nonnegative().optional(),
});
export type BillingSyncUsageJobPayload = z.infer<typeof billingSyncUsageJobPayloadSchema>;

export const billingRecordUsageJobPayloadSchema = z.object({
  businessId: uuidSchema,
  usageKind: billingUsageKindSchema,
  quantity: z.number().finite().nonnegative(),
  sourceKey: z.string().min(1).max(255),
  recordedAt: z.string().datetime({ offset: true }),
});
export type BillingRecordUsageJobPayload = z.infer<typeof billingRecordUsageJobPayloadSchema>;

export const billingReconcileJobPayloadSchema = z.object({
  businessId: uuidSchema,
  orderId: z.string().min(1).optional(),
});
export type BillingReconcileJobPayload = z.infer<typeof billingReconcileJobPayloadSchema>;

export const phoneNumberReclaimJobPayloadSchema = z.object({
  businessId: uuidSchema,
});
export type PhoneNumberReclaimJobPayload = z.infer<typeof phoneNumberReclaimJobPayloadSchema>;

export const calendarSyncAppointmentJobPayloadSchema = z.object({
  businessId: uuidSchema,
  appointmentId: uuidSchema,
  connectionId: uuidSchema,
});
export type CalendarSyncAppointmentJobPayload = z.infer<
  typeof calendarSyncAppointmentJobPayloadSchema
>;

export const calendarReconcileBusinessJobPayloadSchema = z.object({
  businessId: uuidSchema,
});
export type CalendarReconcileBusinessJobPayload = z.infer<
  typeof calendarReconcileBusinessJobPayloadSchema
>;

export const finalizeConversationJobPayloadSchema = z.object({
  businessId: uuidSchema,
  conversationId: uuidSchema,
});
export type FinalizeConversationJobPayload = z.infer<typeof finalizeConversationJobPayloadSchema>;

export const scrubMessageJobPayloadSchema = z.object({
  businessId: uuidSchema,
  messageId: uuidSchema,
});
export type ScrubMessageJobPayload = z.infer<typeof scrubMessageJobPayloadSchema>;

export const deleteTranscriptJobPayloadSchema = z.object({
  businessId: uuidSchema,
  callId: uuidSchema,
  transcriptId: uuidSchema.optional(),
});
export type DeleteTranscriptJobPayload = z.infer<typeof deleteTranscriptJobPayloadSchema>;

export const deleteRecordingJobPayloadSchema = z.object({
  businessId: uuidSchema,
  callId: uuidSchema,
  objectId: uuidSchema.optional(),
});
export type DeleteRecordingJobPayload = z.infer<typeof deleteRecordingJobPayloadSchema>;

export const cleanupPendingUploadJobPayloadSchema = z.object({
  businessId: uuidSchema,
  olderThan: z.string().datetime({ offset: true }).optional(),
});
export type CleanupPendingUploadJobPayload = z.infer<
  typeof cleanupPendingUploadJobPayloadSchema
>;

export const affiliateGeneratePayoutRunJobPayloadSchema = z.object({
  periodKey: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});
export type AffiliateGeneratePayoutRunJobPayload = z.infer<
  typeof affiliateGeneratePayoutRunJobPayloadSchema
>;

export const telemetryFlushJobPayloadSchema = z.object({
  limit: z.number().int().positive().optional(),
});
export type TelemetryFlushJobPayload = z.infer<typeof telemetryFlushJobPayloadSchema>;

export const maintenanceSweepJobPayloadSchema = z.object({
  kind: z.string().min(1).optional(),
});
export type MaintenanceSweepJobPayload = z.infer<typeof maintenanceSweepJobPayloadSchema>;

export const realtimePublishJobPayloadSchema = z.object({
  outboxMessageId: uuidSchema,
});
export type RealtimePublishJobPayload = z.infer<typeof realtimePublishJobPayloadSchema>;

export const sendSmsReplyRequestSchema = z.object({
  businessId: uuidSchema,
  conversationId: uuidSchema,
  body: z.string().trim().min(1).max(1_600),
});
export type SendSmsReplyRequest = z.infer<typeof sendSmsReplyRequestSchema>;

export const outboxMessageSchema = z.object({
  id: uuidSchema,
  topic: z.string().min(1),
  businessId: uuidSchema.nullable(),
  aggregateType: z.string().min(1),
  aggregateId: uuidSchema.nullable(),
  dedupeKey: z.string().min(1),
  payload: z.unknown(),
  availableAt: z.string().datetime({ offset: true }),
  attempts: z.number().int().nonnegative(),
  traceContext: traceContextSchema.optional(),
});
export type OutboxMessage = z.infer<typeof outboxMessageSchema>;

const realtimeReferenceSchema = z.object({
  businessId: uuidSchema,
  entityId: uuidSchema,
  revision: z.number().int().nonnegative().optional(),
});
export type RealtimeReference = z.infer<typeof realtimeReferenceSchema>;

export const realtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call.started"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("call.updated"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("call.completed"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("transcript.upserted"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("recording.available"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("message.upserted"), payload: realtimeReferenceSchema }),
  z.object({
    type: z.literal("message.deliveryUpdated"),
    payload: realtimeReferenceSchema,
  }),
  z.object({ type: z.literal("conversation.updated"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("appointment.created"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("appointment.updated"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("knowledge.progressed"), payload: realtimeReferenceSchema }),
  z.object({ type: z.literal("document.progressed"), payload: realtimeReferenceSchema }),
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export const createBusinessRequestSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(160),
  timezone: z.string().min(1).max(80),
  defaultLocale: z.enum(["en", "fr"]).default("en"),
});
export type CreateBusinessRequest = z.infer<typeof createBusinessRequestSchema>;

export const updateBusinessSettingsRequestSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  timezone: z.string().min(1).max(80).optional(),
  greeting: z.string().min(1).max(2_000).optional(),
  voiceInstructions: z.string().min(1).max(10_000).optional(),
  smsInstructions: z.string().min(1).max(2_000).optional(),
  businessSummary: z.string().max(10_000).optional(),
  bookingPolicy: z.string().min(1).max(5_000).optional(),
  transferMode: z
    .enum(["never", "always", "on_request", "on_urgent", "during_business_hours"])
    .optional(),
});
export type UpdateBusinessSettingsRequest = z.infer<
  typeof updateBusinessSettingsRequestSchema
>;

export const updateNotificationPreferencesRequestSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  eventPreferences: z.record(z.boolean()).default({}),
  dailySummaryEnabled: z.boolean().default(false),
  dailySummarySendTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;

export const demoClaimRequestSchema = z.object({
  token: z.string().min(16).max(512),
});
export type DemoClaimRequest = z.infer<typeof demoClaimRequestSchema>;

export const updateSmsComplianceRequestSchema = z.object({
  status: z.enum(["not_started", "draft", "submitted", "approved", "rejected"]),
  brandStatus: z.string().min(1).max(80),
  campaignStatus: z.string().min(1).max(80),
  a2pStatus: z.string().min(1).max(80),
  lastError: z.string().max(2_000).nullable().optional(),
});
export type UpdateSmsComplianceRequest = z.infer<typeof updateSmsComplianceRequestSchema>;

export const affiliateClickRequestSchema = z.object({
  referralCode: z.string().min(2).max(120),
  visitorId: z.string().max(160).optional(),
  sourceUrl: z.string().url().optional(),
});
export type AffiliateClickRequest = z.infer<typeof affiliateClickRequestSchema>;

export const bookAppointmentRequestSchema = z.object({
  contactId: uuidSchema,
  serviceId: uuidSchema,
  staffId: uuidSchema.optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});
export type BookAppointmentRequest = z.infer<typeof bookAppointmentRequestSchema>;

export const createServiceRequestSchema = z.object({
  name: z.string().min(1).max(160),
  durationMinutes: z.number().int().positive().max(480),
});
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;

export const createStaffRequestSchema = z.object({
  name: z.string().min(1).max(160),
  timezone: z.string().min(1).max(80),
});
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

export const businessContextSnapshotSchema = z.object({
  businessId: z.string().min(1),
  version: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  displayName: z.string().min(1),
  legalName: z.string().min(1).optional(),
  timezone: z.string().min(1),
  defaultLocale: z.enum(["en", "fr"]),
  businessType: z.enum(["clinic", "repair_shop", "salon", "service_company", "other"]),
  greeting: z.string().min(1),
  voiceInstructions: z.string(),
  smsInstructions: z.string(),
  summary: z.string(),
  bookingPolicy: z.string(),
  knowledgeDigest: z.string(),
  transferPolicy: z.object({
    mode: z.enum(["never", "always", "on_request", "on_urgent", "during_business_hours"]),
    transferNumber: z.string().min(1).optional(),
  }),
  appointmentChangePolicy: z
    .object({
      enabled: z.boolean(),
      allowCancel: z.boolean(),
      allowReschedule: z.boolean(),
      verificationMode: z.enum(["phone_match_and_facts", "otp_required", "operator_only"]),
    })
    .optional(),
  hours: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      openMinutes: z.number().int().min(0).max(1_440),
      closeMinutes: z.number().int().min(0).max(1_440),
    }),
  ),
  closures: z.array(
    z.object({
      startsAt: z.string().min(1),
      endsAt: z.string().min(1),
      reason: z.string(),
    }),
  ),
  services: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      durationMinutes: z.number().int().positive(),
    }),
  ),
  rules: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        content: z.string(),
        order: z.number().int(),
      }),
    )
    .optional(),
  knowledgeSnippets: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        content: z.string(),
        tags: z.array(z.string()),
        priority: z.number().int(),
      }),
    )
    .optional(),
  contactChannels: z.object({
    phoneNumber: z.string().min(1).optional(),
    smsNumber: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
  }),
  telemetryEnabled: z.boolean().optional(),
});
export type BusinessContextSnapshot = z.infer<typeof businessContextSnapshotSchema>;

export const jobEnvelopeSchema = z.object({
  jobId: uuidSchema,
  jobType: z.string().min(1),
  payload: z.unknown(),
  traceContext: traceContextSchema.optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
