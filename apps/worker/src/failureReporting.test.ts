import { EventEmitter } from "node:events";

import { logs, type LogRecord, type LoggerProvider } from "@opentelemetry/api-logs";
import { UnrecoverableError } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn().mockResolvedValue(undefined) }));
vi.mock("posthog-node", () => ({ PostHog: class { captureExceptionImmediate = mocks.capture; } }));

import { createFailureReporter, isFinalJobFailure, normalizeFailureText } from "./failureReporting";

const logRecords: LogRecord[] = [];

const job = (attemptsMade: number, attempts: number) => ({
  id: "1a2b3c4d-0000-4000-8000-000000000001",
  data: { type: "webhook.deliver", payload: { contactEmail: "person@example.com" } },
  attemptsMade,
  opts: { attempts },
} as never);

describe("worker failure reporting", () => {
  beforeEach(() => {
    vi.stubEnv("POSTHOG_API_KEY", "phc_fixture");
    vi.stubEnv("POSTHOG_HOST", "https://posthog.example.test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logRecords.length = 0;
    logs.disable();
    logs.setGlobalLoggerProvider({
      getLogger: () => ({ emit: (record: LogRecord) => { logRecords.push(record); }, enabled: () => true }),
    } as unknown as LoggerProvider);
  });

  afterEach(() => {
    logs.disable();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.capture.mockClear();
  });

  it("captures the final attempt of a job as one PostHog issue", async () => {
    const events = new EventEmitter();
    createFailureReporter().attach(events as never, "default");
    events.emit("failed", job(5, 5), new Error("Polar API returned 503 for business 8f14e45f-ceea-467a-9a3a-0b2f8f0f1c2d"));

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    const [error, distinctId, properties] = mocks.capture.mock.calls[0]!;
    expect(error.name).toBe("WorkerJobFailure");
    expect(error.message).toBe("webhook.deliver: Polar API returned 503 for business [id]");
    expect(error.stack).toContain("failureReporting.test.ts");
    expect(distinctId).toBe("system:lobbystack-worker");
    expect(properties).toMatchObject({
      service: "lobbystack-worker",
      alertable: true,
      queue: "default",
      job_type: "webhook.deliver",
      attempts_made: 5,
      job_id: "1a2b3c4d-0000-4000-8000-000000000001",
      $exception_fingerprint: "worker.job.failed:webhook.deliver: Polar API returned 503 for business [id]",
      $issue_name: "Worker job failed: webhook.deliver",
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("person@example.com");
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("payload");
    expect(logRecords).toContainEqual(expect.objectContaining({
      body: "worker.job.failed",
      severityText: "ERROR",
      attributes: expect.objectContaining({
        queue: "default",
        job_type: "webhook.deliver",
        attempts_made: 5,
        attempts_allowed: 5,
        job_id: "1a2b3c4d-0000-4000-8000-000000000001",
      }),
    }));
  });

  it("skips an attempt that BullMQ will retry", () => {
    const events = new EventEmitter();
    createFailureReporter().attach(events as never, "default");
    events.emit("failed", job(2, 5), new Error("temporary outage"));
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(logRecords).toHaveLength(0);
  });

  it("captures an UnrecoverableError on its first attempt", async () => {
    const events = new EventEmitter();
    createFailureReporter().attach(events as never, "default");
    events.emit("failed", job(1, 5), new UnrecoverableError("Contact owner@example.com is invalid."));

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    const [error] = mocks.capture.mock.calls[0]!;
    expect(error.name).toBe("WorkerJobFailure");
    expect(error.message).not.toContain("owner@example.com");
  });

  it("reports connection errors at most once per window", async () => {
    let now = 1_000;
    const events = new EventEmitter();
    createFailureReporter({ now: () => now, cooldownMs: 60_000 }).attach(events as never, "default");

    events.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    events.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    expect(mocks.capture).toHaveBeenCalledTimes(1);

    now += 60_000;
    events.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    const [error, , properties] = mocks.capture.mock.calls[1]!;
    expect(error.name).toBe("WorkerConnectionError");
    expect(properties.$exception_fingerprint).toBe("worker.error:connect ECONNREFUSED [redacted-phone]:[n]");
    // A connection storm logs once per window too; only the count of dropped
    // occurrences differs.
    expect(logRecords.filter((record) => record.body === "worker.error")).toHaveLength(2);
  });

  it("captures an outbox dispatcher that stops", async () => {
    createFailureReporter({}).reportDispatcherStopped(new Error("dispatcher lost its database"));

    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    const [error, , properties] = mocks.capture.mock.calls[0]!;
    expect(error.name).toBe("OutboxDispatcherStopped");
    expect(properties.$issue_name).toBe("Outbox dispatcher stopped");
    expect(logRecords).toContainEqual(expect.objectContaining({ body: "outbox.dispatcher_stopped", severityText: "ERROR" }));
  });
});

describe("failure fingerprint", () => {
  it("groups the same failure across different ids", () => {
    const first = normalizeFailureText("job 1a2b3c4d-0000-4000-8000-000000000001 failed for business 9f8e7d6c-0000-4000-8000-000000000002");
    const second = normalizeFailureText("job 2b3c4d5e-0000-4000-8000-000000000002 failed for business 0a1b2c3d-0000-4000-8000-000000000003");
    expect(first).toBe(second);
    expect(first).toContain("[id]");
  });

  it("keeps short status codes that distinguish failures", () => {
    expect(normalizeFailureText("upstream returned 503")).toBe("upstream returned 503");
    expect(normalizeFailureText("upstream returned 503")).not.toBe(normalizeFailureText("upstream returned 500"));
  });

  it("treats an unrecoverable error or a missing job as final", () => {
    expect(isFinalJobFailure(undefined, new Error("orphaned"))).toBe(true);
    expect(isFinalJobFailure(job(1, 5) as never, new UnrecoverableError("stop"))).toBe(true);
    expect(isFinalJobFailure(job(4, 5) as never, new Error("retry"))).toBe(false);
  });
});
