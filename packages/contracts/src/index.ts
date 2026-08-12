import { z } from "zod";

export const traceContextSchema = z.object({
  traceparent: z.string().min(1).max(255).optional(),
  tracestate: z.string().max(4096).optional(),
});

export type TraceContextCarrier = z.infer<typeof traceContextSchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  requestId: z.string().optional(),
});

export const pageRequestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

export const businessIdQuerySchema = z.object({
  businessId: z.string().uuid(),
});

export const voiceContextRequestSchema = z.object({
  phoneNumber: z.string().min(3).max(32),
  channel: z.enum(["voice", "sms"]).default("voice"),
});

export const voiceContextBySlugRequestSchema = z.object({
  businessSlug: z.string().min(1).max(120),
  dashboardTestCallToken: z.string().max(512).optional(),
  origin: z.string().url().optional(),
  ipHash: z.string().max(128).optional(),
  visitorId: z.string().max(128).optional(),
  widgetId: z.string().max(128).optional(),
  prospectDemoToken: z.string().max(512).optional(),
  maxDurationMs: z.number().int().positive().max(30 * 60 * 1_000).optional(),
});

export const voiceCallStartRequestSchema = z.object({
  businessId: z.string().uuid(),
  providerCallId: z.string().min(1).max(255),
  gatewaySessionId: z.string().min(1).max(255).optional(),
  from: z.string().min(3).max(32),
  to: z.string().min(3).max(32),
  startedAt: z.string().datetime(),
  channel: z.enum(["voice", "web_voice"]).default("voice"),
});

export const voiceCallTranscriptRequestSchema = z.object({
  businessId: z.string().uuid(),
  callId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  speaker: z.enum(["caller", "assistant", "system"]),
  text: z.string().max(50_000),
  final: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
});

export const voiceCallCompleteRequestSchema = z.object({
  callId: z.string().uuid(),
  status: z.enum(["completed", "failed", "transferred", "blocked"]),
  endedAt: z.string().datetime(),
  disposition: z.string().max(120).optional(),
  providerDurationSeconds: z.number().nonnegative().optional(),
});

export const voiceRecordingTargetRequestSchema = z.object({
  gatewaySessionId: z.string().min(1).max(255),
});

export const voiceToolRequestSchema = z.object({
  businessId: z.string().uuid(),
  callId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  input: z.record(z.string(), z.unknown()),
});

export const twilioSmsInboundSchema = z.object({
  From: z.string().min(3).max(32),
  To: z.string().min(3).max(32),
  Body: z.string().max(10_000),
  MessageSid: z.string().min(1).max(255).optional(),
  SmsSid: z.string().min(1).max(255).optional(),
  NumMedia: z.coerce.number().int().nonnegative().optional(),
  OptOutType: z.string().max(64).optional(),
}).refine((value) => Boolean(value.MessageSid ?? value.SmsSid), { message: "A Twilio message SID is required.", path: ["MessageSid"] });

export const twilioSmsStatusSchema = z.object({
  MessageSid: z.string().min(1).max(255).optional(),
  SmsSid: z.string().min(1).max(255).optional(),
  MessageStatus: z.string().min(1).max(64),
  ErrorCode: z.string().max(64).optional(),
  RawDlrDoneDate: z.string().max(128).optional(),
}).refine((value) => Boolean(value.MessageSid ?? value.SmsSid), { message: "A Twilio message SID is required.", path: ["MessageSid"] });

export const polarWebhookSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  data: z.record(z.string(), z.unknown()),
});

export const resendWebhookSchema = z.object({
  type: z.string().min(1).max(160),
  created_at: z.string().datetime().optional(),
  data: z.record(z.string(), z.unknown()),
}).passthrough();

