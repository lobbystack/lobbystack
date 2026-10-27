import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
import { and, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";

import { hasSummarizableTranscript, type BusinessHoursExtractor, type BusinessSummarizer, type CallSummarizer } from "@lobbystack/agent-core";
import { realtimeEventSchema, type JobEnvelope } from "@lobbystack/contracts";
import { HOST_EMAIL_BRAND, billingMeterEventNames, emailSender, getPolarMeteredUsagePayload, intlLocale, isUuid, normalizeRuntimeLocale, parseEmailBrandReference, partnerFeatures, partnerTierProductId, type BillingUsageKind, type EmailBrandReference } from "@lobbystack/shared";
import { appointments, calls, contacts, enqueueOutbox, knowledgeChunks, knowledgeDocuments, messages, notifications, phoneNumbers, storageObjects, websiteIngestionJobs, withBusinessTransaction, type Database } from "@lobbystack/db";
import { enqueueKnowledgeDerivedRefresh, finishBusinessSummaryRegenerate, loadBusinessHoursInput, loadBusinessSummaryInput, markBusinessHoursChecked, resetGeneratedBusinessSummary, saveGeneratedBusinessHours, saveGeneratedBusinessSummary, type SummaryRegenerateOutcome } from "@lobbystack/domain";
import { billingCheckoutLeaseEndsAt, checkKnowledgeStorageLimit, claimBillingCheckoutRequest, countPublishableOutboxMessages, deleteCallRecordingForRetention, deleteExpiredObjectsForBusiness, deleteStoredObjects, deleteSentProductEventsBefore, expireProspectDemos, finalizeConversationSession, loadCallSummaryInput, generateAffiliatePayoutRun, indexCrawledWebsitePage, indexDocumentText, loadBillingCheckoutRequest, loadBillingUsageEvent, loadPendingProductEvents, markBillingCheckoutCreated, markBillingCheckoutFailed, markBillingUsageSynced, markKnowledgeDocumentFailed, markProductEventsSent, reconcileBillingProviderEvent, recordAiGenerationEvent, recordCallProviderPricing, loadLiveCallForPricing, recordProductEvent, recordSmsProviderPricing, refreshBusinessSnapshot, runPrivacyRetentionSweep, updateNotificationDeliveryStatus, updateOperatorNotificationDeliveryStatus, chunkText, upsertWebsiteDocument, queueOnboardingFollowupEmail, type DurableAiUsage, type GeneratedCallSummary, type OnboardingFollowupSender } from "@lobbystack/domain";
import { deliverOutbound, markFeedbackEmailFailed, markFeedbackEmailSent, queueDailyOperatorSummaries, refreshUnitEconomicsMonth } from "@lobbystack/domain";
import { claimNumberProvisioning, completeNumberProvisioning, desiredNumberRouting, failNumberProvisioning, isSharedSmsSender, loadNumberReleaseEmail, loadNumberTrialEmail, numberProvisioningLeaseEndsAt, sharedSmsSender, sweepNumberReleases, sweepNumberTrial } from "@lobbystack/domain";
import { createWebhookSender, processWebhookDelivery, pruneApiHistory, type WebhookSender } from "@lobbystack/domain";
import { LIVE_RECORDING_ATTEMPTS, listBusinessesWithOpenLiveCalls, listOpenLiveCalls, liveCallHasRecording, persistCallRecording, retryLiveCallRecording, type OpenLiveCall } from "@lobbystack/domain";
import { expireTeamRequest } from "@lobbystack/domain";
import { syncBusinessOverage } from "@lobbystack/domain";
import { advancePartnerLifecycles, claimPartnerCheckoutRequest, keepPartnerTrialNumber, loadPartnerCheckoutRequest, loadPoolUsageEvent, markPartnerCheckoutCreated, markPartnerCheckoutFailed, partnerBillingKey, partnerCheckoutLeaseEndsAt, reconcilePartnerTier, settlePartnerNumberCharges } from "@lobbystack/domain";
import { checkPartnerCustomDomains, provisionPartnerCustomDomain, removePartnerCustomHostname, type CustomDomainProviders } from "@lobbystack/domain";
import { brandForEmail, businessExists, businessGetsHostEmails, hostBrandFromEnvironment, isHostOnlyEmailTemplate } from "@lobbystack/domain";
import type { DomainContext } from "@lobbystack/domain";
import { numberReleaseEmailSubject, numberTrialEmailSubject, type SmtpEmailProvider } from "@lobbystack/providers/email/smtp";
import type { RuntimeStorageProvider } from "@lobbystack/providers/storage/provider";
import type { TwilioProvider } from "@lobbystack/providers/twilio/twilioProvider";
import type OpenAI from "openai";
import { extractDocumentTextInThread, type OcrRecorder } from "./documentExtraction";
import { isLivePrototypeEnabled, type LiveRecoveryOutcome } from "./liveCalls";
import { deleteReleasedCalendarEvent, reconcileBusinessCalendar, syncAppointmentCalendar, type CalendarOperations } from "./calendarJobs";
import { refreshInstagramToken, replyToInstagramMessage, sendInstagramMessage, type InstagramOperations } from "./instagramJobs";
import { getMeter } from "@lobbystack/telemetry/node";
import { bucketOutboxBacklog, getPostHogDistinctIdForBusinessSystem, redactTelemetryProperties, type TelemetryProperties } from "@lobbystack/telemetry";

const ragMeter = getMeter("lobbystack-rag");
const extractionDuration = ragMeter.createHistogram("rag.extraction.duration_ms", { unit: "ms" });
const ocrDuration = ragMeter.createHistogram("rag.ocr.duration_ms", { unit: "ms" });
const recordOcr: OcrRecorder = (durationMs, attributes) => ocrDuration.record(durationMs, attributes);
const chunkCount = ragMeter.createHistogram("rag.chunk.count", { unit: "{chunk}" });
const embeddingDuration = ragMeter.createHistogram("rag.embedding.duration_ms", { unit: "ms" });
const embeddingFailures = ragMeter.createCounter("rag.embedding.failures", { unit: "{failure}" });
const indexDuration = ragMeter.createHistogram("rag.index.duration_ms", { unit: "ms" });
const sentProductEventRetentionMs = 7 * 24 * 60 * 60_000;
const sentProductEventRetentionBatchSize = 1_000;
const sentProductEventRetentionMaxBatches = 10;
const sentProductEventRetentionContinuationDelayMs = 10_000;
// The admin attaches a worker within seconds of a call's start, so a call this
// old with no attach lock has lost its worker.
const ORPHANED_LIVE_CALL_MIN_AGE_MS = 60_000;

type JobExecution = {
  isFinalAttempt?: boolean;
  queueJobId?: string;
  queuedAtMs?: number;
};

type ProductEventRetentionContinuation = {
  before: Date;
  chainId: string;
  sequence: number;
};

export type WorkerDependencies = {
  domain: DomainContext;
  storage?: RuntimeStorageProvider;
  email?: Pick<SmtpEmailProvider, "sendTemplate">;
  twilio?: Pick<TwilioProvider, "sendSms"> & Partial<Pick<TwilioProvider, "getMessagePricing" | "getCallPricing" | "findTrunkCall" | "releasePhoneNumber" | "verifyPhone" | "findOwnedPhoneNumber" | "purchasePhoneNumber" | "addNumberToSipTrunk" | "routeNumber" | "getPhoneNumberMonthlyPrice">>;
  twilioAlerts?: Pick<TwilioProvider, "sendSms"> & { from: string };
  polar?: { recordUsage(input: { eventName: string; externalCustomerId: string; quantity: number; timestamp: string; idempotencyKey: string; businessId: string; usageKind: string }): Promise<void>; createCheckout?(input: { productId: string; customerEmail: string; externalCustomerId: string; successUrl: string; returnUrl: string; idempotencyKey?: string }): Promise<{ checkoutUrl: string; checkoutId: string }> };
  /** Sets partners' own domains up: Cloudflare for SaaS or Caddy, as partnerFeatures decides, and DNS for partners' TXT records. Without it, their jobs are skipped. */
  customDomains?: CustomDomainProviders;
  embeddings?: { fingerprint?: string; embed(values: string[], onUsage?: (usage: DurableAiUsage) => Promise<void> | void): Promise<number[][]> };
  crawler?: { crawl(input: { url: string; limit?: number }): Promise<Array<{ url: string; title?: string; markdown?: string }>> };
  calendar?: CalendarOperations;
  /** Sends Instagram direct messages. Without it, Instagram replies are marked failed. */
  instagram?: InstagramOperations;
  productAnalytics?: { capture(events: Array<{ event: string; distinctId: string; properties: Record<string, unknown>; timestamp: string }>): Promise<void> };
  realtime?: Redis;
  /** Downloads OpenAI's stored recording of a GPT-Live session. */
  liveSessions?: Pick<OpenAI["live"]["sessions"], "downloadRecording">;
  /** Takes over an open GPT-Live call in this worker process, when its own worker died. */
  recoverLiveCall?: (call: OpenLiveCall) => Promise<LiveRecoveryOutcome>;
  /** Writes the one-line call summary. Without it, calls keep the transcript heuristic. */
  callSummarizer?: CallSummarizer;
  businessSummarizer?: BusinessSummarizer;
  businessHoursExtractor?: BusinessHoursExtractor;
  /** Sends one signed webhook. Defaults to the SSRF-guarded HTTPS sender. */
  webhookSender?: WebhookSender;
  /** Founder check-in sender. Without it, onboarding follow-up jobs are skipped. */
  onboardingFollowupSender?: OnboardingFollowupSender;
  enqueueProductEventRetentionContinuation?: (input: {
    businessId: string;
    before: Date;
    chainId: string;
    sequence: number;
    availableAt: Date;
  }) => Promise<void>;
};

export type JobResult = { status: "completed" | "skipped"; entityId?: string } | { status: "deferred"; entityId: string; retryAt: Date };

// A worker killed mid-send leaves the row leased, and BullMQ re-runs the job
// before the lease ends. Run it again once the lease ends instead of dropping it.
function retryAfterLease(leaseEndsAt: Date | null, entityId: string): JobResult {
  return leaseEndsAt ? { status: "deferred", entityId, retryAt: leaseEndsAt } : { status: "skipped", entityId };
}

const BRAND_FAILURE_LOG_INTERVAL_MS = 60_000;
let lastBrandFailureLogAt = 0;

/**
 * The brand an email goes out under, read when it's sent. When the host's
 * saved branding can't be read, a host email still goes out under the brand
 * the environment sets, as pages do; an email under a business's or a
 * partner's brand waits for the database instead of going out under the wrong one.
 */
async function emailBrand(domain: DomainContext, reference: EmailBrandReference) {
  try {
    return await brandForEmail(domain, reference);
  } catch (error) {
    if (reference.kind !== "host") throw error;
    const now = Date.now();
    if (now - lastBrandFailureLogAt >= BRAND_FAILURE_LOG_INTERVAL_MS) {
      lastBrandFailureLogAt = now;
      console.warn("[worker] Sending under the environment's branding: the saved branding could not be read.", error instanceof Error ? error.message : error);
    }
    return hostBrandFromEnvironment();
  }
}

function businessIdOrThrow(job: JobEnvelope): string {
  if (!job.businessId) {
    throw new Error(`Job ${job.type} requires a business context.`);
  }
  return job.businessId;
}

type JobWorkflowScope = "business" | "global";

function jobWorkflowScope(job: JobEnvelope): JobWorkflowScope {
  return job.businessId ? "business" : "global";
}

function productEventRetentionContinuation(job: JobEnvelope): ProductEventRetentionContinuation | undefined {
  if (job.payload.productEventRetentionContinuation !== true) return undefined;
  const before = typeof job.payload.retentionBefore === "string" ? new Date(job.payload.retentionBefore) : new Date(Number.NaN);
  const chainId = typeof job.payload.retentionChainId === "string" ? job.payload.retentionChainId : "";
  const sequence = typeof job.payload.retentionSequence === "number" ? job.payload.retentionSequence : Number.NaN;
  if (Number.isNaN(before.getTime()) || !/^[a-f0-9]{32}$/.test(chainId) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invalid product event retention continuation payload.");
  }
  return { before, chainId, sequence };
}

/**
 * Emits workflow lifecycle telemetry for a single job dispatch.
 *
 * The durable product-event sink (`recordProductEvent`) is business-scoped: it
 * runs inside `withBusinessTransaction` and reads the business row for the
 * deployment mode, and `product_events` is protected by RLS. It cannot persist
 * a row with a null `business_id`, so global jobs (for example
 * `affiliate.generatePayoutRun` or `prospectDemo.expire`) are deliberately not
 * emitted here. Persisting global workflow events requires a global-safe
 * durable sink or migration, which is out of scope for this phase; the scope is
 * carried in the signature so a global sink can be wired later without changing
 * call sites.
 */
async function recordWorkflowEvent(
  dependencies: WorkerDependencies,
  job: JobEnvelope,
  name: "workflow.started" | "workflow.failed",
  scope: JobWorkflowScope,
): Promise<void> {
  if (scope !== "business" || !job.businessId) return;
  // Recurring maintenance jobs run for every tenant, often every minute, even
  // when there is no work. Persist failures, but do not turn every scheduler
  // tick or retention continuation into another durable product event. Delayed
  // event-driven jobs remain observable because `scheduled` is not used here.
  if (name === "workflow.started" && (job.recurring === true || job.payload.productEventRetentionContinuation === true)) return;
  try {
    await recordProductEvent(dependencies.domain, {
      name,
      businessId: job.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(job.businessId),
      actorType: "worker",
      properties: { workflowName: job.type, scope },
    });
  } catch {
    // Workflow telemetry is best-effort and must never change job execution.
  }
}

async function recordBillingUsageSyncFailed(
  dependencies: WorkerDependencies,
  input: { businessId: string; provider?: "polar" | "stripe" },
): Promise<void> {
  try {
    await recordProductEvent(dependencies.domain, {
      name: "ops.billing.usage_sync_failed",
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      actorType: "worker",
      // Polar for what the host bills, Stripe for a business's overage on its partner's account.
      properties: { provider: input.provider ?? "polar" },
    });
  } catch {
    // Billing sync telemetry is best-effort and must not mask the provider error.
  }
}

/**
 * Sends Polar the overage one usage event put past its partner's pool, priced
 * at the tier's rate when the event was recorded: a meter event whose
 * quantity is that price in US cents, under the partner's customer. Polar
 * charges each event once, by its id. Usage within the pool, and usage past
 * it while the partner paid for no overage, sends nothing.
 */
async function syncPoolOverage(
  dependencies: WorkerDependencies,
  event: NonNullable<Awaited<ReturnType<typeof loadPoolUsageEvent>>>,
  polar: NonNullable<WorkerDependencies["polar"]>,
): Promise<JobResult> {
  if (event.syncStatus === "synced") return { status: "completed", entityId: event.id };
  if (event.syncStatus !== "pending" || !event.isFinal || event.overageCents <= 0 || !event.customerId) return { status: "skipped", entityId: event.id };
  if (event.usageKind !== "voice_seconds" && event.usageKind !== "chat_ai_tokens") return { status: "skipped", entityId: event.id };
  try {
    await polar.recordUsage({
      eventName: event.usageKind === "voice_seconds" ? billingMeterEventNames.partnerPoolVoiceOverage : billingMeterEventNames.partnerPoolChatOverage,
      externalCustomerId: partnerBillingKey(event.partnerId),
      quantity: event.overageCents,
      timestamp: event.createdAt.toISOString(),
      idempotencyKey: `partner-pool:${event.id}`,
      businessId: event.businessId,
      usageKind: event.usageKind,
    });
  } catch (error) {
    await recordBillingUsageSyncFailed(dependencies, { businessId: event.businessId });
    throw error;
  }
  await markBillingUsageSynced(dependencies.domain, { businessId: event.businessId, usageEventId: event.id });
  return { status: "completed", entityId: event.id };
}

/**
 * Sends Polar what a usage event owes the host: a direct business's billable
 * usage on Starter or Pro, or for usage on a partner's pool, only what it put
 * past the pool, to the partner's Polar customer.
 */
async function syncPolarUsage(
  dependencies: WorkerDependencies,
  polar: NonNullable<WorkerDependencies["polar"]>,
  input: { businessId: string; usageEventId: string },
): Promise<JobResult> {
  const pooled = await loadPoolUsageEvent(dependencies.domain, input);
  if (pooled) return await syncPoolOverage(dependencies, pooled, polar);
  const event = await loadBillingUsageEvent(dependencies.domain, input);
  if (!event) return { status: "skipped", entityId: input.usageEventId };
  if (event.syncStatus === "synced" || event.syncStatus === "succeeded") return { status: "completed", entityId: event.id };
  if (event.syncStatus === "skipped" || !event.customerId || !event.isFinal) return { status: "skipped", entityId: event.id };
  if (event.plan !== "starter" && event.plan !== "pro") return { status: "skipped", entityId: event.id };
  const knownUsageKinds: BillingUsageKind[] = ["voice_seconds", "alert_sms_segments", "outbound_call_attempts"];
  const usageKind = knownUsageKinds.includes(event.usageKind as BillingUsageKind) ? event.usageKind as BillingUsageKind : undefined;
  if (!usageKind) return { status: "skipped", entityId: event.id };
  const quantity = event.billableQuantity ?? event.quantity;
  const metered = getPolarMeteredUsagePayload(usageKind, quantity);
  try {
    await polar.recordUsage({
      eventName: metered.eventName,
      externalCustomerId: event.billingKey,
      quantity: metered.quantity,
      timestamp: event.createdAt.toISOString(),
      idempotencyKey: event.sourceKey,
      businessId: event.businessId,
      usageKind,
    });
  } catch (error) {
    // `ops.billing.usage_sync_recovered` is intentionally not emitted here.
    // `billing_usage_events.sync_status` only models pending/skipped/synced
    // (plus a legacy "succeeded" read), and `markBillingUsageSynced`
    // transitions only from "pending", so there is no durable failure state
    // to recover from. Emitting a recovery event would require a persisted
    // failed marker (schema/state change), which is out of scope for this
    // phase and must not be fabricated.
    await recordBillingUsageSyncFailed(dependencies, { businessId: event.businessId });
    throw error;
  }
  await markBillingUsageSynced(dependencies.domain, { businessId: event.businessId, usageEventId: event.id });
  return { status: "completed", entityId: event.id };
}

/**
 * Sends a partner's Stripe what a usage event of one of its businesses on a
 * package put past the business's allowance, as a meter event on the
 * partner's account. Null when the deployment has no Stripe Connect or the
 * event has no such overage, so the Polar sync decides the job's result.
 */
async function syncStripeOverage(dependencies: WorkerDependencies, input: { businessId: string; usageEventId: string }): Promise<JobResult | null> {
  if (!dependencies.domain.stripeConnect) return null;
  let outcome: Awaited<ReturnType<typeof syncBusinessOverage>>;
  try {
    outcome = await syncBusinessOverage(dependencies.domain, input);
  } catch (error) {
    await recordBillingUsageSyncFailed(dependencies, { businessId: input.businessId, provider: "stripe" });
    throw error;
  }
  if (outcome === "none") return null;
  return { status: outcome === "synced" ? "completed" : "skipped", entityId: input.usageEventId };
}

/**
 * Emits a durable outbox backlog sample for one tenant. `recordProductEvent`
 * injects `deploymentMode`; `backlogBucket` comes from the tenant-scoped count.
 * Backlog telemetry is best-effort and must never change job execution.
 */
async function recordOutboxBacklogSample(
  dependencies: WorkerDependencies,
  input: { businessId: string; backlog: number },
): Promise<void> {
  try {
    await recordProductEvent(dependencies.domain, {
      name: "ops.outbox.backlog_sample",
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
      actorType: "worker",
      properties: { backlogBucket: bucketOutboxBacklog(input.backlog) },
    });
  } catch {
    // Outbox backlog telemetry is best-effort and must not mask job failures.
  }
}

export async function handleJob(job: JobEnvelope, dependencies: WorkerDependencies, execution: JobExecution = {}): Promise<JobResult> {
  const scope = jobWorkflowScope(job);
  await recordWorkflowEvent(dependencies, job, "workflow.started", scope);
  try {
    return await dispatchJob(job, dependencies, execution);
  } catch (error) {
    await recordWorkflowEvent(dependencies, job, "workflow.failed", scope);
    throw error;
  }
}

async function dispatchJob(job: JobEnvelope, dependencies: WorkerDependencies, execution: JobExecution = {}): Promise<JobResult> {
  const businessId = job.businessId;
  switch (job.type) {
    case "phoneVerification.sendCode":
      // Texts the code an operator requested to verify the phone for SMS alerts.
      return await deliverOutbound(dependencies.domain, dependencies, { kind: "verificationCode", businessId: businessIdOrThrow(job), attemptId: String(job.payload.attemptId ?? ""), locale: String(job.payload.locale ?? "") }, execution);
    case "snapshot.refresh":
      return { status: "completed", entityId: await refreshBusinessSnapshot(dependencies.domain, { businessId: businessIdOrThrow(job) }) };
    case "business.generateSummary": {
      const businessId = businessIdOrThrow(job);
      const operatorAsked = job.payload.reason === "operator_regenerate";
      try {
        const { result, outcome } = await generateBusinessSummary(dependencies, { businessId, force: job.payload.force === true });
        if (operatorAsked) await finishBusinessSummaryRegenerate(dependencies.domain, { businessId, outcome });
        return result;
      } catch (error) {
        if (operatorAsked) await finishBusinessSummaryRegenerate(dependencies.domain, { businessId, outcome: "failed" }).catch(() => undefined);
        throw error;
      }
    }
    case "business.extractHours":
      return await extractBusinessHours(dependencies, { businessId: businessIdOrThrow(job) });
    case "knowledge.extractDocument": {
      const businessId = businessIdOrThrow(job);
      const documentId = String(job.payload.documentId);
      const source = await loadKnowledgeSource(dependencies.domain.db, { businessId, documentId });
      if (!source || !dependencies.storage) return { status: "skipped", entityId: documentId };
      let body: Uint8Array;
      try {
        body = await dependencies.storage.getObject({ key: source.objectKey });
      } catch (error) {
        await markKnowledgeDocumentFailed(dependencies.domain, { businessId, documentId });
        throw error;
      }
      let text: string;
      try {
        const extractionStartedAt = performance.now();
        text = await extractDocumentTextInThread({ body, contentType: source.contentType }, recordOcr);
        extractionDuration.record(performance.now() - extractionStartedAt, { content_type: source.contentType.split(";", 1)[0] ?? "unknown" });
      } catch (error) {
        if (execution.isFinalAttempt !== false) await markKnowledgeDocumentFailed(dependencies.domain, { businessId, documentId, error: "We couldn't read the text in this document." });
        throw error;
      }
      const result = await indexKnowledgeText(dependencies, { businessId, documentId, text });
      return { status: "completed", entityId: `${documentId}:${result.chunkCount}` };
    }
    case "knowledge.crawlWebsite": {
      const url = String(job.payload.url ?? job.payload.websiteUrl ?? "").trim();
      const documentId = typeof job.payload.documentId === "string" ? job.payload.documentId : undefined;
      const websiteIngestionJobId = typeof job.payload.websiteIngestionJobId === "string" ? job.payload.websiteIngestionJobId : undefined;
      const source = documentId ? await withBusinessTransaction(dependencies.domain.db, { businessId: businessIdOrThrow(job), actorType: "worker" }, async (tx) => (await tx.select({ revision: knowledgeDocuments.revision, status: knowledgeDocuments.status }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, documentId), eq(knowledgeDocuments.businessId, businessIdOrThrow(job)))).limit(1))[0]) : undefined;
      if (documentId && (!source || source.status !== "processing" || (typeof job.payload.revision === "number" && source.revision !== job.payload.revision))) return { status: "skipped", entityId: documentId };
      const importGuard = documentId && source ? { documentId, revision: source.revision } : undefined;

      if (!url || !dependencies.crawler) {
        if (documentId) await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, ...(source ? { expectedRevision: source.revision } : {}), error: "Website crawling is not configured." });
        // A demo's crawl that can't run here is unavailable rather than failed, so the demo can still publish without website knowledge.
        if (websiteIngestionJobId && !documentId) await updateWebsiteIngestion(dependencies.domain.db, { businessId: businessIdOrThrow(job), websiteIngestionJobId, status: url ? "unavailable" : "failed", error: url ? "Website crawling is not configured." : "The website address is missing." });
        return { status: "skipped", entityId: String(job.payload.jobId ?? "") };
      }
      const progress = async (status: string, importedCount = 0, indexedCount = 0) => {
        if (!websiteIngestionJobId) return true;
        return await withBusinessTransaction(dependencies.domain.db, { businessId: businessIdOrThrow(job), actorType: "worker" }, async tx => {
          if (importGuard) {
            const current = (await tx.select({ revision: knowledgeDocuments.revision, status: knowledgeDocuments.status }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, importGuard.documentId), eq(knowledgeDocuments.businessId, businessIdOrThrow(job)))).limit(1).for("update"))[0];
            if (!current || current.revision !== importGuard.revision || current.status !== "processing") return false;
          }
          const changed = await tx.update(websiteIngestionJobs).set({ status, importedCount, indexedCount, updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.id, websiteIngestionJobId), eq(websiteIngestionJobs.businessId, businessIdOrThrow(job)), ne(websiteIngestionJobs.status, "cancelled"), ne(websiteIngestionJobs.status, "completed"))).returning({ id: websiteIngestionJobs.id });
          return changed.length > 0;
        });
      };
      if (!await progress("crawling")) return { status: "skipped", entityId: documentId ?? websiteIngestionJobId ?? "" };
      let pages: Array<{ url: string; title?: string; markdown?: string }>;
      try {
        pages = await dependencies.crawler.crawl({ url, ...(typeof job.payload.limit === "number" ? { limit: job.payload.limit } : {}) });
      } catch (error) {
        if (execution.isFinalAttempt !== false) {
          if (documentId) await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, ...(source ? { expectedRevision: source.revision } : {}), error: "Website crawling failed." });
          if (websiteIngestionJobId && !documentId) await updateWebsiteIngestion(dependencies.domain.db, { businessId: businessIdOrThrow(job), websiteIngestionJobId, status: "failed", error: "Website crawling failed." });
        }
        throw error;
      }
      let indexedChunks = 0;
      let indexedPages = 0;
      let failedPages = 0;
      let pageError: unknown;
      if (!await progress("indexing", pages.length)) return { status: "skipped", entityId: documentId ?? websiteIngestionJobId ?? "" };
      for (const page of pages) {
        try {
          indexedChunks += await indexWebsitePage(dependencies, businessIdOrThrow(job), page, importGuard);
          indexedPages += 1;
        } catch (error) {
          // Skip the page: a job retry would pay for the whole crawl and every embedding again.
          failedPages += 1;
          pageError = error;
          // Only the name: provider errors can echo page text.
          console.error(`[knowledge] ${documentId ?? websiteIngestionJobId} page failed`, error instanceof Error ? error.name : "unknown");
        }
        if (!await progress("indexing", pages.length, indexedPages)) return { status: "skipped", entityId: documentId ?? websiteIngestionJobId ?? "" };
      }
      // Nothing indexed and pages failing points at an outage, such as the embedding provider's, so the job tries again.
      if (indexedChunks === 0 && failedPages && execution.isFinalAttempt === false) throw pageError;
      if (indexedChunks === 0 && documentId) {
        await markKnowledgeDocumentFailed(dependencies.domain, { businessId: businessIdOrThrow(job), documentId, ...(source ? { expectedRevision: source.revision } : {}), error: failedPages ? "We couldn't index any page of this website." : "Website crawl returned no readable content." });
      }
      if (indexedChunks > 0) {
        await withBusinessTransaction(dependencies.domain.db, { businessId: businessIdOrThrow(job), actorType: "worker" }, async tx => {
          if (importGuard) {
            const changed = await tx.update(knowledgeDocuments).set({ status: "indexed", processingProgress: 100, revision: importGuard.revision + 1, updatedAt: new Date() }).where(and(eq(knowledgeDocuments.id, importGuard.documentId), eq(knowledgeDocuments.businessId, businessIdOrThrow(job)), eq(knowledgeDocuments.status, "processing"), eq(knowledgeDocuments.revision, importGuard.revision))).returning({ id: knowledgeDocuments.id });
            if (!changed.length) return;
          }
          if (websiteIngestionJobId) {
            await tx.update(websiteIngestionJobs).set({ status: "completed", importedCount: pages.length, indexedCount: indexedPages, errorCount: failedPages, lastError: failedPages ? `We couldn't index ${failedPages} of ${pages.length} pages.` : null, updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.id, websiteIngestionJobId), eq(websiteIngestionJobs.businessId, businessIdOrThrow(job)), ne(websiteIngestionJobs.status, "cancelled")));
            await enqueueOutbox(tx, { topic: "snapshot.refresh", businessId: businessIdOrThrow(job), aggregateType: "website_ingestion_job", aggregateId: websiteIngestionJobId, dedupeKey: `website-ingestion:${websiteIngestionJobId}:snapshot:${source?.revision ?? 0}`, payload: { businessId: businessIdOrThrow(job), reason: "website_ingestion_completed" } });
            await enqueueKnowledgeDerivedRefresh(tx, { businessId: businessIdOrThrow(job), reason: "website_ingestion_completed" });
          }
        });
      } else if (websiteIngestionJobId && !documentId) {
        await updateWebsiteIngestion(dependencies.domain.db, { businessId: businessIdOrThrow(job), websiteIngestionJobId, status: "failed", error: "Website crawl returned no readable content." });
      }
      return { status: "completed", entityId: `${String(job.payload.jobId ?? job.jobId)}:${indexedChunks}` };
    }
    case "knowledge.reembedBusiness": {
      const businessId = businessIdOrThrow(job);
      const fingerprint = dependencies.embeddings?.fingerprint;
      if (!dependencies.embeddings || !fingerprint) return { status: "skipped", entityId: businessId };
      const batchSize = 64;
      let reembedded = 0;
      while (true) {
        const rows = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) =>
          await tx.select({ id: knowledgeChunks.id, content: knowledgeChunks.content })
            .from(knowledgeChunks)
            .where(and(eq(knowledgeChunks.businessId, businessId), or(isNull(knowledgeChunks.embeddingFingerprint), ne(knowledgeChunks.embeddingFingerprint, fingerprint), isNull(knowledgeChunks.embedding), eq(knowledgeChunks.embeddingStatus, "pending"), eq(knowledgeChunks.embeddingStatus, "failed"))))
            .limit(batchSize),
        );
        if (rows.length === 0) break;
        const rowIds = rows.map((row) => row.id);
        let embeddings: number[][];
        try {
          await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
            await tx.update(knowledgeChunks).set({ embeddingStatus: "pending", embeddingError: null, updatedAt: new Date() }).where(and(eq(knowledgeChunks.businessId, businessId), inArray(knowledgeChunks.id, rowIds)));
          });
          embeddings = await dependencies.embeddings.embed(rows.map((row) => row.content));
          if (embeddings.length !== rows.length) throw new Error("Embedding provider returned an incomplete re-embedding batch.");
          if (embeddings.some((embedding) => embedding.length !== 1536 || embedding.some((value) => !Number.isFinite(value)) || embedding.every((value) => value === 0))) {
            throw new Error("Embedding provider returned an incompatible re-embedding vector.");
          }
        } catch (error) {
          await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
            await tx.update(knowledgeChunks).set({ embeddingStatus: "failed", embeddingError: error instanceof Error ? error.message.slice(0, 1000) : "Embedding failed.", updatedAt: new Date() }).where(and(eq(knowledgeChunks.businessId, businessId), inArray(knowledgeChunks.id, rowIds)));
          });
          throw error;
        }
        await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          for (const [index, row] of rows.entries()) {
            const embedding = embeddings[index];
            if (!embedding) throw new Error("Embedding provider returned an incompatible re-embedding vector.");
            await tx.update(knowledgeChunks).set({ embedding, embeddingFingerprint: fingerprint, embeddingStatus: "completed", embeddingError: null, updatedAt: new Date() }).where(and(eq(knowledgeChunks.id, row.id), eq(knowledgeChunks.businessId, businessId)));
          }
        });
        reembedded += rows.length;
      }
      return { status: reembedded > 0 ? "completed" : "skipped", entityId: `${businessId}:${reembedded}` };
    }
    case "calendar.syncAppointment":
      return await syncAppointmentCalendar(dependencies, { businessId: businessIdOrThrow(job), appointmentId: String(job.payload.appointmentId ?? "") });
    case "calendar.reconcileBusiness":
      return await reconcileBusinessCalendar(dependencies, businessIdOrThrow(job));
    case "calendar.deleteEvent":
      return await deleteReleasedCalendarEvent(dependencies, { businessId: businessIdOrThrow(job), appointmentId: String(job.payload.appointmentId ?? ""), connectionId: String(job.payload.connectionId ?? ""), calendarId: String(job.payload.calendarId ?? ""), eventId: String(job.payload.eventId ?? "") });
    case "email.send":
    case "email.sendNotice":
      if (!dependencies.email) {
        if (["verify_email", "password_reset", "existing_account", "account_setup"].includes(String(job.payload.template))) {
          throw new Error("Authentication email delivery requires SMTP configuration.");
        }
        return { status: "skipped" };
      }
      {
        const template = job.payload.template === "existing_account" || job.payload.template === "account_setup" || job.payload.template === "verify_email" || job.payload.template === "password_reset" || job.payload.template === "invitation" || job.payload.template === "operator_alert" || job.payload.template === "feedback_submission" || job.payload.template === "onboarding_followup" || job.payload.template === "partner_pool_alert" || job.payload.template === "business_allowance_alert" || job.payload.template === "partner_business_allowance_alert" || (job.type === "email.sendNotice" && (job.payload.template === "business_released" || job.payload.template === "business_deleted"))
          ? job.payload.template
          : "operator_alert";
        const variables = typeof job.payload.variables === "object" && job.payload.variables !== null
          ? Object.fromEntries(Object.entries(job.payload.variables).map(([key, value]) => [key, String(value)]))
          : { message: String(job.payload.message ?? ""), url: String(job.payload.url ?? "") };
        const feedbackSubmissionId = typeof job.payload.feedbackSubmissionId === "string" ? job.payload.feedbackSubmissionId : undefined;
        // The host's own emails, such as the founder's check-in, never reach a partner's business, whenever they were queued.
        if (businessId && isHostOnlyEmailTemplate(template) && !await businessGetsHostEmails(dependencies.domain.db, businessId)) return { status: "skipped", entityId: businessId };
        try {
          // An email queued before payloads carried a brand goes out under the host's.
          const reference = parseEmailBrandReference(job.payload.brand);
          // A business deleted after it queued this email has no one left to write to, and its brand went with it.
          // A pool alert only rode in the business's outbox: it's for the partner's owners and admins, who are still there.
          const about = reference.kind === "business" ? reference.businessId : template === "partner_pool_alert" ? null : businessId;
          if (about && !await businessExists(dependencies.domain.db, about)) return { status: "skipped", entityId: about };
          const brand = await emailBrand(dependencies.domain, reference);
          const sent = await dependencies.email.sendTemplate({
            template,
            to: String(job.payload.to ?? job.payload.email ?? ""),
            // Without a subject of its own, the template writes one under the brand.
            ...(job.payload.subject === undefined || job.payload.subject === null ? {} : { subject: String(job.payload.subject) }),
            variables,
            brand,
            idempotencyKey: job.idempotencyKey,
            ...emailSender(brand, {
              from: typeof job.payload.from === "string" ? job.payload.from : null,
              replyTo: typeof job.payload.replyTo === "string" ? job.payload.replyTo : null,
            }),
          });
          if (feedbackSubmissionId) await markFeedbackEmailSent(dependencies.domain, { feedbackSubmissionId, ...(businessId ? { businessId } : {}), providerMessageId: sent.messageId });
        } catch (error) {
          if (feedbackSubmissionId) await markFeedbackEmailFailed(dependencies.domain, { feedbackSubmissionId, ...(businessId ? { businessId } : {}), error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
          throw error;
        }
      }
      return { status: "completed" };
    case "sms.send":
      return await deliverOutbound(dependencies.domain, dependencies, { kind: "message", businessId: businessIdOrThrow(job), messageId: String(job.payload.messageId ?? "") }, execution);
    case "instagram.reply":
      return await replyToInstagramMessage(dependencies.domain, job);
    case "instagram.send":
      return await sendInstagramMessage(dependencies.domain, job, dependencies.instagram, execution);
    case "instagram.refreshToken":
      return await refreshInstagramToken(dependencies.domain, job, dependencies.instagram);
    case "appointment.sendChangeOtp":
      return await deliverOutbound(dependencies.domain, dependencies, { kind: "changeCode", businessId: businessIdOrThrow(job), verificationId: String(job.payload.verificationId ?? ""), code: String(job.payload.code ?? ""), to: String(job.payload.to ?? ""), from: String(job.payload.from ?? "") }, execution);
    case "sms.syncPrice": {
      const providerMessageId = String(job.payload.providerMessageId ?? "").trim();
      const providerStatus = String(job.payload.providerStatus ?? "").trim();
      if (!dependencies.twilio?.getMessagePricing || !providerMessageId || !isTerminalSmsStatus(providerStatus)) return { status: "skipped", entityId: providerMessageId };
      const pricing = await dependencies.twilio.getMessagePricing({ providerMessageId });
      if (pricing.providerCostUsd === undefined || pricing.providerNumSegments === undefined) throw new Error(`Twilio SMS pricing is incomplete for ${providerMessageId}.`);
      const businessId = businessIdOrThrow(job);
      const notificationId = typeof job.payload.notificationId === "string" ? job.payload.notificationId : undefined;
      const operatorDeliveryId = typeof job.payload.operatorDeliveryId === "string" ? job.payload.operatorDeliveryId : undefined;
      const recorded = notificationId
        ? await updateNotificationDeliveryStatus(dependencies.domain, { businessId, notificationId, providerMessageId, providerStatus, ...pricing })
        : operatorDeliveryId
          ? await updateOperatorNotificationDeliveryStatus(dependencies.domain, { businessId, deliveryId: operatorDeliveryId, providerMessageId, providerStatus, ...pricing })
          : await recordSmsProviderPricing(dependencies.domain, { businessId, providerMessageId, ...pricing });
      return { status: recorded ? "completed" : "skipped", entityId: providerMessageId };
    }
    case "call.syncPrice": {
      const liveCallId = String(job.payload.callId ?? "").trim();
      if (liveCallId && !job.payload.providerCallId) {
        // A GPT-Live phone call: find the Twilio call on the SIP trunk first.
        const trunkSid = process.env.TWILIO_SIP_TRUNK_SID?.trim();
        if (!dependencies.twilio?.getCallPricing || !dependencies.twilio.findTrunkCall || !trunkSid) return { status: "skipped", entityId: liveCallId };
        const businessId = businessIdOrThrow(job);
        const call = await loadLiveCallForPricing(dependencies.domain, { businessId, callId: liveCallId });
        if (!call) return { status: "skipped", entityId: liveCallId };
        const twilioCallId = await dependencies.twilio.findTrunkCall({ trunkSid, near: call.startedAt, ...(call.callerPhone ? { from: call.callerPhone } : {}) });
        if (!twilioCallId) throw new Error(`No Twilio call found yet for live call ${liveCallId}.`);
        const pricing = await dependencies.twilio.getCallPricing({ providerCallId: twilioCallId });
        if (pricing.providerCostUsd === undefined) throw new Error(`Twilio call pricing is incomplete for ${twilioCallId}.`);
        const recorded = await recordCallProviderPricing(dependencies.domain, { businessId, providerCallId: twilioCallId, callId: liveCallId, ...pricing });
        return { status: recorded ? "completed" : "skipped", entityId: liveCallId };
      }
      const providerCallId = String(job.payload.providerCallId ?? "").trim();
      const providerCallStatus = String(job.payload.providerCallStatus ?? "").trim();
      if (!dependencies.twilio?.getCallPricing || !providerCallId || !isTerminalCallStatus(providerCallStatus)) return { status: "skipped", entityId: providerCallId };
      const pricing = await dependencies.twilio.getCallPricing({ providerCallId });
      if (pricing.providerCostUsd === undefined) throw new Error(`Twilio call pricing is incomplete for ${providerCallId}.`);
      const recorded = await recordCallProviderPricing(dependencies.domain, { businessId: businessIdOrThrow(job), providerCallId, ...pricing });
      return { status: recorded ? "completed" : "skipped", entityId: providerCallId };
    }
    case "call.saveRecording": {
      // Copies OpenAI's stored stereo recording into our storage so it follows
      // the plan's retention like every other call recording.
      const businessId = businessIdOrThrow(job);
      const callId = String(job.payload.callId ?? "");
      const sessionId = String(job.payload.sessionId ?? "");
      const attempt = Number(job.payload.attempt) || 1;
      if (!dependencies.storage || !dependencies.liveSessions || !callId || !sessionId) return { status: "skipped", entityId: callId };
      // Delivery is at least once, so a repeated job finds the copy made.
      if (await liveCallHasRecording(dependencies.domain, { businessId, callId })) return { status: "skipped", entityId: callId };
      let body: Uint8Array;
      try {
        body = new Uint8Array(await (await dependencies.liveSessions.downloadRecording(sessionId)).arrayBuffer());
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : undefined;
        // 404 and 409 mean OpenAI hasn't finished the recording; anything else won't get better.
        if (status === 404 || status === 409) {
          if (attempt < LIVE_RECORDING_ATTEMPTS) {
            await retryLiveCallRecording(dependencies.domain, { businessId, callId, sessionId, attempt: attempt + 1 });
            return { status: "skipped", entityId: `${callId}:retry:${attempt + 1}` };
          }
          console.error(`[live] ${sessionId} recording never became available`);
        } else {
          console.error(`[live] ${sessionId} recording unavailable`, error instanceof Error ? error.message : error);
        }
        return { status: "skipped", entityId: callId };
      }
      // A storage or database failure throws, so the queue retries the job.
      await persistCallRecording(dependencies.domain, { businessId, callId, contentType: "audio/wav", body }, dependencies.storage);
      return { status: "completed", entityId: callId };
    }
    case "live.recoverOrphans": {
      // One job for all businesses. A job with a business comes from a
      // per-business scheduler of an older release, so it would repeat that
      // sweep once per business. Without GPT-Live there are no calls, and
      // without Redis no attach lock to tell a dead owner from a live one.
      if (job.businessId || !isLivePrototypeEnabled() || !dependencies.recoverLiveCall || dependencies.realtime?.status !== "ready") return { status: "skipped" };
      const startedBefore = new Date(Date.now() - ORPHANED_LIVE_CALL_MIN_AGE_MS);
      const outcomes: string[] = [];
      for (const businessId of await listBusinessesWithOpenLiveCalls(dependencies.domain, { startedBefore })) {
        // One business that fails to list doesn't hold up recovery for the rest.
        const open = await listOpenLiveCalls(dependencies.domain, { businessId, startedBefore }).catch((error: unknown) => {
          console.error(`[live] ${businessId} open call listing failed`, error instanceof Error ? error.message : error);
          return [];
        });
        for (const call of open) {
          outcomes.push(await dependencies.recoverLiveCall(call).catch((error: unknown) => {
            console.error(`[live] ${call.sessionId} recovery failed`, error instanceof Error ? error.message : error);
            return "failed";
          }));
        }
      }
      const acted = outcomes.filter((outcome) => outcome === "attached" || outcome === "finished").length;
      return { status: acted > 0 ? "completed" : "skipped", entityId: String(acted) };
    }
    case "billing.syncUsage": {
      const usageEventId = String(job.payload.usageEventId ?? "");
      const businessId = usageEventId ? businessIdOrThrow(job) : null;
      const polarClient = dependencies.polar;
      // A business on a package owes its partner's Stripe for its own overage, whatever the event owes Polar.
      // Each half runs whatever happens to the other, so a partner's Stripe that keeps failing never holds
      // back the host's own Polar bill. The job then fails, and its retry sends only what's still pending.
      const failures: unknown[] = [];
      const attempt = async (half: () => Promise<JobResult | null>): Promise<JobResult | null> => {
        try {
          return await half();
        } catch (error) {
          failures.push(error);
          return null;
        }
      };
      const stripe = businessId ? await attempt(async () => await syncStripeOverage(dependencies, { businessId, usageEventId })) : null;
      const polar = businessId && polarClient ? await attempt(async () => await syncPolarUsage(dependencies, polarClient, { businessId, usageEventId })) : null;
      if (failures.length) throw failures[0];
      if (stripe?.status === "completed") return stripe;
      return polar ?? stripe ?? (polarClient ? { status: "skipped" } : { status: "skipped", entityId: usageEventId });
    }
    case "billing.reconcile": {
      const providerEventId = String(job.payload.providerEventId ?? "");
      if (!providerEventId) return { status: "skipped" };
      const reconciled = await reconcileBillingProviderEvent(dependencies.domain, { businessId: businessIdOrThrow(job), providerEventId });
      return { status: reconciled ? "completed" : "skipped", entityId: providerEventId };
    }
    case "billing.refreshUnitEconomics": {
      const businessId = businessIdOrThrow(job);
      const monthKey = typeof job.payload.monthKey === "string" ? job.payload.monthKey : undefined;
      const rollupId = await refreshUnitEconomicsMonth(dependencies.domain, { businessId, ...(monthKey ? { monthKey } : {}) });
      return { status: "completed", entityId: rollupId };
    }
    case "billing.createCheckout": {
      const businessId = businessIdOrThrow(job);
      const requestId = String(job.payload.requestId ?? "");
      if (!requestId) return { status: "skipped", entityId: requestId };
      if (!await claimBillingCheckoutRequest(dependencies.domain, { businessId, requestId })) return retryAfterLease(await billingCheckoutLeaseEndsAt(dependencies.domain, { businessId, requestId }), requestId);
      if (!dependencies.polar?.createCheckout) {
        await markBillingCheckoutFailed(dependencies.domain, { businessId, requestId, error: "Billing checkout provider is not configured." });
        return { status: "skipped", entityId: requestId };
      }
      const request = await loadBillingCheckoutRequest(dependencies.domain, { businessId, requestId });
      if (!request) return { status: "skipped", entityId: requestId };
      try {
        const appUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
        const planUrl = `${appUrl}/${request.onboardingStage === "complete" ? "settings/plan" : "onboarding/plan"}`;
        const checkout = await dependencies.polar.createCheckout({
          productId: polarCheckoutProductId(request.target, request.billingInterval),
          customerEmail: request.customerEmail,
          externalCustomerId: request.externalCustomerId,
          successUrl: `${appUrl}/billing/success?requestId=${encodeURIComponent(requestId)}`,
          // Polar's back arrow. Someone leaving checkout hasn't paid, so it
          // returns to the plan page without the success marker.
          returnUrl: planUrl,
          idempotencyKey: `billing-checkout:${requestId}`,
        });
        await markBillingCheckoutCreated(dependencies.domain, { businessId, requestId, ...checkout });
        return { status: "completed", entityId: requestId };
      } catch (error) {
        await markBillingCheckoutFailed(dependencies.domain, { businessId, requestId, error: "Polar checkout creation failed." });
        throw error;
      }
    }
    case "billing.createPartnerCheckout": {
      // A partner's tier belongs to no business, so the job names the partner.
      const partnerId = String(job.payload.partnerId ?? "");
      const requestId = String(job.payload.requestId ?? "");
      if (!isUuid(partnerId) || !isUuid(requestId)) return { status: "skipped", entityId: requestId };
      const request = { partnerId, requestId };
      if (!await claimPartnerCheckoutRequest(dependencies.domain, request)) return retryAfterLease(await partnerCheckoutLeaseEndsAt(dependencies.domain, request), requestId);
      if (!dependencies.polar?.createCheckout) {
        await markPartnerCheckoutFailed(dependencies.domain, { ...request, error: "Billing checkout provider is not configured." });
        return { status: "skipped", entityId: requestId };
      }
      const checkoutRequest = await loadPartnerCheckoutRequest(dependencies.domain, request);
      if (!checkoutRequest) return { status: "skipped", entityId: requestId };
      const productId = partnerTierProductId(process.env, checkoutRequest.tier, checkoutRequest.billingInterval);
      if (!productId) {
        await markPartnerCheckoutFailed(dependencies.domain, { ...request, error: "The tier's Polar product is not configured." });
        return { status: "skipped", entityId: requestId };
      }
      try {
        const billingUrl = `${checkoutRequest.returnOrigin}/partner/${partnerId}/billing`;
        const checkout = await dependencies.polar.createCheckout({
          productId,
          customerEmail: checkoutRequest.customerEmail,
          externalCustomerId: checkoutRequest.externalCustomerId,
          successUrl: `${billingUrl}?checkout=${encodeURIComponent(requestId)}`,
          // Polar's back arrow: someone leaving checkout hasn't paid, so they land on the page they left.
          returnUrl: billingUrl,
          idempotencyKey: `partner-checkout:${requestId}`,
        });
        await markPartnerCheckoutCreated(dependencies.domain, { ...request, ...checkout });
        return { status: "completed", entityId: requestId };
      } catch (error) {
        await markPartnerCheckoutFailed(dependencies.domain, { ...request, error: "Polar checkout creation failed." });
        throw error;
      }
    }
    case "billing.reconcilePartner": {
      const partnerId = String(job.payload.partnerId ?? "");
      const providerEventId = String(job.payload.providerEventId ?? "");
      if (!isUuid(partnerId) || !isUuid(providerEventId)) return { status: "skipped", entityId: providerEventId };
      const reconciled = await reconcilePartnerTier(dependencies.domain, { partnerId, providerEventId });
      // A tier the partner now pays for keeps its trial number. A retry converts it if this run died first.
      if (reconciled) await keepPartnerTrialNumber(dependencies.domain, { partnerId });
      return { status: reconciled ? "completed" : "skipped", entityId: providerEventId };
    }
    case "billing.chargePartnerNumbers": {
      // Polar charges a partner, under its own customer, what the host pays for each month of each number past its tier's included ones.
      // A deployment that bills no tiers charges no month, so its months settle without Polar.
      const tierBilling = partnerFeatures(process.env).tierBilling;
      const polar = dependencies.polar;
      if (tierBilling && !polar) return { status: "skipped" };
      const result = await settlePartnerNumberCharges(dependencies.domain, {
        tierBilling,
        report: async (charge) => {
          if (!polar) throw new Error("Polar isn't configured, so a partner's extra number can't be charged.");
          await polar.recordUsage({
            eventName: billingMeterEventNames.partnerExtraNumbers,
            externalCustomerId: partnerBillingKey(charge.partnerId),
            quantity: charge.amountCents,
            timestamp: charge.periodStart.toISOString(),
            idempotencyKey: charge.idempotencyKey,
            businessId: charge.businessId,
            usageKind: "partner_extra_number",
          });
        },
      });
      return { status: result.settled > 0 ? "completed" : "skipped", entityId: `${result.settled}:${result.charged}` };
    }
    case "partnerLifecycle.advance": {
      // The clock moves each partner whose tier ended on: its businesses pause after 30 days, and at 90 the host deletes them.
      const result = await advancePartnerLifecycles(dependencies.domain);
      return { status: result.moved > 0 || result.deleted > 0 ? "completed" : "skipped", entityId: `${result.moved}:${result.deleted}` };
    }
    case "partnerDomain.provision": {
      // A partner's domain belongs to no business, so the job names it.
      const domainId = String(job.payload.domainId ?? "");
      if (!isUuid(domainId) || !dependencies.customDomains) return { status: "skipped", entityId: domainId };
      const outcome = await provisionPartnerCustomDomain(dependencies.domain, dependencies.customDomains, { domainId });
      return { status: outcome === "provisioned" ? "completed" : "skipped", entityId: domainId };
    }
    case "partnerDomain.check": {
      if (!dependencies.customDomains) return { status: "skipped" };
      // A domain the provider or DNS couldn't answer for waits for its next check; only a run where nothing answered fails.
      const result = await checkPartnerCustomDomains(dependencies.domain, dependencies.customDomains);
      return { status: result.checked > 0 ? "completed" : "skipped", entityId: `${result.checked}:${result.activated}:${result.failed}:${result.unanswered}` };
    }
    case "partnerDomain.remove": {
      const hostname = String(job.payload.hostname ?? "");
      const providerHostnameId = String(job.payload.providerHostnameId ?? "");
      // A domain another provider set up stays with it: this deployment can't reach that provider any more.
      const hostnames = dependencies.customDomains?.hostnames;
      if (!hostname || !providerHostnameId || !hostnames || job.payload.provider !== hostnames.kind) return { status: "skipped", entityId: providerHostnameId };
      const outcome = await removePartnerCustomHostname(dependencies.domain, hostnames, { hostname, providerHostnameId });
      return { status: outcome === "removed" ? "completed" : "skipped", entityId: providerHostnameId };
    }
    case "notification.dispatch": {
      const businessId = businessIdOrThrow(job);
      const operatorDeliveryId = String(job.payload.operatorDeliveryId ?? "");
      return await deliverOutbound(dependencies.domain, dependencies, operatorDeliveryId ? { kind: "operatorNotification", businessId, deliveryId: operatorDeliveryId } : { kind: "notification", businessId, notificationId: String(job.payload.notificationId ?? "") }, execution);
    }
    case "notification.dailySummary": {
      const businessId = businessIdOrThrow(job);
      const result = await queueDailyOperatorSummaries(dependencies.domain, { businessId });
      return { status: result.queued > 0 ? "completed" : "skipped", entityId: `${businessId}:${result.queued}` };
    }
    case "conversation.finalizeSession": {
      const callId = String(job.payload.callId ?? "");
      if (!callId) return { status: "skipped" };
      const businessId = businessIdOrThrow(job);
      const generated = await generateCallSummary(dependencies, { businessId, callId });
      const result = await finalizeConversationSession(dependencies.domain, { businessId, callId, ...(generated ? { generated } : {}) });
      return { status: result.finalized ? "completed" : "skipped", entityId: result.sessionId ?? callId };
    }
    case "conversation.expireTeamRequest": {
      // A website visitor asked for a person: hand the chat back to the receptionist if nobody joined.
      const conversationId = String(job.payload.conversationId ?? "");
      const requestedAt = new Date(String(job.payload.requestedAt ?? ""));
      if (!conversationId || !Number.isFinite(requestedAt.getTime())) return { status: "skipped" };
      const businessId = businessIdOrThrow(job);
      const result = await expireTeamRequest(dependencies.domain, { businessId, conversationId, requestedAt, locale: normalizeRuntimeLocale(typeof job.payload.locale === "string" ? job.payload.locale : undefined) });
      return { status: result.expired ? "completed" : "skipped", entityId: conversationId };
    }
    case "privacy.scrubMessage": {
      const businessId = businessIdOrThrow(job);
      const continuation = productEventRetentionContinuation(job);
      const result = continuation ? undefined : await runPrivacyRetentionSweep(dependencies.domain, { businessId });
      const queuedAtMs = execution.queuedAtMs ?? Date.now();
      const before = continuation?.before ?? new Date(queuedAtMs - sentProductEventRetentionMs);
      const chainId = continuation?.chainId ?? createHash("sha256")
        .update(`${businessId}:${execution.queueJobId ?? job.jobId}:${queuedAtMs}`)
        .digest("hex")
        .slice(0, 32);
      let deleted = 0;
      let hasMore = false;
      for (let batch = 0; batch < sentProductEventRetentionMaxBatches; batch += 1) {
        const batchDeleted = await deleteSentProductEventsBefore(dependencies.domain, {
          businessId,
          before,
          limit: sentProductEventRetentionBatchSize,
        });
        deleted += batchDeleted;
        hasMore = batchDeleted === sentProductEventRetentionBatchSize;
        if (!hasMore) break;
      }
      if (hasMore) {
        const nextSequence = (continuation?.sequence ?? 0) + 1;
        if (!dependencies.enqueueProductEventRetentionContinuation) {
          throw new Error("Product event retention continuation queue is not configured.");
        }
        await dependencies.enqueueProductEventRetentionContinuation({
          businessId,
          before,
          chainId,
          sequence: nextSequence,
          availableAt: new Date(Date.now() + sentProductEventRetentionContinuationDelayMs),
        });
      }
      return {
        status: "completed",
        entityId: result ? JSON.stringify(result) : `${businessId}:${deleted}`,
      };
    }
    case "privacy.deleteRecording": {
      if (!dependencies.storage) return { status: "skipped", entityId: String(job.payload.callId ?? "") };
      const callId = String(job.payload.callId ?? "");
      const objectId = typeof job.payload.objectId === "string" ? job.payload.objectId : undefined;
      const input = { businessId: businessIdOrThrow(job), callId, ...(objectId ? { objectId } : {}) };
      // Only the retention sweep queues this job, so the retention switch always applies.
      const deleted = await deleteCallRecordingForRetention(dependencies.domain, input, dependencies.storage);
      return { status: deleted ? "completed" : "skipped", entityId: callId };
    }
    case "privacy.deleteStoredObjects": {
      // Queued when a business is deleted, so the job names no business.
      const objectKeys = Array.isArray(job.payload.objectKeys) ? job.payload.objectKeys.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
      if (!dependencies.storage || objectKeys.length === 0) return { status: "skipped", entityId: String(objectKeys.length) };
      const deleted = await deleteStoredObjects(dependencies.storage, objectKeys);
      return { status: "completed", entityId: String(deleted) };
    }
    case "privacy.cleanupPendingUpload": {
      if (!dependencies.storage) return { status: "skipped", entityId: businessIdOrThrow(job) };
      const deleted = await deleteExpiredObjectsForBusiness(dependencies.domain, { businessId: businessIdOrThrow(job) }, dependencies.storage);
      return { status: deleted > 0 ? "completed" : "skipped", entityId: String(deleted) };
    }
    case "phoneNumber.provision": {
      const businessId = businessIdOrThrow(job); const claimId = String(job.payload.claimId ?? "");
      if (!claimId || !dependencies.twilio?.findOwnedPhoneNumber || !dependencies.twilio.purchasePhoneNumber) return { status: "skipped", entityId: claimId };
      // Calls reach GPT-Live only through the Twilio SIP trunk. A number off the
      // trunk has nothing to answer it, so refuse to buy one without a trunk.
      const sipTrunkSid = process.env.TWILIO_SIP_TRUNK_SID?.trim();
      if (!sipTrunkSid) throw new Error("TWILIO_SIP_TRUNK_SID is required to provision a phone number. See docs/voice/runtime.md.");
      if (!dependencies.twilio.addNumberToSipTrunk) throw new Error("The Twilio provider can't assign numbers to a SIP trunk.");
      const addNumberToSipTrunk = dependencies.twilio.addNumberToSipTrunk.bind(dependencies.twilio);
      const claim = await claimNumberProvisioning(dependencies.domain, { businessId, claimId });
      // A worker killed mid-purchase leaves the claim provisioning. Retry once its lease ends instead of leaving it stuck.
      if (!claim) return retryAfterLease(await numberProvisioningLeaseEndsAt(dependencies.domain, { businessId, claimId }), claimId);
      const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const smsUrl = `${baseUrl}/api/webhooks/twilio/sms`; const statusCallbackUrl = `${baseUrl}/api/webhooks/twilio/status`;
      let purchased = false; let providerPhoneId: string | undefined;
      try {
        // A number that counts against a partner's tier costs the partner what the host pays for it, so read that before buying it.
        let monthlyCostCents: number | undefined;
        if (claim.countsForPartner) {
          const kind = claim.selection?.kind;
          if (!dependencies.twilio.getPhoneNumberMonthlyPrice) throw new Error("The Twilio provider can't read number prices.");
          if (typeof claim.selection?.countryCode !== "string" || (kind !== "local" && kind !== "mobile" && kind !== "toll_free")) throw new Error("The number claim doesn't say which country and kind of number it buys.");
          monthlyCostCents = (await dependencies.twilio.getPhoneNumberMonthlyPrice({ countryCode: claim.selection.countryCode, kind })).monthlyCents;
        }
        const owned = await dependencies.twilio.findOwnedPhoneNumber({ e164: claim.e164 });
        if (owned) providerPhoneId = owned.providerPhoneId;
        else {
          // Twilio sells UK, Australian and New Zealand numbers only under the
          // regulatory bundle it approved for LobbyStack. See docs/voice/runtime.md.
          const country = claim.selection?.countryCode;
          const bundleSid = country === "GB" ? process.env.TWILIO_GB_BUNDLE_SID?.trim() : country === "AU" ? process.env.TWILIO_AU_BUNDLE_SID?.trim() : country === "NZ" ? process.env.TWILIO_NZ_BUNDLE_SID?.trim() : undefined;
          const addressSid = country === "AU" ? process.env.TWILIO_AU_ADDRESS_SID?.trim() : country === "NZ" ? process.env.TWILIO_NZ_ADDRESS_SID?.trim() : undefined;
          if ((country === "GB" || country === "AU" || country === "NZ") && !bundleSid) throw new Error(`TWILIO_${country}_BUNDLE_SID is required to buy a number in ${country}. See docs/voice/runtime.md.`);
          const result = await dependencies.twilio.purchasePhoneNumber({ e164: claim.e164, friendlyName: `LobbyStack ${businessId}`, smsUrl, statusCallbackUrl, ...(bundleSid ? { bundleSid } : {}), ...(addressSid ? { addressSid } : {}) });
          providerPhoneId = result.providerPhoneId; purchased = true;
        }
        await addNumberToSipTrunk({ trunkSid: sipTrunkSid, providerPhoneId });
        const phoneNumberId = await completeNumberProvisioning(dependencies.domain, { businessId, claimId, e164: claim.e164, providerPhoneId, voiceUrl: `sip-trunk:${sipTrunkSid}`, smsUrl, ...(monthlyCostCents !== undefined ? { monthlyCostCents } : {}) });
        return { status: "completed", entityId: phoneNumberId };
      } catch (error) {
        if (purchased && providerPhoneId && dependencies.twilio.releasePhoneNumber) await dependencies.twilio.releasePhoneNumber({ providerPhoneId }).catch(() => undefined);
        const { getTwilioProviderErrorCode } = await import("@lobbystack/providers/twilio/twilioProvider");
        await failNumberProvisioning(dependencies.domain, { businessId, claimId, unavailable: getTwilioProviderErrorCode(error) === 21422 });
        throw error;
      }
    }
    case "phoneNumber.reclaim": {
      const businessId = businessIdOrThrow(job);
      const phoneNumberId = String(job.payload.phoneNumberId ?? "");
      if (!phoneNumberId) {
        const queued = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          const due = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), lte(phoneNumbers.reclaimScheduledAt, new Date())));
          for (const number of due) {
            // One key per hour, so a release that failed is tried again by the next sweep.
            await enqueueOutbox(tx, { topic: "phoneNumber.reclaim", businessId, aggregateType: "phone_number", aggregateId: number.id, dedupeKey: `phone-number:${number.id}:reclaim:${new Date().toISOString().slice(0, 13)}`, payload: { phoneNumberId: number.id } });
          }
          return due.length;
        });
        return { status: queued > 0 ? "completed" : "skipped", entityId: `${businessId}:${queued}` };
      }
      // Every hosted business texts from the shared sender, so it's never released, whatever its workspace's plan.
      const sharedSender = sharedSmsSender();
      const claimed = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
        const rows = await tx.update(phoneNumbers)
          .set({ status: "reclaiming", updatedAt: new Date() })
          .where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active"), lte(phoneNumbers.reclaimScheduledAt, new Date()), ...(sharedSender ? [ne(phoneNumbers.e164, sharedSender)] : [])))
          .returning({ id: phoneNumbers.id, providerPhoneId: phoneNumbers.providerPhoneId });
        return rows[0] ?? null;
      });
      if (!claimed) return { status: "skipped", entityId: phoneNumberId };
      try {
        if (claimed.providerPhoneId) {
          if (!dependencies.twilio?.releasePhoneNumber) throw new Error("Twilio phone-number release is not configured.");
          await dependencies.twilio.releasePhoneNumber({ providerPhoneId: claimed.providerPhoneId });
        }
        await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          await tx.update(phoneNumbers).set({ status: "reclaimed", voiceEnabled: false, smsEnabled: false, reclaimScheduledAt: null, updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claimed.id), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "reclaiming")));
        });
        return { status: "completed", entityId: phoneNumberId };
      } catch (error) {
        await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
          await tx.update(phoneNumbers).set({ status: "active", updatedAt: new Date() }).where(and(eq(phoneNumbers.id, claimed.id), eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "reclaiming")));
        });
        throw error;
      }
    }
    case "phoneNumber.releaseDeleted": {
      // Queued when a business is deleted, so the job names no business and its number has no row left.
      const providerPhoneId = typeof job.payload.providerPhoneId === "string" ? job.payload.providerPhoneId : "";
      const e164 = typeof job.payload.e164 === "string" ? job.payload.e164 : null;
      if (!providerPhoneId) return { status: "skipped", entityId: "" };
      // Every hosted business texts from the shared sender, so it's never released.
      if (isSharedSmsSender(e164)) return { status: "skipped", entityId: providerPhoneId };
      if (!dependencies.twilio?.releasePhoneNumber) throw new Error("Twilio phone-number release is not configured.");
      try {
        await dependencies.twilio.releasePhoneNumber({ providerPhoneId });
      } catch (error) {
        // A number the provider no longer has is released already, such as by a reclaim that was under way.
        if ((error as { status?: unknown } | null)?.status !== 404) throw error;
        return { status: "skipped", entityId: providerPhoneId };
      }
      return { status: "completed", entityId: providerPhoneId };
    }
    case "phoneNumber.route": {
      const businessId = businessIdOrThrow(job);
      const phoneNumberId = String(job.payload.phoneNumberId ?? "");
      if (!phoneNumberId || !dependencies.twilio?.routeNumber) return { status: "skipped", entityId: phoneNumberId };
      const trunkSid = process.env.TWILIO_SIP_TRUNK_SID?.trim();
      if (!trunkSid) throw new Error("TWILIO_SIP_TRUNK_SID is required to route a phone number. See docs/voice/runtime.md.");
      // The trial decides where calls go now, whatever this job asked for, so jobs that run out of order agree.
      const desired = await desiredNumberRouting(dependencies.domain, { businessId, phoneNumberId });
      if (!desired) return { status: "skipped", entityId: phoneNumberId };
      const fallbackUrl = `${(process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/webhooks/twilio/voice`;
      await dependencies.twilio.routeNumber({ providerPhoneId: desired.providerPhoneId, trunkSid, mode: desired.mode, fallbackUrl });
      await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
        await tx.update(phoneNumbers).set({ voiceWebhookTargetUrl: desired.mode === "receptionist" ? `sip-trunk:${trunkSid}` : fallbackUrl, voiceWebhookStatus: "synced", voiceWebhookLastSyncedAt: new Date(), updatedAt: new Date() }).where(and(eq(phoneNumbers.id, phoneNumberId), eq(phoneNumbers.businessId, businessId)));
      });
      return { status: "completed", entityId: `${phoneNumberId}:${desired.mode}` };
    }
    case "numberTrial.sweep": {
      const businessId = businessIdOrThrow(job);
      const swept = await sweepNumberTrial(dependencies.domain, { businessId });
      const reminders = await sweepNumberReleases(dependencies.domain, { businessId });
      return { status: swept.ended || swept.emails.length || reminders ? "completed" : "skipped", entityId: businessId };
    }
    case "phoneNumber.releaseEmail": {
      const businessId = businessIdOrThrow(job);
      const phoneNumberId = String(job.payload.phoneNumberId ?? "");
      const kind = job.payload.kind === "canceled" ? "canceled" : "release_soon";
      if (!dependencies.email || !dependencies.onboardingFollowupSender) return { status: "skipped", entityId: phoneNumberId };
      const content = await loadNumberReleaseEmail(dependencies.domain, { businessId, phoneNumberId });
      if (!content) return { status: "skipped", entityId: phoneNumberId };
      // The host's own email, with the host's prices, from the founder. A
      // partner's businesses never get it, so its job carries no brand.
      const brand = await emailBrand(dependencies.domain, HOST_EMAIL_BRAND);
      const date = (value: unknown) => (typeof value === "string" ? new Intl.DateTimeFormat(intlLocale(content.locale), { month: "long", day: "numeric", timeZone: content.timezone }).format(new Date(value)) : "");
      const variables = {
        kind,
        locale: content.locale,
        firstName: content.firstName,
        number: content.number,
        periodEnd: date(job.payload.periodEnd),
        releaseDate: date(job.payload.releaseAt),
        url: `${brand.origin}/settings/plan`,
        senderName: dependencies.onboardingFollowupSender.name,
      };
      await dependencies.email.sendTemplate({ template: "number_release", to: content.to, subject: numberReleaseEmailSubject(variables), variables, brand, idempotencyKey: job.idempotencyKey, ...emailSender(brand, { from: dependencies.onboardingFollowupSender.from }) });
      return { status: "completed", entityId: `${phoneNumberId}:${kind}` };
    }
    case "numberTrial.sendEmail": {
      const businessId = businessIdOrThrow(job);
      const trialId = String(job.payload.trialId ?? "");
      const kind = job.payload.email;
      if (!dependencies.email || !dependencies.onboardingFollowupSender) return { status: "skipped", entityId: trialId };
      if (!trialId || (kind !== "day10" && kind !== "day13" && kind !== "ended" && kind !== "minutes_out")) throw new Error("Invalid number trial email payload.");
      const content = await loadNumberTrialEmail(dependencies.domain, { businessId, trialId, email: kind });
      if (!content) return { status: "skipped", entityId: trialId };
      // The host's own email, with the host's prices, from the founder. A
      // partner's businesses never get it, so its job carries no brand.
      const brand = await emailBrand(dependencies.domain, HOST_EMAIL_BRAND);
      const endDate = content.endsAt
        // The trial's last day is the day before endsAt, which is midnight that ends it.
        ? new Intl.DateTimeFormat(intlLocale(content.locale), { month: "long", day: "numeric", timeZone: content.timezone }).format(new Date(content.endsAt.getTime() - 1))
        : "";
      const variables = {
        kind,
        locale: content.locale,
        firstName: content.firstName,
        businessName: content.businessName,
        trialNumber: content.trialNumber,
        forwardTo: content.forwardTo ?? "",
        endDate,
        calls: String(content.callsAnswered),
        url: `${brand.origin}/settings/plan`,
        senderName: dependencies.onboardingFollowupSender.name,
      };
      await dependencies.email.sendTemplate({ template: "number_trial", to: content.to, subject: numberTrialEmailSubject(variables), variables, brand, idempotencyKey: job.idempotencyKey, ...emailSender(brand, { from: dependencies.onboardingFollowupSender.from }) });
      return { status: "completed", entityId: `${trialId}:${kind}` };
    }
    case "prospectDemo.expire": {
      const expired = await expireProspectDemos(dependencies.domain);
      return { status: expired > 0 ? "completed" : "skipped", entityId: String(expired) };
    }
    case "onboarding.sendFollowup": {
      const businessId = businessIdOrThrow(job);
      if (!dependencies.email || !dependencies.onboardingFollowupSender) return { status: "skipped" };
      const completedAt = typeof job.payload.completedAt === "string" ? new Date(job.payload.completedAt) : new Date(Number.NaN);
      if (Number.isNaN(completedAt.getTime())) throw new Error("Invalid onboarding follow-up payload.");
      const queued = await queueOnboardingFollowupEmail(dependencies.domain, { businessId, completedAt, sender: dependencies.onboardingFollowupSender });
      return { status: queued ? "completed" : "skipped", entityId: businessId };
    }
    case "affiliate.generatePayoutRun": {
      const periodKey = typeof job.payload.periodKey === "string" && job.payload.periodKey.trim() ? job.payload.periodKey.trim() : undefined;
      const createdAt = typeof job.payload.createdAt === "string" && job.payload.createdAt.trim() ? job.payload.createdAt.trim() : undefined;
      const result = await generateAffiliatePayoutRun(dependencies.domain, { ...(periodKey ? { periodKey } : {}), ...(createdAt ? { createdAt } : {}) });
      return { status: "completed", entityId: result.payoutRunId };
    }
    case "outbox.backlogSample": {
      const businessId = businessIdOrThrow(job);
      const backlog = await countPublishableOutboxMessages(dependencies.domain, { businessId });
      if (backlog <= 0) return { status: "skipped", entityId: `${businessId}:0` };
      await recordOutboxBacklogSample(dependencies, { businessId, backlog });
      return { status: "completed", entityId: `${businessId}:${bucketOutboxBacklog(backlog)}` };
    }
    case "telemetry.flush": {
      const businessId = businessIdOrThrow(job);
      if (!dependencies.productAnalytics) return { status: "skipped", entityId: businessId };
      const events = await loadPendingProductEvents(dependencies.domain, { businessId });
      if (events.length === 0) return { status: "skipped", entityId: businessId };
      await dependencies.productAnalytics.capture(events.map((event) => ({ event: event.name, distinctId: event.distinctId, properties: redactTelemetryProperties(event.properties as TelemetryProperties), timestamp: event.occurredAt.toISOString() })));
      const sent = await markProductEventsSent(dependencies.domain, { businessId, eventIds: events.map((event) => event.id) });
      return { status: sent > 0 ? "completed" : "skipped", entityId: `${businessId}:${sent}` };
    }
    case "webhook.deliver": {
      const deliveryId = String(job.payload.deliveryId ?? "");
      const attempt = Number(job.payload.attempt ?? 1);
      if (!deliveryId || !Number.isSafeInteger(attempt) || attempt < 1) return { status: "skipped" };
      const result = await processWebhookDelivery(dependencies.domain, { businessId: businessIdOrThrow(job), deliveryId, attempt, send: dependencies.webhookSender ?? defaultWebhookSender() });
      return { status: result.outcome === "succeeded" || result.outcome === "retry_scheduled" || result.outcome === "failed" ? "completed" : "skipped", entityId: `${deliveryId}:${attempt}:${result.outcome}` };
    }
    case "api.retention": {
      const businessId = businessIdOrThrow(job);
      const result = await pruneApiHistory(dependencies.domain, { businessId });
      return { status: result.events + result.idempotencyKeys > 0 ? "completed" : "skipped", entityId: `${businessId}:${result.events}:${result.idempotencyKeys}` };
    }
    case "realtime.publish": {
      if (!dependencies.realtime) return { status: "skipped" };
      const event = realtimeEventSchema.parse({ id: randomUUID(), type: String(job.payload.type ?? "document.progressed"), businessId: businessIdOrThrow(job), entityId: typeof job.payload.entityId === "string" ? job.payload.entityId : undefined, revision: typeof job.payload.revision === "number" ? job.payload.revision : undefined, occurredAt: new Date().toISOString(), payload: job.payload, trace: job.trace });
      await dependencies.realtime.publish(`${process.env.REDIS_PREFIX ?? "lobbystack"}:realtime:${event.businessId}`, JSON.stringify(event));
      return { status: "completed", ...(event.entityId ? { entityId: event.entityId } : {}) };
    }
  }
  throw new Error(`Worker handler is not configured for ${(job as JobEnvelope).type}.`);
}

