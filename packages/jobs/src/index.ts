import type {
  AffiliateGeneratePayoutRunJobPayload,
  BillingReconcileJobPayload,
  BillingRecordUsageJobPayload,
  BillingSyncUsageJobPayload,
  CalendarReconcileBusinessJobPayload,
  CalendarSyncAppointmentJobPayload,
  CallSyncPriceJobPayload,
  CleanupPendingUploadJobPayload,
  DeleteRecordingJobPayload,
  DeleteTranscriptJobPayload,
  EmailSendJobPayload,
  FinalizeConversationJobPayload,
  JobEnvelope,
  KnowledgeCrawlWebsiteJobPayload,
  KnowledgeExtractDocumentJobPayload,
  KnowledgeIndexDocumentJobPayload,
  KnowledgeReindexBusinessJobPayload,
  MaintenanceSweepJobPayload,
  NotificationDispatchJobPayload,
  PhoneNumberReclaimJobPayload,
  RealtimePublishJobPayload,
  ScrubMessageJobPayload,
  SmsProcessInboundJobPayload,
  SmsReconcileStatusJobPayload,
  SmsSendJobPayload,
  SmsSyncPriceJobPayload,
  SnapshotRefreshJobPayload,
  TelemetryFlushJobPayload,
  TraceContext,
} from "@lobbystack/contracts";