export const providerEventSchema = z.object({
  provider: z.enum(["twilio", "polar", "google_calendar", "resend"]),
  providerEventId: z.string().min(1).max(255),
  eventType: z.string().min(1).max(160),
  occurredAt: z.string().datetime().optional(),
  businessId: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
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
  businessId: z.string().uuid(),
  purpose: z.enum(["knowledge", "attachment", "recording", "export"]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  length: z.number().int().positive().max(500_000_000),
  checksum: z.string().max(255).optional(),
}).superRefine((input, context) => {
  if (!isAllowedUploadContentType(input.purpose, input.contentType)) context.addIssue({ code: "custom", path: ["contentType"], message: `Content type is not allowed for ${input.purpose} uploads.` });
  if (input.purpose === "knowledge" && !input.checksum) context.addIssue({ code: "custom", path: ["checksum"], message: "Knowledge uploads require a SHA-256 checksum." });
});

export const uploadFinalizeRequestSchema = z.object({
  businessId: z.string().uuid(),
  objectId: z.string().uuid(),
  length: z.number().int().positive(),
  checksum: z.string().max(255).optional(),
  contentType: z.string().min(1).max(255),
});

export const uploadDownloadRequestSchema = z.object({
  businessId: z.string().uuid(),
  objectId: z.string().uuid(),
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
  id: z.string().uuid(),
  type: z.enum(realtimeEventTypes),
  businessId: z.string().uuid(),
  entityId: z.string().uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  occurredAt: z.string().datetime(),
  payload: realtimePayloadSchema,
  trace: traceContextSchema,
});

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export const snapshotSchema = z.object({
  businessId: z.string().uuid(),
  version: z.string().min(1),
  generatedAt: z.string().datetime(),
  displayName: z.string().min(1),
  timezone: z.string().min(1),
  defaultLocale: z.enum(["en", "fr"]),
  businessType: z.string().min(1),
  greeting: z.string(),
  voiceInstructions: z.string(),
  smsInstructions: z.string(),
  summary: z.string(),
  bookingPolicy: z.string(),
  knowledgeDigest: z.string(),
  transferPolicy: z.object({
    mode: z.string(),
    transferNumber: z.string().optional(),
  }),
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openMinutes: z.number().int().min(0).max(1440),
    closeMinutes: z.number().int().min(0).max(1440),
  })),
  closures: z.array(z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string(),
  })),
  services: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    durationMinutes: z.number().int().positive(),
    description: z.string().optional(),
  })),
  contactChannels: z.object({
    phoneNumber: z.string().optional(),
    smsNumber: z.string().optional(),
    email: z.string().email().optional(),
  }),
});

export const traceCarrierSchema = traceContextSchema.extend({
  traceId: z.string().regex(/^[\da-f]{32}$/i).optional(),
  spanId: z.string().regex(/^[\da-f]{16}$/i).optional(),
});

export const outboxMessageSchema = z.object({
  id: z.string().uuid(),
  topic: z.string().min(1).max(160),
  businessId: z.string().uuid().nullable(),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().uuid().nullable(),
  dedupeKey: z.string().min(1).max(255),
  payload: z.record(z.string(), z.unknown()),
  trace: traceContextSchema,
});

export const jobQueues = ["critical", "default", "bulk", "maintenance"] as const;
export type JobQueue = (typeof jobQueues)[number];

export const jobTypes = [
  "email.send",
  "email.reconcileDelivery",
  "sms.send",
  "sms.processInbound",
  "appointment.sendChangeOtp",
  "sms.syncPrice",
  "call.syncPrice",
  "billing.syncUsage",
  "billing.reconcile",
  "billing.createCheckout",
  "calendar.syncAppointment",
  "calendar.reconcileBusiness",
  "knowledge.extractDocument",
  "knowledge.crawlWebsite",
  "knowledge.indexDocument",
  "knowledge.reindexBusiness",
  "snapshot.refresh",
  "notification.dispatch",
  "notification.dailySummary",
  "conversation.finalizeSession",
  "privacy.scrubMessage",
  "privacy.deleteTranscript",
  "privacy.deleteRecording",
  "privacy.cleanupPendingUpload",
  "phoneVerification.send",
  "phoneNumber.provision",
  "phoneNumber.reclaim",
  "prospectDemo.expire",
  "affiliate.generatePayoutRun",
  "telemetry.flush",
  "realtime.publish",
] as const;
export type JobType = (typeof jobTypes)[number];

export const jobEnvelopeSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(jobTypes),
  queue: z.enum(jobQueues),
  businessId: z.string().uuid().nullable(),
  payload: z.record(z.string(), z.unknown()),
  trace: traceContextSchema,
  idempotencyKey: z.string().min(1).max(255),
  scheduled: z.boolean().default(false),
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

export const apiHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  version: z.string(),
  checks: z.record(z.string(), z.enum(["ok", "degraded", "failed"])),
});

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}