let sharedWebhookSender: WebhookSender | undefined;
function defaultWebhookSender(): WebhookSender {
  sharedWebhookSender ??= createWebhookSender();
  return sharedWebhookSender;
}

async function updateWebsiteIngestion(db: Database, input: { businessId: string; websiteIngestionJobId: string; status: string; error: string }): Promise<void> {
  await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(websiteIngestionJobs).set({ status: input.status, errorCount: 1, lastError: input.error, updatedAt: new Date() }).where(and(eq(websiteIngestionJobs.id, input.websiteIngestionJobId), eq(websiteIngestionJobs.businessId, input.businessId)));
  });
}

const terminalSmsStatuses = new Set(["sent", "delivered", "undelivered", "failed", "canceled"]);
const terminalCallStatuses = new Set(["busy", "canceled", "completed", "failed", "no-answer"]);

function isTerminalSmsStatus(status: string): boolean {
  return terminalSmsStatuses.has(status.toLowerCase());
}

function isTerminalCallStatus(status: string): boolean {
  return terminalCallStatuses.has(status.toLowerCase());
}

async function loadKnowledgeSource(db: Database, input: { businessId: string; documentId: string }): Promise<{ objectKey: string; contentType: string } | null> {
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ objectKey: storageObjects.objectKey, contentType: storageObjects.contentType })
      .from(knowledgeDocuments)
      .innerJoin(storageObjects, and(eq(storageObjects.id, knowledgeDocuments.storageObjectId!), eq(storageObjects.businessId, input.businessId)))
      .where(and(eq(knowledgeDocuments.id, input.documentId), eq(knowledgeDocuments.businessId, input.businessId)))
      .limit(1))[0];
    return row ?? null;
  });
}

