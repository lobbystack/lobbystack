import { z } from "zod";

export const traceContextSchema = z.object({
  traceparent: z.string().min(1).max(255).optional(),
  tracestate: z.string().max(4096).optional(),
});

export type TraceContextCarrier = z.infer<typeof traceContextSchema>;

export const twilioSmsInboundSchema = z.object({
  From: z.string().min(3).max(32),
  To: z.string().min(3).max(32),
  Body: z.string().max(10_000),
  MessageSid: z.string().min(1).max(255).optional(),
  SmsSid: z.string().min(1).max(255).optional(),
  NumMedia: z.coerce.number().int().nonnegative().optional(),
  OptOutType: z.string().max(64).optional(),
}).refine((value) => Boolean(value.MessageSid ?? value.SmsSid), { error: "A Twilio message SID is required.", path: ["MessageSid"] });

export const twilioSmsStatusSchema = z.object({
  MessageSid: z.string().min(1).max(255).optional(),
  SmsSid: z.string().min(1).max(255).optional(),
  MessageStatus: z.string().min(1).max(64),
  ErrorCode: z.string().max(64).optional(),
  Price: z.string().max(64).optional(),
  PriceUnit: z.string().max(16).optional(),
  NumSegments: z.coerce.number().int().nonnegative().optional(),
  RawDlrDoneDate: z.string().max(128).optional(),
}).refine((value) => Boolean(value.MessageSid ?? value.SmsSid), { error: "A Twilio message SID is required.", path: ["MessageSid"] });

export const polarWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.iso.datetime().optional(),
  data: z.record(z.string(), z.unknown()),
});

export const resendWebhookSchema = z.looseObject({
  type: z.string().min(1).max(160),
  created_at: z.iso.datetime().optional(),
  data: z.record(z.string(), z.unknown()),
});

const uploadContentTypes = {
  knowledge: new Set(["text/plain", "text/markdown", "text/x-markdown", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp", "image/tiff"]),
  attachment: new Set(["text/plain", "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]),
  recording: new Set(["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm"]),
  export: new Set(["application/json", "text/csv", "application/zip"]),
} as const;

export type UploadPurpose = keyof typeof uploadContentTypes;

export function isAllowedUploadContentType(purpose: string, contentType: string): boolean {
  const allowed = uploadContentTypes[purpose as UploadPurpose];
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return Boolean(allowed?.has(normalized as never));
}

export const uploadCreateRequestSchema = z.object({
  businessId: z.guid(),
  // Browsers only upload knowledge documents; other purposes are written server side.
  purpose: z.enum(["knowledge"]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  length: z.number().int().positive().max(500_000_000),
  checksum: z.string().max(255).optional(),
}).superRefine((input, context) => {
  if (!isAllowedUploadContentType(input.purpose, input.contentType)) context.addIssue({ code: "custom", path: ["contentType"], message: `Content type is not allowed for ${input.purpose} uploads.` });
  if (input.purpose === "knowledge" && !input.checksum) context.addIssue({ code: "custom", path: ["checksum"], message: "Knowledge uploads require a SHA-256 checksum." });
});

export const uploadFinalizeRequestSchema = z.object({
  title: z.string().max(1000).optional(),
  tags: z.array(z.string().max(255)).max(100).optional(),
  businessId: z.guid(),
  objectId: z.guid(),
  length: z.number().int().positive(),
  checksum: z.string().max(255).optional(),
  contentType: z.string().min(1).max(255),
});

export const uploadDownloadRequestSchema = z.object({
  businessId: z.guid(),
  objectId: z.guid(),
  range: z.string().regex(/^bytes=(?:\d+-\d*|-\d+)$/).optional(),
});

export const realtimeEventTypes = [
  "call.started",
  "call.updated",
  "call.completed",
  "transcript.upserted",
  "recording.available",
  "message.upserted",
  "message.deliveryUpdated",
  "conversation.updated",
  "appointment.updated",
  "knowledge.progressed",
  "document.progressed",
  "billing.updated",
] as const;

const realtimePayloadSchema = z.record(z.string(), z.unknown());

export const realtimeEventSchema = z.object({
  id: z.guid(),
  type: z.enum(realtimeEventTypes),
  businessId: z.guid(),
  entityId: z.guid().optional(),
  revision: z.number().int().nonnegative().optional(),
  occurredAt: z.iso.datetime(),
  payload: realtimePayloadSchema,
  trace: traceContextSchema,
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export const snapshotSchema = z.object({
  businessId: z.guid(),
  version: z.string().min(1),
  generatedAt: z.iso.datetime(),
  displayName: z.string().min(1),
  legalName: z.string().optional(),
  timezone: z.string().min(1),
  defaultLocale: z.enum(["en", "fr"]),
  businessType: z.string().min(1),
  telemetryEnabled: z.boolean().optional(),
  greeting: z.string(),
  voiceInstructions: z.string(),
  smsInstructions: z.string(),
  chatInstructions: z.string(),
  summary: z.string(),
  bookingPolicy: z.string(),
  bookingMode: z.enum(["off", "request", "instant"]).optional(),
  knowledgeDigest: z.string(),
  knowledgeSnippets: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    priority: z.number(),
  })).optional(),
  rules: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    order: z.number(),
  })).optional(),
  appointmentChangePolicy: z.object({
    enabled: z.boolean(),
    allowCancel: z.boolean(),
    allowReschedule: z.boolean(),
    verificationMode: z.enum(["phone_match_and_facts", "otp_required", "operator_only"]),
  }).optional(),
  transferPolicy: z.object({
    mode: z.enum(["never", "always", "on_request", "on_urgent", "during_business_hours"]),
    transferNumber: z.string().optional(),
  }),
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openMinutes: z.number().int().min(0).max(1440),
    closeMinutes: z.number().int().min(0).max(1440),
  })),
  closures: z.array(z.object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string(),
  })),
  services: z.array(z.object({
    id: z.guid(),
    name: z.string(),
    localizedNames: z.object({ en: z.string().optional(), fr: z.string().optional() }).optional(),
    durationMinutes: z.number().int().positive(),
    description: z.string().optional(),
  })),
  contactChannels: z.object({
    phoneNumber: z.string().optional(),
    smsNumber: z.string().optional(),
    email: z.email().optional(),
  }),
});

