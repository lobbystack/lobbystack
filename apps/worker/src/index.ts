import { assertDatabaseRole, businesses, createDatabaseClient, databaseHealthCheck, enqueueOutbox, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { assertProductionSecrets } from "@lobbystack/config";
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
import { Worker } from "bullmq";

import { handleJob, type WorkerDependencies } from "./handlers";
import { startHealthServer } from "./health";
import { OutboxDispatcher } from "./outboxDispatcher";
import { getWorkerStartupMode } from "./maintenance";
import { configureSchedulers } from "./scheduler";
import { getWorkerSnapshotCache } from "./snapshot-cache";

function createEmailProvider(): SmtpEmailProvider | undefined {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn("SMTP_HOST is missing. Authentication email jobs will fail until email delivery is configured.");
    return undefined;
  }
  return new SmtpEmailProvider({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USERNAME ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.EMAIL_FROM ?? "LobbyStack <no-reply@localhost>",
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

async function main(): Promise<void> {
  const startupMode = getWorkerStartupMode(process.env);
  if (!startupMode.startsConsumers) {
    // Keep liveness available, but report unready and avoid all queue, scheduler, and provider startup.
    startHealthServer(Number(process.env.PORT ?? 3002), { ready: false, redis: false, database: false, storage: false, activeJobs: 0 });
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
    queues.set(queueName, createQueue(queueName));
  }
  const refreshSchedulers = async () => {
    const businessRows = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await tx.select({ id: businesses.id }).from(businesses));
    await configureSchedulers(queues, businessRows.map((business) => business.id));
  };
  await refreshSchedulers();
  const schedulerRefresh = setInterval(() => void refreshSchedulers().catch((error) => console.error("scheduler refresh failed", redactOtelExceptionText(error instanceof Error ? error.message : String(error)))), 5 * 60_000);
  schedulerRefresh.unref();
  const state = { ready: false, redis: false, database: false, storage: false, activeJobs: 0 };
  const health = startHealthServer(Number(process.env.PORT ?? 3002), state);
  const email = createEmailProvider();
  const onboardingFollowupSender = createOnboardingFollowupSender();
  const embeddings = createEmbeddingProvider();
  const twilio = createTwilioProvider();
  const twilioAlerts = createAlertSmsProvider();
  const storage = createStorageProvider();
  const polar = createPolarProvider();
  const crawler = createCrawlerProvider();
  const calendar = createCalendarProvider();
  const productAnalytics = createProductAnalytics();
  if (embeddings) {
    const embeddingQueue = queues.get("bulk");
    if (embeddingQueue) {
      const embeddingBusinesses = await withDispatcherTransaction(dispatcherDatabase.db, async (tx) => await tx.select({ id: businesses.id }).from(businesses));
      for (const business of embeddingBusinesses) {
        await enqueueJob(embeddingQueue, {
          type: "knowledge.reembedBusiness",
          businessId: business.id,
          payload: { fingerprint: embeddings.fingerprint },
          idempotencyKey: `knowledge-reembed:${business.id}:${embeddings.fingerprint}`,
        });
      }
    }
  }
  await storage.ensureReady();
  const dependencies: WorkerDependencies = {
    domain: { db: database.db, snapshotCache: getWorkerSnapshotCache(), ...(embeddings ? { embeddings } : {}) },
    realtime,
    ...(calendar ? { calendar } : {}),
    ...(crawler ? { crawler } : {}),
    ...(productAnalytics ? { productAnalytics } : {}),
    ...(email ? { email } : {}),
    ...(onboardingFollowupSender ? { onboardingFollowupSender } : {}),
    ...(embeddings ? { embeddings } : {}),
    ...(twilio ? { twilio } : {}),
    ...(twilioAlerts ? { twilioAlerts } : {}),
    storage,
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
    const worker = new Worker<JobEnvelope>(queueName, async (job) => await withSpan(`job.${job.data.type}`, { attributes: { "messaging.system": "bullmq", "messaging.destination.name": queueName, "lobbystack.job_type": job.data.type } }, async () => {
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
    }), createWorkerOptions(queueName));
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
  const redisChecks = await Promise.all([...queues.values()].map(async (queue) => {
    try { await queue.getJobCounts(); return true; } catch { return false; }
  }));
  try {
    await realtime.connect();
    redisChecks.push(true);
  } catch {
    redisChecks.push(false);
  }
  state.redis = redisChecks.every(Boolean);
  state.database = (await databaseHealthCheck(database)).ok;
  state.storage = await storage.ensureReady().then(() => true).catch(() => false);
  state.ready = state.redis && state.database && state.storage;
  const healthRefresh = setInterval(() => void (async () => {
    const [databaseStatus, storageStatus, ...queueStatuses] = await Promise.all([
      databaseHealthCheck(database).then((result) => result.ok).catch(() => false),
      storage.ensureReady().then(() => true).catch(() => false),
      ...[...queues.values()].map(async (queue) => { try { await queue.getJobCounts(); return true; } catch { return false; } }),
      realtime.ping().then((result) => result === "PONG").catch(() => false),
    ]);
    state.database = databaseStatus;
    state.storage = storageStatus;
    state.redis = queueStatuses.every(Boolean);
    state.ready = state.database && state.redis && state.storage;
  })(), 10_000);
  healthRefresh.unref();

  const shutdown = async () => {
    clearInterval(schedulerRefresh);
    clearInterval(healthRefresh);
    abort.abort();
    dispatcher.stop();
    await Promise.allSettled([dispatchLoop, ...workers.map((worker) => worker.close()), ...[...queues.values()].map((queue) => queue.close()), realtime.quit(), database.pool.end(), dispatcherDatabase.pool.end(), new Promise<void>((resolve) => health.close(() => resolve())), shutdownTelemetry()]);
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

void main().catch(async (error) => {
  console.error(redactOtelExceptionText(error instanceof Error ? error.message : String(error)));
  await shutdownTelemetry();
  process.exitCode = 1;
});