/**
 * Ask the text model for a one-line summary and the caller's name before the
 * call is finalized. Any failure returns undefined and finalization falls back
 * to the transcript heuristic, so a model outage never blocks the call log.
 */
async function generateCallSummary(
  dependencies: WorkerDependencies,
  input: { businessId: string; callId: string },
): Promise<GeneratedCallSummary | undefined> {
  if (!dependencies.callSummarizer) return undefined;
  const summaryInput = await loadCallSummaryInput(dependencies.domain, input);
  if (!summaryInput || !hasSummarizableTranscript(summaryInput.transcript)) return undefined;
  const startedAt = performance.now();
  try {
    const result = await dependencies.callSummarizer.summarize({
      transcript: summaryInput.transcript,
      locale: summaryInput.locale,
      disposition: summaryInput.disposition,
    });
    await recordAiGenerationEvent(dependencies.domain, {
      ...result.usage,
      businessId: input.businessId,
      operation: "call.summary",
      callId: input.callId,
      conversationId: summaryInput.conversationId,
    }).catch(() => undefined);
    return {
      ...(summaryInput.needsSummary ? { summary: result.summary } : {}),
      ...(summaryInput.needsCallerName ? { callerName: result.callerName } : {}),
    };
  } catch (error) {
    // Only a stable category is recorded: provider errors can echo transcript text.
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    await recordAiGenerationEvent(dependencies.domain, {
      ...dependencies.callSummarizer.modelId,
      businessId: input.businessId,
      operation: "call.summary",
      callId: input.callId,
      conversationId: summaryInput.conversationId,
      latencyMs: performance.now() - startedAt,
      isError: true,
      error: timedOut ? "generation_timeout" : "generation_failed",
    }).catch(() => undefined);
    return undefined;
  }
}

