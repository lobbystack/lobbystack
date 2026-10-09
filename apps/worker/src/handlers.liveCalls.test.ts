import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobEnvelope, JobType } from "@lobbystack/contracts";
import { LIVE_RECORDING_ATTEMPTS, listBusinessesWithOpenLiveCalls, listOpenLiveCalls, liveCallHasRecording, persistCallRecording, retryLiveCallRecording, type OpenLiveCall } from "@lobbystack/domain";

vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/domain")>()),
  listBusinessesWithOpenLiveCalls: vi.fn(),
  listOpenLiveCalls: vi.fn(),
  liveCallHasRecording: vi.fn(async () => false),
  persistCallRecording: vi.fn(async () => "object_1"),
  retryLiveCallRecording: vi.fn(async () => undefined),
}));

import { handleJob } from "./handlers";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const businessId = randomUUID();
const job = (type: JobType, payload: Record<string, unknown> = {}): JobEnvelope => ({ jobId: randomUUID(), type, queue: "default", businessId, payload, trace: {}, idempotencyKey: `test:${randomUUID()}`, scheduled: false });
const notReady = (status: number) => Object.assign(new Error(`${status}`), { status });

describe("call.saveRecording", () => {
  const recordingJob = (attempt: number) => job("call.saveRecording", { callId: "call_1", sessionId: "live_1", durationMs: 90_000, attempt });
  const dependencies = (downloadRecording: ReturnType<typeof vi.fn>) => ({ domain: { db: {} as never }, storage: {} as never, liveSessions: { downloadRecording } as never });

  it("copies the recording once OpenAI has it", async () => {
    const download = vi.fn(async () => new Response(new Uint8Array([82, 73, 70, 70])));
    await expect(handleJob(recordingJob(1), dependencies(download))).resolves.toEqual({ status: "completed", entityId: "call_1" });
    expect(download).toHaveBeenCalledWith("live_1");
    expect(persistCallRecording).toHaveBeenCalledWith(expect.anything(), { businessId, callId: "call_1", durationMs: 90_000, contentType: "audio/wav", body: new Uint8Array([82, 73, 70, 70]) }, expect.anything());
  });

  it("queues another attempt while OpenAI says the recording isn't ready", async () => {
    for (const status of [404, 409]) {
      vi.mocked(retryLiveCallRecording).mockClear();
      await expect(handleJob(recordingJob(2), dependencies(vi.fn(async () => { throw notReady(status); })))).resolves.toEqual({ status: "skipped", entityId: "call_1:retry:3" });
      expect(retryLiveCallRecording).toHaveBeenCalledWith(expect.anything(), { businessId, callId: "call_1", sessionId: "live_1", durationMs: 90_000, attempt: 3 });
    }
    expect(persistCallRecording).not.toHaveBeenCalled();
  });

  it("gives up after the last attempt, or at once on any other error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(handleJob(recordingJob(LIVE_RECORDING_ATTEMPTS), dependencies(vi.fn(async () => { throw notReady(404); })))).resolves.toEqual({ status: "skipped", entityId: "call_1" });
    expect(error).toHaveBeenCalledWith("[live] live_1 recording never became available");
    await expect(handleJob(recordingJob(1), dependencies(vi.fn(async () => { throw notReady(401); })))).resolves.toEqual({ status: "skipped", entityId: "call_1" });
    expect(retryLiveCallRecording).not.toHaveBeenCalled();
    expect(persistCallRecording).not.toHaveBeenCalled();
  });

  it("stops when a repeated job finds the recording already copied", async () => {
    vi.mocked(liveCallHasRecording).mockResolvedValueOnce(true);
    const download = vi.fn();
    await expect(handleJob(recordingJob(1), dependencies(download))).resolves.toEqual({ status: "skipped", entityId: "call_1" });
    expect(download).not.toHaveBeenCalled();
  });
});

describe("live.recoverOrphans", () => {
  const otherBusinessId = randomUUID();
  const open = (sessionId: string, owner = businessId) => ({ businessId: owner, callId: `call_${sessionId}`, sessionId, channel: "voice", intakeOnly: false, startedAt: new Date(Date.now() - 120_000), reservedSeconds: 600, lastActivityAt: new Date(), lastSequence: 0 }) as OpenLiveCall;
  const redis = (status: string) => ({ status }) as never;
  const recoveryJob = (): JobEnvelope => ({ ...job("live.recoverOrphans"), queue: "critical", businessId: null });

  it("hands every open call older than a minute, in every business, to the live call handler", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingBusinessId = randomUUID();
    vi.mocked(listBusinessesWithOpenLiveCalls).mockResolvedValue([businessId, failingBusinessId, otherBusinessId]);
    vi.mocked(listOpenLiveCalls).mockImplementation(async (_context, input) => {
      if (input.businessId === failingBusinessId) throw new Error("connection reset");
      return input.businessId === businessId ? [open("live_a"), open("live_b"), open("live_c")] : [open("live_d", otherBusinessId)];
    });
    const recoverLiveCall = vi.fn(async (call: OpenLiveCall) => {
      if (call.sessionId === "live_b") throw new Error("snapshot missing");
      return call.sessionId === "live_a" || call.sessionId === "live_d" ? "attached" as const : "owned" as const;
    });
    await expect(handleJob(recoveryJob(), { domain: { db: {} as never }, realtime: redis("ready"), recoverLiveCall })).resolves.toEqual({ status: "completed", entityId: "2" });
    // A business whose listing fails doesn't stop the one after it.
    expect(recoverLiveCall.mock.calls.map(([call]) => call.sessionId)).toEqual(["live_a", "live_b", "live_c", "live_d"]);
    expect(vi.mocked(listOpenLiveCalls).mock.calls.map(([, input]) => input.businessId)).toEqual([businessId, failingBusinessId, otherBusinessId]);
    const { startedBefore } = vi.mocked(listBusinessesWithOpenLiveCalls).mock.calls[0]![1];
    expect(Date.now() - startedBefore.getTime()).toBeGreaterThanOrEqual(60_000);
    expect(Date.now() - startedBefore.getTime()).toBeLessThan(65_000);
    expect(vi.mocked(listOpenLiveCalls).mock.calls.every(([, input]) => input.startedBefore === startedBefore)).toBe(true);
  });

  it("does nothing when GPT-Live is off or Redis is down", async () => {
    const recoverLiveCall = vi.fn();
    await expect(handleJob(recoveryJob(), { domain: { db: {} as never }, realtime: redis("ready"), recoverLiveCall })).resolves.toEqual({ status: "skipped" });
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    await expect(handleJob(recoveryJob(), { domain: { db: {} as never }, realtime: redis("reconnecting"), recoverLiveCall })).resolves.toEqual({ status: "skipped" });
    await expect(handleJob(recoveryJob(), { domain: { db: {} as never }, recoverLiveCall })).resolves.toEqual({ status: "skipped" });
    // A job queued by an old per-business scheduler would run the whole sweep again.
    await expect(handleJob({ ...recoveryJob(), businessId }, { domain: { db: {} as never }, realtime: redis("ready"), recoverLiveCall })).resolves.toEqual({ status: "skipped" });
    expect(listBusinessesWithOpenLiveCalls).not.toHaveBeenCalled();
    expect(recoverLiveCall).not.toHaveBeenCalled();
  });
});