export const outboxMessageSchema = z.object({
  id: z.guid(),
  topic: z.string().min(1).max(160),
  businessId: z.guid().nullable(),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.guid().nullable(),
  dedupeKey: z.string().min(1).max(255),
  payload: z.record(z.string(), z.unknown()),
  trace: traceContextSchema,
});

// Webhook deliveries get their own queue: a tenant's slow endpoint holds a slot
// for up to 10 s per attempt and must not hold up other tenants' bookings.
export const jobQueues = ["critical", "default", "bulk", "maintenance", "webhooks"] as const;
export type JobQueue = (typeof jobQueues)[number];

export const queueForJobType = {
  "email.send": "default",
  "email.reconcileDelivery": "default",
  "sms.send": "critical",
  "appointment.sendChangeOtp": "critical",
  "sms.syncPrice": "critical",
  "call.syncPrice": "critical",
  "call.saveRecording": "default",
  "live.recoverOrphans": "critical",
  "billing.syncUsage": "critical",
  "billing.reconcile": "default",
  "billing.refreshUnitEconomics": "maintenance",
  "billing.createCheckout": "critical",
  "calendar.syncAppointment": "default",
  "calendar.reconcileBusiness": "default",
  "knowledge.extractDocument": "bulk",
  "knowledge.crawlWebsite": "bulk",
  "knowledge.reembedBusiness": "bulk",
  "business.generateSummary": "bulk",
  "business.extractHours": "bulk",
  "snapshot.refresh": "default",
  "notification.dispatch": "default",
  "notification.dailySummary": "maintenance",
  "conversation.finalizeSession": "default",
  "privacy.scrubMessage": "maintenance",
  "privacy.deleteRecording": "maintenance",
  "privacy.cleanupPendingUpload": "maintenance",
  "phoneVerification.send": "critical",
  "phoneVerification.sendCode": "critical",
  "phoneNumber.provision": "critical",
  "phoneNumber.reclaim": "maintenance",
  "prospectDemo.expire": "maintenance",
  "onboarding.sendFollowup": "default",
  "affiliate.generatePayoutRun": "maintenance",
  "telemetry.flush": "maintenance",
  "outbox.backlogSample": "maintenance",
  "realtime.publish": "default",
  "webhook.deliver": "webhooks",
  "api.retention": "maintenance",
} as const satisfies Record<string, JobQueue>;
export type JobType = keyof typeof queueForJobType;
export const jobTypes = Object.keys(queueForJobType) as [JobType, ...JobType[]];

export const jobEnvelopeSchema = z.object({
  jobId: z.guid(),
  type: z.enum(jobTypes),
  queue: z.enum(jobQueues),
  businessId: z.guid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  trace: traceContextSchema,
  idempotencyKey: z.string().min(1).max(255),
  scheduled: z.boolean().default(false),
  recurring: z.boolean().optional(),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const authzRoleSchema = z.enum([
  "platform_admin",
  "business_owner",
  "business_admin",
  "scheduler",
  "viewer",
]);

export type AuthzRole = z.infer<typeof authzRoleSchema>;