/**
 * Writes the business summary from its knowledge with AI. Skips a summary an
 * operator wrote, a business with no knowledge yet, and knowledge that hasn't
 * changed since the last summary unless the operator asked to regenerate.
 */
async function generateBusinessSummary(dependencies: WorkerDependencies, input: { businessId: string; force: boolean }): Promise<{ result: JobResult; outcome: SummaryRegenerateOutcome | null }> {
  const skipped = { status: "skipped", entityId: input.businessId } as const;
  const summarizer = dependencies.businessSummarizer;
  if (!summarizer) return { result: skipped, outcome: "failed" };
  const summaryInput = await loadBusinessSummaryInput(dependencies.domain, { businessId: input.businessId });
  if (!summaryInput || summaryInput.summarySource === "operator") return { result: skipped, outcome: null };
  if (!summaryInput.sources.length) {
    // Every source is gone: a generated summary would describe removed content.
    const reset = summaryInput.summarySource === "generated" && await resetGeneratedBusinessSummary(dependencies.domain, { businessId: input.businessId, businessName: summaryInput.businessName });
    return { result: { status: reset ? "completed" : "skipped", entityId: input.businessId }, outcome: "empty" };
  }
  if (!input.force && summaryInput.summarySource === "generated" && summaryInput.fingerprint === summaryInput.currentFingerprint) return { result: skipped, outcome: "completed" };
  const startedAt = performance.now();
  let summary: string | null;
  try {
    const result = await summarizer.summarize({ businessName: summaryInput.businessName, locale: summaryInput.locale, sources: summaryInput.sources });
    summary = result.summary;
    await recordAiGenerationEvent(dependencies.domain, { ...result.usage, businessId: input.businessId, operation: "business.summary" }).catch(() => undefined);
  } catch (error) {
    // Only a stable category is recorded: provider errors can echo source text.
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    await recordAiGenerationEvent(dependencies.domain, { ...summarizer.modelId, businessId: input.businessId, operation: "business.summary", latencyMs: performance.now() - startedAt, isError: true, error: timedOut ? "generation_timeout" : "generation_failed" }).catch(() => undefined);
    throw error;
  }
  if (!summary) return { result: skipped, outcome: "empty" };
  const saved = await saveGeneratedBusinessSummary(dependencies.domain, { businessId: input.businessId, summary, fingerprint: summaryInput.fingerprint });
  return { result: { status: saved ? "completed" : "skipped", entityId: input.businessId }, outcome: saved ? "completed" : null };
}

