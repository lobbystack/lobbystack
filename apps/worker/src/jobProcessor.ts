import type { Job } from "bullmq";

import { isKnownJobType, type JobEnvelope, type JobQueue } from "@lobbystack/jobs";
import { getMeter, logEvent, reportError, withCallContext, withExtractedTraceContext, withSpan } from "@lobbystack/telemetry/node";

import { handleJob, type WorkerDependencies } from "./handlers";
import { jobCallContext } from "./jobCallContext";
import { redactJobError } from "./redactJobError";

// The trace that queued the job, which the outbox carries from the request or call.
function queuedTrace(job: JobEnvelope): Record<string, string> {
  const { traceparent, tracestate } = job.trace ?? {};
  return { ...(traceparent ? { traceparent } : {}), ...(tracestate ? { tracestate } : {}) };
}

/**
 * Runs a queue's jobs, each in the trace that queued it and with the IDs of
 * the call it works on, so its logs, errors and spans carry them. Every failed
 * attempt is logged as `job.failed`; the last one also goes to error tracking.
 */
export function createJobProcessor(queueName: JobQueue, dependencies: WorkerDependencies, state: { activeJobs: number }, handle: typeof handleJob = handleJob) {
  const meter = getMeter("lobbystack-worker");
  const duration = meter.createHistogram("lobbystack.worker.job_duration_ms", { unit: "ms" });
  const wait = meter.createHistogram("lobbystack.worker.job_wait_ms", { unit: "ms" });
  return async (job: Job<JobEnvelope>) => await withExtractedTraceContext(queuedTrace(job.data), async () => await withCallContext(jobCallContext(job.data), async () => await withSpan(`job.${job.data.type}`, { attributes: { "messaging.system": "bullmq", "messaging.destination.name": queueName, "lobbystack.job_type": job.data.type, ...(job.id ? { "lobbystack.job_id": job.id } : {}) } }, async () => {
    state.activeJobs += 1;
    const started = performance.now();
    let outcome = "success";
    const type = isKnownJobType(job.data.type) ? job.data.type : "unknown";
    wait.record(Math.max(0, Date.now() - job.timestamp - (job.delay ?? 0)), { queue: queueName, type });
    const maxAttempts = job.opts.attempts ?? 1;
    const attempt = job.attemptsMade + 1;
    try {
      return await handle(job.data, dependencies, {
        isFinalAttempt: attempt >= maxAttempts,
        ...(job.id ? { queueJobId: job.id } : {}),
        queuedAtMs: job.timestamp,
      });
    } catch (error) {
      outcome = "error";
      const redacted = redactJobError(error);
      // An UnrecoverableError ends the job whatever attempts are left.
      const final = attempt >= maxAttempts || (redacted instanceof Error && redacted.name === "UnrecoverableError");
      logEvent(final ? "error" : "warn", "job.failed", { jobType: type, jobId: job.id, queue: queueName, attempt, maxAttempts, final, error: redacted });
      if (final) await reportError(redacted, { operation: `job.${type}`, jobType: type, jobId: job.id, attempt });
      throw redacted;
    } finally {
      duration.record(performance.now() - started, { queue: queueName, type, outcome });
      state.activeJobs -= 1;
    }
  })));
}