export const QUEUE_NAMES = ["critical", "default", "bulk", "maintenance"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export const DLQ_QUEUE_NAME = "dlq" as const;
export const DLQ_QUEUE_UID = "lobbystack-dlq" as const;

export function queueKey(name: QueueName | typeof DLQ_QUEUE_NAME): string {
  return name === DLQ_QUEUE_NAME ? DLQ_QUEUE_UID : `lobbystack-${name}`;
}

export const JOB_NAMES = [
  "email.send",
  "sms.send",
  "sms.processInbound",
  "sms.reconcileStatus",
  "sms.syncPrice",
  "call.syncPrice",
  "billing.syncUsage",
  "billing.recordUsage",
  "billing.reconcile",
  "calendar.syncAppointment",
  "calendar.reconcileBusiness",
  "knowledge.extractDocument",
  "knowledge.crawlWebsite",
  "knowledge.indexDocument",
  "knowledge.reindexBusiness",
  "snapshot.refresh",
  "notification.dispatch",
  "conversation.finalizeSession",
  "privacy.scrubMessage",
  "privacy.deleteTranscript",
  "privacy.deleteRecording",
  "privacy.cleanupPendingUpload",
  "phoneNumber.reclaim",
  "affiliate.generatePayoutRun",
  "telemetry.flush",
  "maintenance.sweep",
  "realtime.publish",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export const OUTBOX_TOPICS = [
  "call.started",
  "call.updated",
  "call.completed",
  "transcript.upserted",
  "recording.available",
  "message.upserted",
  "message.deliveryUpdated",
  "conversation.updated",
  "appointment.created",
  "appointment.updated",
  "knowledge.progressed",
  "document.progressed",
] as const;
export type OutboxTopic = (typeof OUTBOX_TOPICS)[number];

export type JobPayloadMap = {
  "email.send": EmailSendJobPayload;
  "sms.send": SmsSendJobPayload;
  "sms.processInbound": SmsProcessInboundJobPayload;
  "sms.reconcileStatus": SmsReconcileStatusJobPayload;
  "sms.syncPrice": SmsSyncPriceJobPayload;
  "call.syncPrice": CallSyncPriceJobPayload;
  "billing.syncUsage": BillingSyncUsageJobPayload;
  "billing.recordUsage": BillingRecordUsageJobPayload;
  "billing.reconcile": BillingReconcileJobPayload;
  "calendar.syncAppointment": CalendarSyncAppointmentJobPayload;
  "calendar.reconcileBusiness": CalendarReconcileBusinessJobPayload;
  "knowledge.extractDocument": KnowledgeExtractDocumentJobPayload;
  "knowledge.crawlWebsite": KnowledgeCrawlWebsiteJobPayload;
  "knowledge.indexDocument": KnowledgeIndexDocumentJobPayload;
  "knowledge.reindexBusiness": KnowledgeReindexBusinessJobPayload;
  "snapshot.refresh": SnapshotRefreshJobPayload;
  "notification.dispatch": NotificationDispatchJobPayload;
  "conversation.finalizeSession": FinalizeConversationJobPayload;
  "privacy.scrubMessage": ScrubMessageJobPayload;
  "privacy.deleteTranscript": DeleteTranscriptJobPayload;
  "privacy.deleteRecording": DeleteRecordingJobPayload;
  "privacy.cleanupPendingUpload": CleanupPendingUploadJobPayload;
  "phoneNumber.reclaim": PhoneNumberReclaimJobPayload;
  "affiliate.generatePayoutRun": AffiliateGeneratePayoutRunJobPayload;
  "telemetry.flush": TelemetryFlushJobPayload;
  "maintenance.sweep": MaintenanceSweepJobPayload;
  "realtime.publish": RealtimePublishJobPayload;
};

export type JobPayloadFor<T extends JobName> = JobPayloadMap[T];

export type QueueJob<T extends JobName = JobName> = JobEnvelope & {
  jobType: T;
  payload: JobPayloadFor<T>;
};

export function queueForJob(jobName: JobName): QueueName {
  if (
    jobName === "sms.send" ||
    jobName === "sms.processInbound" ||
    jobName === "sms.reconcileStatus" ||
    jobName === "billing.syncUsage" ||
    jobName === "billing.recordUsage" ||
    jobName === "billing.reconcile"
  ) {
    return "critical";
  }

  if (
    jobName.startsWith("knowledge.") ||
    jobName === "privacy.deleteTranscript" ||
    jobName === "privacy.deleteRecording"
  ) {
    return "bulk";
  }

  if (
    jobName === "privacy.cleanupPendingUpload" ||
    jobName === "phoneNumber.reclaim" ||
    jobName === "telemetry.flush" ||
    jobName === "maintenance.sweep"
  ) {
    return "maintenance";
  }

  return "default";
}

export function deadLetterJobId(queue: QueueName, jobId: string): string {
  return `dlq:${queue}:${jobId}`;
}

export function repeatableJobId(jobType: JobName, jobId?: string): string {
  return jobId ?? `schedule:${jobType}`;
}

export type EnqueueJobInput<T extends JobName = JobName> = {
  jobType: T;
  payload: JobPayloadFor<T>;
  traceContext?: TraceContext;
  jobId?: string;
};

export type JobProducer = {
  enqueue<T extends JobName>(input: EnqueueJobInput<T>): Promise<string>;
};

export type RepeatableJobInput<T extends JobName = JobName> = {
  jobType: T;
  payload: JobPayloadFor<T>;
  everyMs: number;
  jobId?: string;
};

export type RepeatableJobProducer = {
  createRepeatableJob<T extends JobName>(input: RepeatableJobInput<T>): Promise<string>;
  stopRepeatableJob<T extends JobName>(input: RepeatableJobInput<T>): Promise<void>;
};

export type OutboxRecord = {
  id: string;
  topic: OutboxTopic;
  businessId: string | null;
  aggregateType: string;
  aggregateId: string | null;
  dedupeKey: string;
  payload: unknown;
  availableAt: Date;
  attempts: number;
  traceContext?: TraceContext;
};

export type OutboxRepository = {
  insert(record: Omit<OutboxRecord, "id" | "attempts">): Promise<void>;
  claim(limit: number, now: Date): Promise<OutboxRecord[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  markFailed(id: string, error: string, availableAt: Date): Promise<void>;
};

export type DeadLetterEnqueueInput = {
  queue: QueueName;
  jobType: JobName;
  jobId: string;
  error: string;
  attemptsMade: number;
};

export type DeadLetterProducer = {
  enqueueDeadLetter(input: DeadLetterEnqueueInput): Promise<string>;
};