/**
 * Fills the opening hours with AI from the passages of the knowledge sources
 * that look like they state them. Skips hours a person set, knowledge with no
 * such passage, and passages already read. Hours the sources no longer state
 * stay as they are: removing them would stop booking again.
 */
async function extractBusinessHours(dependencies: WorkerDependencies, input: { businessId: string }): Promise<JobResult> {
  const extractor = dependencies.businessHoursExtractor;
  if (!extractor) return { status: "skipped", entityId: input.businessId };
  const hoursInput = await loadBusinessHoursInput(dependencies.domain, { businessId: input.businessId });
  if (!hoursInput || hoursInput.hoursSource === "operator" || hoursInput.fingerprint === hoursInput.currentFingerprint) return { status: "skipped", entityId: input.businessId };
  // Record the read even when there's nothing to extract, so the startup backfill doesn't queue this business again.
  if ((hoursInput.hoursSource === "none" && hoursInput.existingWindows > 0) || !hoursInput.sources.length) {
    await markBusinessHoursChecked(dependencies.domain, { businessId: input.businessId, fingerprint: hoursInput.fingerprint });
    return { status: "skipped", entityId: input.businessId };
  }
  const startedAt = performance.now();
  let extraction: Awaited<ReturnType<BusinessHoursExtractor["extract"]>>;
  try {
    extraction = await extractor.extract({ businessName: hoursInput.businessName, sources: hoursInput.sources });
    await recordAiGenerationEvent(dependencies.domain, { ...extraction.usage, businessId: input.businessId, operation: "business.hours" }).catch(() => undefined);
  } catch (error) {
    // Only a stable category is recorded: provider errors can echo source text.
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    await recordAiGenerationEvent(dependencies.domain, { ...extractor.modelId, businessId: input.businessId, operation: "business.hours", latencyMs: performance.now() - startedAt, isError: true, error: timedOut ? "generation_timeout" : "generation_failed" }).catch(() => undefined);
    throw error;
  }
  if (extraction.result.status !== "found") {
    await markBusinessHoursChecked(dependencies.domain, { businessId: input.businessId, fingerprint: hoursInput.fingerprint });
    return { status: "skipped", entityId: input.businessId };
  }
  const saved = await saveGeneratedBusinessHours(dependencies.domain, { businessId: input.businessId, hours: extraction.result.hours, fingerprint: hoursInput.fingerprint });
  return { status: saved ? "completed" : "skipped", entityId: input.businessId };
}

