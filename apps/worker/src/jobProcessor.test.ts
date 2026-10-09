import { createServer } from "node:http";

import type { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope } from "@lobbystack/jobs";
import { currentCallContext, initializeTelemetry, injectTraceContext, shutdownTelemetry } from "@lobbystack/telemetry/node";

import type { handleJob, WorkerDependencies } from "./handlers";
import { createJobProcessor } from "./jobProcessor";

const TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

function recordingJob(overrides: { attemptsMade?: number; attempts?: number; trace?: JobEnvelope["trace"] } = {}): Job<JobEnvelope> {
  return {
    id: "job_1",
    timestamp: Date.now(),
    delay: 0,
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 5 },
    data: {
      jobId: "4c1f0e3a-5a2b-4c3d-8e4f-0a1b2c3d4e5f",
      type: "call.saveRecording",
      queue: "default",
      businessId: "8f14e45f-ceea-467a-9a3e-2b1c0d9e8f7a",
      payload: { callId: "call_1", sessionId: "rtc_1", durationMs: 60_000 },
      trace: overrides.trace ?? {},
      idempotencyKey: "call-recording:call_1",
      scheduled: false,
    },
  } as unknown as Job<JobEnvelope>;
}

function logLines(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

beforeEach(() => {
  // Error reports go no further than the log.
  for (const key of ["POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "POSTHOG_API_KEY"]) vi.stubEnv(key, undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await shutdownTelemetry();
});

describe("job processor", () => {
  it("runs a job with the IDs of the call it works on", async () => {
    const seen: unknown[] = [];
    const handle = vi.fn<typeof handleJob>(async () => {
      seen.push(currentCallContext());
      return { status: "completed", entityId: "call_1" };
    });
    const state = { activeJobs: 0 };

    await expect(createJobProcessor("default", {} as WorkerDependencies, state, handle)(recordingJob())).resolves.toEqual({ status: "completed", entityId: "call_1" });

    expect(seen).toEqual([{ businessId: "8f14e45f-ceea-467a-9a3e-2b1c0d9e8f7a", callId: "call_1", sessionId: "rtc_1" }]);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ type: "call.saveRecording" }), {}, expect.objectContaining({ isFinalAttempt: false, queueJobId: "job_1" }));
    expect(state.activeJobs).toBe(0);
  });

  it("logs a failed attempt as job.failed, and reports the last one with the call's IDs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handle = vi.fn<typeof handleJob>(async () => {
      throw new Error("Storage refused the upload for caller@example.com");
    });
    const process = createJobProcessor("default", {} as WorkerDependencies, { activeJobs: 0 }, handle);

    await expect(process(recordingJob({ attemptsMade: 0, attempts: 2 }))).rejects.toThrow("Storage refused the upload for [redacted-email]");
    expect(logLines(warn)).toEqual([{ level: "warn", message: "job.failed", businessId: "8f14e45f-ceea-467a-9a3e-2b1c0d9e8f7a", callId: "call_1", sessionId: "rtc_1", jobType: "call.saveRecording", jobId: "job_1", queue: "default", attempt: 1, maxAttempts: 2, final: false, error: "Storage refused the upload for [redacted-email]" }]);
    expect(error).not.toHaveBeenCalled();

    await expect(process(recordingJob({ attemptsMade: 1, attempts: 2 }))).rejects.toThrow();
    const [failed, reported] = logLines(error);
    expect(failed).toMatchObject({ level: "error", message: "job.failed", callId: "call_1", attempt: 2, final: true });
    expect(reported).toMatchObject({ level: "error", message: "exception", operation: "job.call.saveRecording", jobId: "job_1", callId: "call_1", sessionId: "rtc_1", error: "Storage refused the upload for [redacted-email]" });
  });

  it("runs a job in the trace that queued it", async () => {
    const receiver = createServer((request, response) => {
      request.resume();
      request.on("end", () => response.end("{}"));
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const address = receiver.address();
    if (!address || typeof address === "string") throw new Error("OTLP test receiver did not start.");
    try {
      await initializeTelemetry({ endpoint: `http://127.0.0.1:${address.port}`, serviceName: "lobbystack-test" });
      let traceparent: string | undefined;
      const handle = vi.fn<typeof handleJob>(async () => {
        traceparent = injectTraceContext({}).traceparent;
        return { status: "completed", entityId: "call_1" };
      });
      await createJobProcessor("default", {} as WorkerDependencies, { activeJobs: 0 }, handle)(recordingJob({ trace: { traceparent: TRACEPARENT } }));
      // The job's span is a child in the same trace.
      expect(traceparent).toMatch(/^00-0af7651916cd43dd8448eb211c80319c-[0-9a-f]{16}-01$/);
      expect(traceparent).not.toBe(TRACEPARENT);
    } finally {
      await shutdownTelemetry();
      await new Promise<void>((resolve) => receiver.close(() => resolve()));
    }
  });
});
