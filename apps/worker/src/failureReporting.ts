import type { Job, Worker } from "bullmq";

import type { JobEnvelope } from "@lobbystack/jobs";
import { captureExceptionToPostHog, emitErrorLog, redactOtelExceptionText } from "@lobbystack/telemetry/node";

// A dead Redis or provider stream can emit thousands of these in a minute.
// Report at most one per kind per window; the next one after the window tells
// operators the failure is still happening.
const REPORT_COOLDOWN_MS = 5 * 60_000;
const MAX_TEXT_LENGTH = 200;
const DISTINCT_ID = "system:lobbystack-worker";
const LOGGER_NAME = "lobbystack-worker";

type Properties = Record<string, string | number | boolean | null | undefined>;
type Capture = (error: Error, distinctId: string, properties: Properties) => Promise<void>;

export type FailureReporterOptions = {
  capture?: Capture;
  now?: () => number;
  cooldownMs?: number;
};

type FailedJob = Pick<Job<JobEnvelope>, "id" | "attemptsMade" | "data" | "opts">;
type FailureSource = Pick<Worker<JobEnvelope>, "on">;

// V8 puts ids in provider messages (job ids, business ids, request ids), so two
// failures of the same kind would open a new PostHog issue each time.
export function normalizeFailureText(value: string): string {
  // Replace ids before redaction: the phone matcher reads the digit runs in a
  // UUID as one long number and would hide the whole id as a phone.
  const withoutIds = value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b[0-9a-f]{16,}\b/gi, "[id]");
  return redactOtelExceptionText(withoutIds)
    .replace(/\b\d{4,}\b/g, "[n]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

// BullMQ increments attemptsMade before it emits "failed", so the job is out of
// retries when it reaches the configured attempts. UnrecoverableError skips
// retries entirely.
export function isFinalJobFailure(job: FailedJob | undefined, error: unknown): boolean {
  if (error instanceof Error && error.name === "UnrecoverableError") return true;
  if (!job) return true;
  return (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 1);
}

function errorText(error: unknown): string {
  return normalizeFailureText(error instanceof Error ? error.message : String(error));
}

// The OTLP log record reaches PostHog Logs. The console line keeps local
// development readable and stays available in container stdout.
function logFailure(event: string, attributes: Record<string, string | number | boolean>): void {
  emitErrorLog(LOGGER_NAME, event, attributes);
  console.error(JSON.stringify({ event, ...attributes }));
}

// Keep the frames of the original failure for diagnosis while the message
// carries the stable fingerprint. V8 copies the message into the stack header,
// so the header is replaced rather than reused.
function failureError(name: string, message: string, original: unknown): Error {
  const source = original instanceof Error ? original : new Error(String(original));
  const frames = source.stack?.split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 29).map(redactOtelExceptionText) ?? [];
  const error = new Error(message);
  error.name = name;
  error.stack = [`${name}: ${message}`, ...frames].join("\n");
  return error;
}

function serviceProperties(): Properties {
  return {
    service: "lobbystack-worker",
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_DEPLOYMENT_ID ?? process.env.SERVICE_VERSION ?? "development",
  };
}

export function createFailureReporter(options: FailureReporterOptions = {}) {
  const capture = options.capture ?? captureExceptionToPostHog;
  const now = options.now ?? Date.now;
  const cooldownMs = options.cooldownMs ?? REPORT_COOLDOWN_MS;
  const lastReportedAt = new Map<string, number>();

  function withinCooldown(kind: string): boolean {
    const last = lastReportedAt.get(kind);
    if (last !== undefined && now() - last < cooldownMs) return true;
    lastReportedAt.set(kind, now());
    return false;
  }

  function reportJobFailure(queue: string, job: FailedJob | undefined, error: Error): void {
    const jobType = job?.data?.type ?? "unknown";
    const attemptsMade = job?.attemptsMade ?? 0;
    const jobId = job?.id;
    const message = errorText(error);
    // Job type and normalized message form the fingerprint, so a repeated
    // failure updates one issue and a changed failure opens a new one.
    const fingerprint = `${jobType}: ${message}`;
    const safe = failureError("WorkerJobFailure", fingerprint, error);
    logFailure("worker.job.failed", {
      queue,
      job_type: jobType,
      attempts_made: attemptsMade,
      attempts_allowed: job?.opts.attempts ?? 1,
      ...(jobId ? { job_id: jobId } : {}),
      message,
    });
    void capture(safe, DISTINCT_ID, {
      ...serviceProperties(),
      alertable: true,
      queue,
      job_type: jobType,
      attempts_made: attemptsMade,
      attempts_allowed: job?.opts.attempts ?? 1,
      ...(jobId ? { job_id: jobId } : {}),
      $exception_fingerprint: `worker.job.failed:${fingerprint}`,
      $issue_name: `Worker job failed: ${jobType}`,
      $issue_description: message,
      $exception_level: "error",
    }).catch(() => undefined);
  }

  function reportWorkerError(queue: string, error: Error): void {
    const message = errorText(error);
    // A connection problem repeats across queues, so one issue and one report
    // per window cover the whole worker process.
    if (withinCooldown("worker.error")) return;
    logFailure("worker.error", { queue, message });
    const safe = failureError("WorkerConnectionError", `worker connection error: ${message}`, error);
    void capture(safe, DISTINCT_ID, {
      ...serviceProperties(),
      alertable: true,
      queue,
      $exception_fingerprint: `worker.error:${message}`,
      $issue_name: "Worker connection error",
      $issue_description: message,
      $exception_level: "error",
    }).catch(() => undefined);
  }

  function reportDispatcherStopped(error: unknown): void {
    const message = errorText(error);
    logFailure("outbox.dispatcher_stopped", { message });
    const safe = failureError("OutboxDispatcherStopped", `outbox dispatcher stopped: ${message}`, error);
    void capture(safe, DISTINCT_ID, {
      ...serviceProperties(),
      alertable: true,
      $exception_fingerprint: `outbox.dispatcher.stopped:${message}`,
      $issue_name: "Outbox dispatcher stopped",
      $issue_description: message,
      $exception_level: "error",
    }).catch(() => undefined);
  }

  function attach(worker: FailureSource, queue: string): void {
    worker.on("failed", (job, error) => {
      if (!isFinalJobFailure(job, error)) return;
      reportJobFailure(queue, job ?? undefined, error);
    });
    worker.on("error", (error) => reportWorkerError(queue, error));
  }

  return { attach, reportDispatcherStopped };
}
