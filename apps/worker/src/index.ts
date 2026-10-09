import { assertDatabaseRole, businesses, createDatabaseClient, databaseHealthCheck, enqueueOutbox, listSchedulerBusinesses, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { createBusinessHoursExtractor, createBusinessSummarizer, createCallSummarizer } from "@lobbystack/agent-core";
import { assertProductionSecrets, isMaintenanceMode } from "@lobbystack/shared";
import type { OnboardingFollowupSender } from "@lobbystack/domain";
import { createQueue, createRedisConnection, createWorkerOptions, enqueueJob, isKnownJobType, jobQueues, type JobEnvelope, type JobQueue } from "@lobbystack/jobs";
import { createEmbeddingProvider } from "@lobbystack/providers/ai/embeddingProvider";
import { FirecrawlProvider } from "@lobbystack/providers/crawling/firecrawl";
import { SmtpEmailProvider } from "@lobbystack/providers/email/smtp";
import { GoogleCalendarProvider } from "@lobbystack/providers/google/calendar";
import { PolarBillingProvider } from "@lobbystack/providers/polar/polarBilling";
import { createStorageProvider } from "@lobbystack/providers/storage/provider";
import { TwilioProvider } from "@lobbystack/providers/twilio/twilioProvider";
import { getMeter, initializeTelemetry, redactOtelExceptionText, shutdownTelemetry, withSpan } from "@lobbystack/telemetry/node";
import { redactJobError } from "./redactJobError";
import { DelayedError, Worker } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";
import OpenAI from "openai";

import { handleJob, type WorkerDependencies } from "./handlers";
import { startHealthServer } from "./health";
import { createLiveCallHandler, liveDrainTimeoutMs } from "./liveCalls";
import { OutboxDispatcher } from "./outboxDispatcher";
import { configureSchedulers } from "./scheduler";
import { getWorkerSnapshotCache } from "./snapshot-cache";
import { logUnhandledRejections } from "./processGuards";

function createEmailProvider(): SmtpEmailProvider | undefined {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn("SMTP_HOST is missing. Authentication email jobs will fail until email delivery is configured.");
    return undefined;
  }
  return new SmtpEmailProvider({
    host,
    // A deploy template can leave optional inputs blank, so "" counts as unset.
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USERNAME ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.EMAIL_FROM || "LobbyStack <no-reply@localhost>",
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });
}

function createOnboardingFollowupSender(): OnboardingFollowupSender | undefined {
  const from = process.env.ONBOARDING_FOLLOWUP_FROM?.trim();
  const name = process.env.ONBOARDING_FOLLOWUP_SENDER_NAME?.trim();
  return from && name ? { from, name } : undefined;
}

function createTwilioProvider(): TwilioProvider | undefined {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  return accountSid && authToken ? new TwilioProvider({ accountSid, authToken }) : undefined;
}

function createPolarProvider(): PolarBillingProvider | undefined {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  return accessToken && organizationId ? new PolarBillingProvider({ accessToken, organizationId, ...(process.env.POLAR_API_BASE_URL ? { baseUrl: process.env.POLAR_API_BASE_URL } : {}) }) : undefined;
}

function createAlertSmsProvider(): WorkerDependencies["twilioAlerts"] {
  const accountSid = process.env.TWILIO_ALERT_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_ALERT_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_ALERT_API_KEY_SECRET;
  const from = process.env.TWILIO_ALERT_SMS_FROM;
  if (!accountSid || !apiKeySid || !apiKeySecret || !from) return undefined;
  const provider = new TwilioProvider({ accountSid, apiKeySid, apiKeySecret });
  return { from, sendSms: input => {
    if (input.from !== from) throw new Error("Restricted alert provider cannot use another sender.");
    return provider.sendSms(input);
  } };
}

function createCrawlerProvider(): FirecrawlProvider | undefined {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  return apiKey ? new FirecrawlProvider({ apiKey, ...(process.env.FIRECRAWL_BASE_URL ? { baseUrl: process.env.FIRECRAWL_BASE_URL } : {}) }) : undefined;
}