async function indexWebsitePage(
  dependencies: WorkerDependencies,
  businessId: string,
  page: { url: string; title?: string; markdown?: string },
  importGuard?: { documentId: string; revision: number },
): Promise<number> {
  const text = page.markdown?.trim() ?? "";
  if (!text || !page.url) return 0;
  if (importGuard) {
    const active = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, importGuard.documentId), eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.revision, importGuard.revision), eq(knowledgeDocuments.status, "processing"))).limit(1)).length > 0);
    if (!active) return 0;
    // One page failing must not fail the whole import; the crawl loop counts it.
    const result = await indexKnowledgeText(dependencies, { businessId, documentId: importGuard.documentId, text, websitePage: { sourceUrl: page.url, title: page.title ?? page.url, sourceRevision: importGuard.revision }, deferFailure: true });
    return result.chunkCount;
  }
  const documentId = await upsertWebsiteDocument(dependencies.domain, { businessId, sourceUrl: page.url, title: page.title ?? page.url });
  const result = await indexKnowledgeText(dependencies, { businessId, documentId, text });
  return result.chunkCount;
}

async function indexKnowledgeText(
  dependencies: WorkerDependencies,
  input: { businessId: string; documentId: string; text: string; websitePage?: { sourceUrl: string; title: string; sourceRevision: number }; deferFailure?: boolean },
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(input.text);
  chunkCount.record(chunks.length, { operation: "knowledge.index" });
  if (!dependencies.embeddings) {
    if (!input.deferFailure) await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      ...(input.websitePage ? { expectedRevision: input.websitePage.sourceRevision } : {}),
      error: "Knowledge embedding provider is not configured.",
    });
    throw new Error("Knowledge embedding provider is not configured.");
  }
  // A crawled page is small, so only a whole document is worth checking before paying to embed it.
  const limitError = input.websitePage ? undefined : await checkKnowledgeStorageLimit(dependencies.domain, { businessId: input.businessId, documentId: input.documentId, text: input.text });
  if (limitError) {
    await markKnowledgeDocumentFailed(dependencies.domain, { businessId: input.businessId, documentId: input.documentId, error: limitError });
    return { chunkCount: 0 };
  }

  let embeddings: number[][];
  let usage: DurableAiUsage | undefined;
  try {
    const embeddingStartedAt = performance.now();
    embeddings = await dependencies.embeddings.embed(chunks, (value) => {
      usage = value;
    });
    embeddingDuration.record(performance.now() - embeddingStartedAt, { provider: usage?.provider ?? "unknown" });
  } catch (error) {
    embeddingFailures.add(1, { operation: "knowledge.index" });
    if (!input.deferFailure) await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      ...(input.websitePage ? { expectedRevision: input.websitePage.sourceRevision } : {}),
      error: "Knowledge embedding provider failed.",
    });
    throw error;
  }

  if (embeddings.length !== chunks.length) {
    if (!input.deferFailure) await markKnowledgeDocumentFailed(dependencies.domain, {
      businessId: input.businessId,
      documentId: input.documentId,
      ...(input.websitePage ? { expectedRevision: input.websitePage.sourceRevision } : {}),
      error: "Knowledge embedding provider returned an incomplete result.",
    });
    throw new Error("Knowledge embedding provider returned an incomplete result.");
  }

  const indexStartedAt = performance.now();
  const prepared = { businessId: input.businessId, documentId: input.documentId, text: input.text, embeddings, ...(dependencies.embeddings?.fingerprint ? { embeddingFingerprint: dependencies.embeddings.fingerprint } : {}) };
  const indexed = input.websitePage ? await indexCrawledWebsitePage(dependencies.domain, { ...prepared, ...input.websitePage }) : await indexDocumentText(dependencies.domain, prepared);
  indexDuration.record(performance.now() - indexStartedAt, { operation: "knowledge.index" });
  if (usage) {
    await recordAiGenerationEvent(dependencies.domain, {
      ...usage,
      businessId: input.businessId,
      operation: "knowledge.embed",
    }).catch(() => undefined);
  }
  return indexed;
}

function polarCheckoutProductId(target: "starter" | "pro", billingInterval: "monthly" | "annual"): string {
  const key = `POLAR_${target.toUpperCase()}_${billingInterval.toUpperCase()}_PRODUCT_ID`;
  const productId = process.env[key];
  if (!productId) throw new Error(`${key} is required for checkout.`);
  return productId;
}