function createCalendarProvider(): GoogleCalendarProvider | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? new GoogleCalendarProvider({ clientId, clientSecret, redirectUri }) : undefined;
}

function createProductAnalytics(): WorkerDependencies["productAnalytics"] {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return undefined;
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  return {
    capture: async (events) => {
      const response = await fetch(`${host.replace(/\/$/, "")}/batch/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, batch: events.map((event) => ({ event: event.event, distinct_id: event.distinctId, properties: event.properties, timestamp: event.timestamp })) }),
      });
      if (!response.ok) throw new Error(`PostHog product event delivery failed with status ${response.status}.`);
    },
  };
}

// Containers set PORT; local `pnpm dev` only has WORKER_PORT, which the admin's WORKER_INTERNAL_URL targets.
const workerPort = Number(process.env.PORT || process.env.WORKER_PORT || 3002);

async function main(): Promise<void> {
  logUnhandledRejections();
  // Sampled once at boot; it does not pause work already claimed by another process.
  if (isMaintenanceMode(process.env)) {
    // Keep liveness available, but report unready and avoid all queue, scheduler, and provider startup.
    startHealthServer(workerPort, { ready: false, redis: false, database: false, storage: false, activeJobs: 0, draining: false });
    console.warn("Worker consumer startup is isolated by maintenance mode.");
    return;
  }
  assertProductionSecrets(process.env, [
    "ENCRYPTION_KEY",
    "OTP_HASH_SECRET",
    ...(process.env.STORAGE_PROVIDER === "s3" ? [] : ["LOCAL_STORAGE_SIGNING_SECRET"]),
  ]);
  await initializeTelemetry({ serviceName: "lobbystack-worker" });
  const database = createDatabaseClient("lobbystack_worker");
  const dispatcherDatabase = createDatabaseClient("lobbystack_dispatcher");
  await Promise.all([assertDatabaseRole(database), assertDatabaseRole(dispatcherDatabase)]);
  const realtime = createRedisConnection({ prefix: process.env.REDIS_PREFIX ?? "lobbystack" });
  const queues = new Map<JobQueue, ReturnType<typeof createQueue>>();
  for (const queueName of jobQueues) {
    const queue = createQueue(queueName);
    queue.on("error", (error) => console.error(JSON.stringify({ event: "queue.error", queue: queueName, message: redactOtelExceptionText(error.message) })));
    queues.set(queueName, queue);
  }
  const refreshSchedulers = async () => {
    const businessRows = await listSchedulerBusinesses(dispatcherDatabase.db);
    await configureSchedulers(queues, businessRows);
    return businessRows.map((business) => business.id);
  };
  const state = { ready: false, redis: false, database: false, storage: false, activeJobs: 0, draining: false };
  const embeddings = createEmbeddingProvider();
  const liveCalls = createLiveCallHandler({ domain: { db: database.db, snapshotCache: getWorkerSnapshotCache(), ...(embeddings ? { embeddings } : {}) }, attachLock: realtime });
  const health = startHealthServer(workerPort, state, liveCalls.handle);
  const email = createEmailProvider();
  const onboardingFollowupSender = createOnboardingFollowupSender();
  const twilio = createTwilioProvider();
  const twilioAlerts = createAlertSmsProvider();
  const storage = createStorageProvider();
  const polar = createPolarProvider();
  const crawler = createCrawlerProvider();
  const calendar = createCalendarProvider();
  const productAnalytics = createProductAnalytics();
  const callSummarizer = createCallSummarizer();
  const businessSummarizer = createBusinessSummarizer();
  const businessHoursExtractor = createBusinessHoursExtractor();
  await storage.ensureReady();
  // The recording copy schedules its own retries, so the client doesn't retry a 409.
  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }) : undefined;
  const dependencies: WorkerDependencies = {
    domain: { db: database.db, snapshotCache: getWorkerSnapshotCache(), ...(embeddings ? { embeddings } : {}) },
    realtime,
    ...(calendar ? { calendar } : {}),
    ...(crawler ? { crawler } : {}),
    ...(productAnalytics ? { productAnalytics } : {}),
    ...(callSummarizer ? { callSummarizer } : {}),
    ...(businessSummarizer ? { businessSummarizer } : {}),
    ...(businessHoursExtractor ? { businessHoursExtractor } : {}),
    ...(email ? { email } : {}),
    ...(onboardingFollowupSender ? { onboardingFollowupSender } : {}),
    ...(embeddings ? { embeddings } : {}),
    ...(twilio ? { twilio } : {}),
    ...(twilioAlerts ? { twilioAlerts } : {}),
    storage,
    ...(openai ? { liveSessions: openai.live.sessions } : {}),
    recoverLiveCall: liveCalls.recover,
    ...(polar ? { polar } : {}),
    enqueueProductEventRetentionContinuation: async (input) => {
      await withBusinessTransaction(database.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
        await enqueueOutbox(tx, {
          topic: "privacy.scrubMessage",
          businessId: input.businessId,
          aggregateType: "product_event_retention",
          dedupeKey: `product-event-retention:${input.businessId}:${input.chainId}:${input.sequence}`,
          payload: {
            productEventRetentionContinuation: true,
            retentionBefore: input.before.toISOString(),
            retentionChainId: input.chainId,
            retentionSequence: input.sequence,
          },
          availableAt: input.availableAt,
        });
      });
    },
  };
  const workers = jobQueues.map((queueName) => {
    const meter = getMeter("lobbystack-worker");
    const duration = meter.createHistogram("lobbystack.worker.job_duration_ms", { unit: "ms" });
    const wait = meter.createHistogram("lobbystack.worker.job_wait_ms", { unit: "ms" });
    const queue = queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} is not configured.`);
    }
    const worker = new Worker<JobEnvelope>(queueName, async (job, token) => {
      const result = await withSpan(`job.${job.data.type}`, { attributes: { "messaging.system": "bullmq", "messaging.destination.name": queueName, "lobbystack.job_type": job.data.type } }, async () => {
        state.activeJobs += 1;
        const started = performance.now();
        let outcome = "success";
        const type = isKnownJobType(job.data.type) ? job.data.type : "unknown";
        wait.record(Math.max(0, Date.now() - job.timestamp - (job.delay ?? 0)), { queue: queueName, type });
        try {
          const maxAttempts = job.opts.attempts ?? 1;
          return await handleJob(job.data, dependencies, {
            isFinalAttempt: job.attemptsMade + 1 >= maxAttempts,
            ...(job.id ? { queueJobId: job.id } : {}),
            queuedAtMs: job.timestamp,
          });
        } catch (error) {
          outcome = "error";
          throw redactJobError(error);
        } finally {
          duration.record(performance.now() - started, { queue: queueName, type, outcome });
          state.activeJobs -= 1;
        }
      });
      if (result.status !== "deferred") return result;
      // Run again once the lease ends, without spending one of the job's attempts.
      await job.moveToDelayed(result.retryAt.getTime(), token);
      throw new DelayedError();
    }, createWorkerOptions(queueName));
    // BullMQ emits connection problems as "error" events; without a listener
    // Node treats one as fatal.
    worker.on("error", (error) => console.error(JSON.stringify({ event: "worker.error", queue: queueName, message: redactOtelExceptionText(error.message) })));
    const failedJobs = getMeter("lobbystack-worker").createCounter("lobbystack.worker.jobs.failed");
    worker.on("failed", (job) => failedJobs.add(1, {
      "messaging.destination.name": queueName,
      ...(job?.data.type ? { "lobbystack.job_type": job.data.type } : {}),
    }));
    return worker;
  });
  const dispatcher = new OutboxDispatcher(dispatcherDatabase.db, new Map(queues));
  const abort = new AbortController();
  const dispatchLoop = dispatcher.run(abort.signal).catch((error) => console.error("outbox dispatcher stopped", redactOtelExceptionText(error instanceof Error ? error.message : String(error))));
  // Workers already take jobs here, so a long pass over every business at boot
  // holds up neither jobs nor the health check.
  void (async () => {
    const businessIds = await refreshSchedulers();
    // Existing businesses got summaries before AI wrote them, so write one from
    // each business's knowledge. BullMQ keeps the job id for a day; a later
    // restart queues it again, and the job skips summaries an operator wrote,
    // businesses with no knowledge, and knowledge that hasn't changed, so only
    // the first run calls the model.
    const summaryQueue = queues.get("bulk");
    if (businessSummarizer && summaryQueue) {
      for (const businessId of businessIds) {
        await enqueueJob(summaryQueue, {
          type: "business.generateSummary",
          businessId,
          payload: { businessId, reason: "backfill" },
          idempotencyKey: `business-summary-backfill:${businessId}:v1`,
        });
      }
    }
    // Nothing filled opening hours before, so most businesses have none and
    // instant booking found every time unavailable. Read each one's knowledge
    // for its hours once. Every run records a fingerprint, so a restart only
    // queues businesses the job hasn't read yet.
    if (businessHoursExtractor && summaryQueue) {
      const hoursBusinesses = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await tx.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.hoursSource, "none"), isNull(businesses.hoursFingerprint))));
      for (const business of hoursBusinesses) {
        await enqueueJob(summaryQueue, {
          type: "business.extractHours",
          businessId: business.id,
          payload: { businessId: business.id, reason: "backfill" },
          idempotencyKey: `business-hours-backfill:${business.id}:v1`,
        });
      }
    }
    if (embeddings) {
      const embeddingQueue = queues.get("bulk");
      if (embeddingQueue) {
        for (const businessId of businessIds) {
          await enqueueJob(embeddingQueue, {
            type: "knowledge.reembedBusiness",
            businessId,
            payload: { fingerprint: embeddings.fingerprint },
            idempotencyKey: `knowledge-reembed:${businessId}:${embeddings.fingerprint}`,
          });
        }
      }
    }
  })().catch((error) => console.error("startup scheduling failed", redactOtelExceptionText(error instanceof Error ? error.message : String(error))));
  const schedulerRefresh = setInterval(() => void refreshSchedulers().catch((error) => console.error("scheduler refresh failed", redactOtelExceptionText(error instanceof Error ? error.message : String(error)))), 5 * 60_000);
  schedulerRefresh.unref();
  const checkHealth = async () => {
    const [databaseStatus, storageStatus, ...redisStatuses] = await Promise.all([
      databaseHealthCheck(database).then((result) => result.ok).catch(() => false),
      storage.ensureReady().then(() => true).catch(() => false),
      ...[...queues.values()].map(async (queue) => { try { await queue.getJobCounts(); return true; } catch { return false; } }),
      realtime.ping().then((result) => result === "PONG").catch(() => false),
    ]);
    state.database = databaseStatus;
    state.storage = storageStatus;
    state.redis = redisStatuses.every(Boolean);
    state.ready = state.database && state.redis && state.storage;
  };
  await checkHealth();
  const healthRefresh = setInterval(() => void checkHealth(), 10_000);
  healthRefresh.unref();

  const shutdown = async () => {
    // Readiness fails and new attaches get 503 at once, so new work goes to the next deployment.
    state.draining = true;
    clearInterval(schedulerRefresh);
    clearInterval(healthRefresh);
    abort.abort();
    // Stop taking jobs, and let calls in progress end on their own until the
    // drain timeout. Both still need Redis, the database pools and the HTTP
    // server (for /internal/live/end), so those close after.
    await Promise.allSettled([liveCalls.drain(liveDrainTimeoutMs()), dispatchLoop, ...workers.map((worker) => worker.close())]);
    await Promise.allSettled([...[...queues.values()].map((queue) => queue.close()), realtime.quit(), database.pool.end(), dispatcherDatabase.pool.end(), new Promise<void>((resolve) => health.close(() => resolve())), shutdownTelemetry()]);
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

void main().catch(async (error) => {
  console.error(redactOtelExceptionText(error instanceof Error ? error.message : String(error)));
  await shutdownTelemetry();
  process.exitCode = 1;
});
