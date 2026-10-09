import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controllers: 0,
  controllerOptions: [] as Array<Record<string, (...args: never[]) => unknown>>,
  snapshot: vi.fn(),
  recordProductEvent: vi.fn(async (..._args: unknown[]) => "event_1"),
  recordAiGenerationEvent: vi.fn(async (..._args: unknown[]) => "event_2"),
  finishLiveCall: vi.fn(async (..._args: unknown[]) => false),
  createAgentModel: vi.fn((..._args: unknown[]) => ({})),
  callerIsDone: vi.fn(async (..._args: unknown[]) => true),
  createReceptionistAgent: vi.fn((..._args: unknown[]) => ({})),
  closeLiveSession: vi.fn(async (..._args: unknown[]) => undefined),
  controllers_: [] as Array<{ endSession: ReturnType<typeof vi.fn>; endAfterGoodbye: ReturnType<typeof vi.fn>; endWhenCallerDone: ReturnType<typeof vi.fn>; wrapUp: ReturnType<typeof vi.fn>; transferAfterAnnouncement: ReturnType<typeof vi.fn>; canTransfer: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn>; options: Record<string, unknown> }>,
  prepareLiveCallTransfer: vi.fn(async (..._args: unknown[]) => true),
  recordLiveCallTransferResult: vi.fn(async (..._args: unknown[]) => undefined),
  saveLiveCallTurn: vi.fn(async (..._args: unknown[]) => undefined),
  hangup: vi.fn(async (..._args: unknown[]) => undefined),
  lastLiveCallSequence: vi.fn(async (..._args: unknown[]) => 0),
  extendLiveCallReservation: vi.fn(async (..._args: unknown[]) => 300),
}));

vi.mock("@lobbystack/agent-core", () => ({
  callerIsDone: mocks.callerIsDone,
  createAgentModel: mocks.createAgentModel,
  createReceptionistAgent: mocks.createReceptionistAgent,
  liveDelegationEnvironment: () => ({ AI_CHAT_REASONING_EFFORT: "low" }),
  liveLanguage: () => "English",
  closeLiveSession: mocks.closeLiveSession,
  agentModelId: () => ({ provider: "openai", model: "gpt-6-luna" }),
  describeAgentUsage: (usage: { inputTokens: number; outputTokens: number }, latencyMs: number) => ({ provider: "openai", model: "gpt-6-luna", latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalCostUsd: 0.00021 }),
  WRAP_UP_MAX_MS: 30_000,
  LiveCallController: class {
    endSession = vi.fn();
    endAfterGoodbye = vi.fn();
    endWhenCallerDone = vi.fn((_onCancelled?: () => void) => undefined);
    wrapUp = vi.fn(async (_reason: string) => undefined);
    transferAfterAnnouncement = vi.fn((_targetUri: string) => true);
    canTransfer = vi.fn(() => true);
    detach = vi.fn();
    constructor(options: Record<string, (...args: never[]) => unknown>) {
      mocks.controllers += 1;
      mocks.controllerOptions.push(options);
      mocks.controllers_.push({ endSession: this.endSession, endAfterGoodbye: this.endAfterGoodbye, endWhenCallerDone: this.endWhenCallerDone, wrapUp: this.wrapUp, transferAfterAnnouncement: this.transferAfterAnnouncement, canTransfer: this.canTransfer, detach: this.detach, options });
    }
    start() {}
  },
}));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  orphanedLiveCallSeconds: (await importOriginal<typeof import("@lobbystack/domain")>()).orphanedLiveCallSeconds,
  saveLiveCallTurn: mocks.saveLiveCallTurn,
  lastLiveCallSequence: mocks.lastLiveCallSequence,
  extendLiveCallReservation: mocks.extendLiveCallReservation,
  blockLiveCaller: vi.fn(async () => undefined),
  getCachedBusinessSnapshot: mocks.snapshot,
  finishLiveCall: mocks.finishLiveCall,
  prepareLiveCallTransfer: mocks.prepareLiveCallTransfer,
  recordLiveCallTransferResult: mocks.recordLiveCallTransferResult,
  LIVE_CALL_PROVIDER: "openai_live",
  recordProductEvent: mocks.recordProductEvent,
  recordAiGenerationEvent: mocks.recordAiGenerationEvent,
}));
vi.mock("@lobbystack/jobs", () => ({ renewVoicePresenceGateway: vi.fn(async () => undefined), updateVoicePresence: vi.fn(async () => undefined) }));
vi.mock("openai", () => ({ default: class { live = { sessions: { hangup: mocks.hangup } }; } }));

import { createLiveCallHandler, liveDrainTimeoutMs, parseAttachRequest, providerSeconds, RELEASE_ATTACH_LOCK, RENEW_ATTACH_LOCK } from "./liveCalls";

/** The JSON lines a console spy received. */
function logLines(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

function attachRequest(body: Record<string, unknown>, url = "/internal/live/attach"): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url, method: "POST", headers: { "x-internal-service-token": "token" } }) as unknown as IncomingMessage;
}

// A Redis-like lock shared by two worker instances. `eval` runs RENEW_ATTACH_LOCK or RELEASE_ATTACH_LOCK.
function sharedLock() {
  const keys = new Map<string, string>();
  return {
    keys,
    set: vi.fn(async (key: string, value: string) => { if (keys.has(key)) return null; keys.set(key, value); return "OK"; }),
    eval: vi.fn(async (script: string, _numKeys: number, ...args: Array<string | number>) => {
      expect([RENEW_ATTACH_LOCK, RELEASE_ATTACH_LOCK]).toContain(script);
      const [key, owner] = args.map(String) as [string, string];
      const holder = keys.get(key);
      if (script === RELEASE_ATTACH_LOCK) return holder === owner && keys.delete(key) ? 1 : 0;
      if (holder !== undefined && holder !== owner) return 0;
      keys.set(key, owner);
      return 1;
    }),
    del: vi.fn(async (key: string) => (keys.delete(key) ? 1 : 0)),
  };
}

function response(): ServerResponse {
  return { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("createLiveCallHandler", () => {
  it("opens one sideband when two attaches for a session overlap", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    let release!: (value: unknown) => void;
    mocks.snapshot.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    const body = { sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "voice" };
    const first = handler.handle(attachRequest(body), response());
    const second = handler.handle(attachRequest(body), response());
    await new Promise((resolve) => setTimeout(resolve, 10));
    release({ businessId: "biz_1", greeting: "Hi" });
    await Promise.all([first, second]);
    expect(mocks.controllers).toBe(1);
    expect(handler.activeCalls()).toBe(1);
  });

  it("lets only one worker instance attach to a session", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const lock = sharedLock();
    const before = mocks.controllers;
    const first = createLiveCallHandler({ domain: { db: {} as never }, attachLock: lock });
    const second = createLiveCallHandler({ domain: { db: {} as never }, attachLock: lock });
    const body = { sessionId: "live_lock", businessId: "biz_1", callId: "call_1", channel: "voice" };
    await first.handle(attachRequest(body), response());
    await second.handle(attachRequest(body), response());
    expect(mocks.controllers - before).toBe(1);
    expect(second.activeCalls()).toBe(0);
  });

  it("attaches without the lock when Redis doesn't answer in time", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    // A disconnected Redis client queues the command and never answers.
    const stalled = { set: vi.fn(() => new Promise<string | null>(() => undefined)), eval: vi.fn(async () => 1), del: vi.fn(async () => 1) };
    const before = mocks.controllers;
    const handler = createLiveCallHandler({ domain: { db: {} as never }, attachLock: stalled });
    const reply = response();
    await handler.handle(attachRequest({ sessionId: "live_stalled", businessId: "biz_1", callId: "call_1", channel: "voice" }), reply);
    expect(mocks.controllers - before).toBe(1);
    expect(reply.writeHead).toHaveBeenCalledWith(202, expect.anything());
  });

  it("ends a browser session over the sideband it holds, or over a new one", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_end", businessId: "biz_1", callId: "call_1", channel: "web_voice" }), response());
    await handler.handle(attachRequest({ sessionId: "live_end" }, "/internal/live/end"), response());
    expect(mocks.controllers_.at(-1)!.endSession).toHaveBeenCalled();
    await handler.handle(attachRequest({ sessionId: "live_elsewhere" }, "/internal/live/end"), response());
    expect(mocks.closeLiveSession).toHaveBeenCalledWith(expect.anything(), "live_elsewhere");
  });

  it("ends the call after the goodbye when the agent hangs up or a limit is reached", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_bye", businessId: "biz_1", callId: "call_1", channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { hangup: (reason: string) => Promise<void> } } }).context;
    await context.callControl.hangup("caller_finished");
    expect(controller.endWhenCallerDone).toHaveBeenCalled();
    expect(controller.endSession).not.toHaveBeenCalled();
    (controller.options.onTimeout as (reason: string) => void)("silence_timeout");
    expect(controller.wrapUp).toHaveBeenCalledWith("silence_timeout");
    expect(controller.endSession).not.toHaveBeenCalled();
    await expect((controller.options.setup as Promise<{ language: string }>)).resolves.toMatchObject({ greeting: "Hi" });
  });

  // GPT-Live said goodbye and handed the call over; the agent's endCall hangs up once the goodbye has played.
  async function endedByAgent(sessionId: string, reason: "caller_finished" | "spam" | "abuse") {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId, businessId: "biz_1", callId: `call_${sessionId}`, channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { hangup: (reason: string) => Promise<void> } } }).context;
    await context.callControl.hangup(reason);
    // No session.closed before the finalization timeout, so the close reason alone would say connection_lost.
    const close = () => (controller.options.onClose as (summary: unknown) => void)({ sessionId, durationMs: 40_000, delegations: [], usageConfirmed: false, closeReason: "finalize_timeout" });
    return { controller, close };
  }

  it("records a call the agent ended for a caller who is done as caller_finished", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { controller, close } = await endedByAgent("live_done", "caller_finished");
    // The caller can still say more before the hangup, so it isn't the non-cancellable end.
    expect(controller.endWhenCallerDone).toHaveBeenCalledOnce();
    expect(controller.endAfterGoodbye).not.toHaveBeenCalled();
    close();
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: "call_live_done", end: "caller_finished" })));
    const closed = JSON.parse(String(info.mock.calls.find((call) => String(call[0]).includes("\"live.closed\""))![0]));
    expect(closed).toMatchObject({ level: "info", message: "live.closed", sessionId: "live_done", callId: "call_live_done", end: "caller_finished" });
    expect(closed).not.toHaveProperty("autoHangup");
    info.mockRestore();
  });

  it("drops caller_finished when the caller keeps talking, so a later timeout records its own reason", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { controller, close } = await endedByAgent("live_more", "caller_finished");
    (controller.endWhenCallerDone.mock.lastCall![0] as () => void)();
    (controller.options.onTimeout as (reason: string) => void)("silence_timeout");
    expect(controller.wrapUp).toHaveBeenCalledWith("silence_timeout");
    close();
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: "call_live_more", end: "silence_timeout" })));
    info.mockRestore();
  });

  it.each(["spam", "abuse"] as const)("ends a %s call once the goodbye has played, whatever the caller says", async (reason) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { controller, close } = await endedByAgent(`live_${reason}`, reason);
    expect(controller.endAfterGoodbye).toHaveBeenCalledOnce();
    expect(controller.endWhenCallerDone).not.toHaveBeenCalled();
    close();
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: `call_live_${reason}`, end: reason })));
    info.mockRestore();
  });

  it("ends a call within its reserved minutes, and never past 30 minutes", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    const limits: unknown[] = [];
    for (const [sessionId, maxDurationMs] of [["live_two", 120_000], ["live_long", 99 * 60_000], ["live_unlimited", undefined]] as const) {
      await handler.handle(attachRequest({ sessionId, businessId: "biz_1", callId: "call_1", channel: "voice", ...(maxDurationMs ? { maxDurationMs } : {}) }), response());
      limits.push(mocks.controllers_.at(-1)!.options.maxDurationMs);
    }
    expect(limits).toEqual([120_000, 30 * 60_000, 30 * 60_000]);
  });

  it("tops up a phone call's reservation, including a resumed one, but not on an unlimited plan or for a browser call", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    const topUps: unknown[] = [];
    for (const body of [
      { sessionId: "live_reserved", channel: "voice", maxDurationMs: 300_000 },
      { sessionId: "live_resumed", channel: "voice", maxDurationMs: 600_000, resume: true },
      { sessionId: "live_unlimited_plan", channel: "voice" },
      { sessionId: "live_browser", channel: "web_voice", maxDurationMs: 300_000 },
    ]) {
      await handler.handle(attachRequest({ businessId: "biz_1", callId: `call_${body.sessionId}`, ...body }), response());
      topUps.push(mocks.controllers_.at(-1)!.options.topUp);
    }
    expect(topUps.map((topUp) => typeof topUp)).toEqual(["function", "function", "undefined", "undefined"]);
    // The domain grants seconds; the controller extends the limit in milliseconds.
    mocks.extendLiveCallReservation.mockClear();
    await expect((topUps[0] as () => Promise<number>)()).resolves.toBe(300_000);
    expect(mocks.extendLiveCallReservation).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", callId: "call_live_reserved" });
    mocks.extendLiveCallReservation.mockResolvedValueOnce(0);
    await expect((topUps[1] as () => Promise<number>)()).resolves.toBe(0);
  });

  it("refers a transfer after the announcement, and records it as referred until the destination answers", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.recordLiveCallTransferResult.mockClear();
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_transfer", businessId: "biz_1", callId: "call_t", channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { transfer: (destination: string) => Promise<boolean> } } }).context;
    await expect(context.callControl.transfer("+14165550199")).resolves.toBe(true);
    expect(controller.transferAfterAnnouncement).toHaveBeenCalledWith("tel:+14165550199");
    expect(mocks.recordLiveCallTransferResult).not.toHaveBeenCalled();
    const onTransfer = controller.options.onTransfer as (state: string) => void;
    onTransfer("referred");
    onTransfer("completed");
    await vi.waitFor(() => expect(mocks.recordLiveCallTransferResult.mock.calls.map((call) => (call[1] as { state: string }).state)).toEqual(["referred", "completed"]));
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_transfer", durationMs: 20_000, delegations: [], usageConfirmed: true, billedSeconds: 20, closeReason: "remote_hangup" });
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: "call_t", end: "transferred" })));
  });

  it("doesn't count a failed transfer as transferred", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_transfer_failed", businessId: "biz_1", callId: "call_tf", channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    const onTransfer = controller.options.onTransfer as (state: string) => void;
    onTransfer("referred");
    onTransfer("failed");
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_transfer_failed", durationMs: 60_000, delegations: [], usageConfirmed: true, billedSeconds: 60, closeReason: "remote_hangup" });
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: "call_tf", end: "caller_hung_up" })));
  });

  it("tells the agent a transfer didn't start when the controller skipped it", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_transfer_skipped", businessId: "biz_1", callId: "call_ts", channel: "voice" }), response());
    // A transfer is already under way, or the call is ending.
    mocks.controllers_.at(-1)!.transferAfterAnnouncement.mockReturnValueOnce(false);
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { transfer: (destination: string) => Promise<boolean> } } }).context;
    await expect(context.callControl.transfer("+14165550199")).resolves.toBe(false);
  });

  it("reserves no transfer attempt while another transfer is under way or the call is ending", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_transfer_busy", businessId: "biz_1", callId: "call_tb", channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    controller.canTransfer.mockReturnValueOnce(false);
    mocks.prepareLiveCallTransfer.mockClear();
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { transfer: (destination: string) => Promise<boolean> } } }).context;
    await expect(context.callControl.transfer("+14165550199")).resolves.toBe(false);
    expect(mocks.prepareLiveCallTransfer).not.toHaveBeenCalled();
    expect(controller.transferAfterAnnouncement).not.toHaveBeenCalled();
  });

  it("records a call as transferred once the REFER goes out, even when the session closes before OpenAI answers it", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.recordLiveCallTransferResult.mockClear();
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    for (const [sessionId, states, end] of [["live_refer_raced", ["referring"], "transferred"], ["live_refer_refused", ["referring", "failed"], "caller_hung_up"]] as const) {
      await handler.handle(attachRequest({ sessionId, businessId: "biz_1", callId: `call_${sessionId}`, channel: "voice" }), response());
      const controller = mocks.controllers_.at(-1)!;
      for (const state of states) (controller.options.onTransfer as (state: string) => void)(state);
      (controller.options.onClose as (summary: unknown) => void)({ sessionId, durationMs: 20_000, delegations: [], usageConfirmed: true, billedSeconds: 20, closeReason: "remote_hangup" });
      await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: `call_${sessionId}`, end })));
    }
    // The REFER going out isn't a state of its own in the call record.
    await vi.waitFor(() => expect(mocks.recordLiveCallTransferResult.mock.calls.map((call) => (call[1] as { state: string }).state)).toEqual(["failed"]));
  });

  it("keeps the attach lock until the call record is finalized", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const lock = sharedLock();
    const handler = createLiveCallHandler({ domain: { db: {} as never }, attachLock: lock });
    await handler.handle(attachRequest({ sessionId: "live_finalizing", businessId: "biz_1", callId: "call_f", channel: "voice" }), response());
    let finalize!: () => void;
    mocks.finishLiveCall.mockImplementationOnce(() => new Promise((resolve) => { finalize = () => resolve(true); }));
    (mocks.controllers_.at(-1)!.options.onClose as (summary: unknown) => void)({ sessionId: "live_finalizing", durationMs: 20_000, delegations: [], usageConfirmed: true, billedSeconds: 20, closeReason: "remote_hangup" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // A recovery job can't take the ending call and finalize it with estimated seconds.
    expect(lock.keys.has("live-attach:live_finalizing")).toBe(true);
    finalize();
    await vi.waitFor(() => expect(lock.keys.has("live-attach:live_finalizing")).toBe(false));
  });

  it("leaves the attach lock alone when another worker took it over before the call ended", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const lock = sharedLock();
    const handler = createLiveCallHandler({ domain: { db: {} as never }, attachLock: lock });
    await handler.handle(attachRequest({ sessionId: "live_taken_over", businessId: "biz_1", callId: "call_to", channel: "voice" }), response());
    lock.keys.set("live-attach:live_taken_over", "worker:other");
    (mocks.controllers_.at(-1)!.options.onClose as (summary: unknown) => void)({ sessionId: "live_taken_over", durationMs: 20_000, delegations: [], usageConfirmed: true, billedSeconds: 20, closeReason: "remote_hangup" });
    await vi.waitFor(() => expect(lock.eval).toHaveBeenCalledWith(RELEASE_ATTACH_LOCK, 1, "live-attach:live_taken_over", expect.any(String)));
    expect(lock.keys.get("live-attach:live_taken_over")).toBe("worker:other");
  });
});

describe("re-attaching after a retried webhook delivery", () => {
  async function attach(body: Record<string, unknown>) {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.saveLiveCallTurn.mockClear();
    mocks.lastLiveCallSequence.mockClear();
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ businessId: "biz_1", callId: "call_resume", channel: "voice", ...body }), response());
    const controller = mocks.controllers_.at(-1)!;
    (controller.options.onTurn as (turn: unknown) => void)({ sequence: 1, speaker: "caller", text: "Hello?" });
    await vi.waitFor(() => expect(mocks.saveLiveCallTurn).toHaveBeenCalledOnce());
    return { setup: await (controller.options.setup as Promise<{ greeting?: string }>), sequence: (mocks.saveLiveCallTurn.mock.calls[0]![1] as { sequence: number }).sequence };
  }

  it("numbers turns after the saved ones, and skips the greeting when a transcript exists", async () => {
    mocks.lastLiveCallSequence.mockResolvedValueOnce(5);
    const { setup, sequence } = await attach({ sessionId: "live_resume", resume: true });
    expect(mocks.lastLiveCallSequence).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", callId: "call_resume" });
    expect(sequence).toBe(6);
    expect(setup).not.toHaveProperty("greeting");
  });

  it("still greets a resumed call with no transcript yet", async () => {
    mocks.lastLiveCallSequence.mockResolvedValueOnce(0);
    const { setup, sequence } = await attach({ sessionId: "live_resume_new", resume: true });
    expect(sequence).toBe(1);
    expect(setup).toMatchObject({ greeting: "Hi" });
  });

  it("makes no extra read on a first attach", async () => {
    const { setup, sequence } = await attach({ sessionId: "live_first" });
    expect(mocks.lastLiveCallSequence).not.toHaveBeenCalled();
    expect(sequence).toBe(1);
    expect(setup).toMatchObject({ greeting: "Hi" });
  });
});

describe("worker shutdown drain", () => {
  const summary = (sessionId: string) => ({ sessionId, durationMs: 1_000, delegations: [], usageConfirmed: true, billedSeconds: 1, lateAttach: false, outputAudio: { deltas: 0, coveredMs: 0, payloadBytes: 0 }, inputAudio: { chunks: 0, coveredMs: 0, loudMs: 0, payloadBytes: 0 } });

  async function startCall(sessionId: string) {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId, businessId: "biz_1", callId: `call_${sessionId}`, channel: "voice" }), response());
    return { handler, controller: mocks.controllers_.at(-1)! };
  }

  it("answers new attaches with 503 while draining, so the admin retries them elsewhere", async () => {
    const { handler, controller } = await startCall("live_drain_busy");
    const drain = handler.drain(60_000);
    const reply = response();
    await handler.handle(attachRequest({ sessionId: "live_drain_new", businessId: "biz_1", callId: "call_new", channel: "voice" }), reply);
    // So the admin's retry doesn't reuse a kept-alive connection to this instance.
    expect(reply.writeHead).toHaveBeenCalledWith(503, { "content-type": "application/json", connection: "close" });
    expect(handler.activeCalls()).toBe(1);
    (controller.options.onClose as (summary: unknown) => void)(summary("live_drain_busy"));
    await drain;
  });

  it("refuses an attach still reading its body when a drain starts", async () => {
    const { handler, controller } = await startCall("live_drain_reading");
    const before = mocks.controllers;
    const reply = response();
    const attached = handler.handle(attachRequest({ sessionId: "live_drain_late_body", businessId: "biz_1", callId: "call_late_body", channel: "voice" }), reply);
    const drain = handler.drain(60_000);
    await attached;
    expect(reply.writeHead).toHaveBeenCalledWith(503, expect.anything());
    expect(mocks.controllers - before).toBe(0);
    (controller.options.onClose as (summary: unknown) => void)(summary("live_drain_reading"));
    await drain;
  });

  it("lets a call end on its own without hanging it up", async () => {
    const { handler, controller } = await startCall("live_drain_own");
    let drained = false;
    const drain = handler.drain(60_000).then(() => { drained = true; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);
    (controller.options.onClose as (summary: unknown) => void)(summary("live_drain_own"));
    await drain;
    expect(controller.wrapUp).not.toHaveBeenCalled();
    expect(controller.endSession).not.toHaveBeenCalled();
  });

  it("asks a call still running at the timeout to say goodbye, and resolves only once its record is finalized", async () => {
    const { handler, controller } = await startCall("live_drain_late");
    let finalize!: () => void;
    mocks.finishLiveCall.mockImplementationOnce(() => new Promise((resolve) => { finalize = () => resolve(false); }));
    // The goodbye plays, the call hangs up and OpenAI confirms the close.
    controller.wrapUp.mockImplementation(async () => { (controller.options.onClose as (summary: unknown) => void)(summary("live_drain_late")); });
    let drained = false;
    const drain = handler.drain(20).then(() => { drained = true; });
    await vi.waitFor(() => expect(controller.wrapUp).toHaveBeenCalledWith("service_restart"));
    // The call record says why it ended, instead of OpenAI's close reason.
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: "call_live_drain_late", end: "service_restart" })));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);
    finalize();
    await drain;
    expect(drained).toBe(true);
  });

  it("wraps up a call that becomes active after the timeout, from an attach still taking its lock", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const slowLock = { ...sharedLock(), set: vi.fn(() => new Promise<string | null>((resolve) => setTimeout(() => resolve("OK"), 100))) };
    const handler = createLiveCallHandler({ domain: { db: {} as never }, attachLock: slowLock });
    const before = mocks.controllers;
    const attached = handler.handle(attachRequest({ sessionId: "live_drain_starting", businessId: "biz_1", callId: "call_starting", channel: "voice" }), response());
    // The attach has read its body and is waiting for the lock.
    await new Promise((resolve) => setTimeout(resolve, 10));
    let drained = false;
    const drain = handler.drain(20).then(() => { drained = true; });
    await vi.waitFor(() => expect(mocks.controllers - before).toBe(1));
    const controller = mocks.controllers_.at(-1)!;
    await vi.waitFor(() => expect(controller.wrapUp).toHaveBeenCalledWith("service_restart"));
    expect(drained).toBe(false);
    (controller.options.onClose as (summary: unknown) => void)(summary("live_drain_starting"));
    await Promise.all([attached, drain]);
    expect(handler.activeCalls()).toBe(0);
  });

  it("leaves a call to the next deployment when a drain starts while its recovery waits for the lock", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const lock = sharedLock();
    const slowLock = { ...lock, set: vi.fn((key: string, value: string) => new Promise<string | null>((resolve) => setTimeout(() => resolve(lock.set(key, value)), 100))) };
    const handler = createLiveCallHandler({ domain: { db: {} as never }, attachLock: slowLock });
    const before = mocks.controllers;
    const now = Date.now();
    const recovered = handler.recover({ businessId: "biz_1", callId: "call_drain_recover", sessionId: "live_drain_recover", channel: "voice", intakeOnly: false, startedAt: new Date(now - 120_000), reservedSeconds: 600, slicedReservation: true, lastActivityAt: new Date(now - 60_000), lastSequence: 0 });
    await handler.drain(0);
    await expect(recovered).resolves.toBe("skipped");
    expect(mocks.controllers - before).toBe(0);
    expect(lock.keys.has("live-attach:live_drain_recover")).toBe(false);
  });
});

describe("recovering a call whose worker died", () => {
  const now = Date.now();
  // Started two minutes ago with ten minutes reserved; its last turn was saved a minute ago.
  const orphan = (sessionId: string, overrides: Record<string, unknown> = {}) => ({
    businessId: "biz_1", callId: `call_${sessionId}`, sessionId, channel: "voice" as const, conversationId: "conv_1", callerPhone: "+14165550100", intakeOnly: false,
    startedAt: new Date(now - 120_000), reservedSeconds: 600, slicedReservation: true, lastActivityAt: new Date(now - 60_000), lastSequence: 7,
    ...overrides,
  });

  function recoveringWorker(lock = sharedLock()) {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    return createLiveCallHandler({ domain: { db: {} as never }, attachLock: lock });
  }

  it("re-attaches an orphaned call with no lock for the rest of its reserved minutes", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const lock = sharedLock();
    const before = mocks.controllers;
    await expect(recoveringWorker(lock).recover(orphan("live_orphan"))).resolves.toBe("attached");
    expect(mocks.controllers - before).toBe(1);
    expect(lock.set).toHaveBeenCalledWith("live-attach:live_orphan", expect.stringMatching(/^worker:/), "PX", 30_000, "NX");
    const controller = mocks.controllers_.at(-1)!;
    expect(controller.options).toMatchObject({ sessionId: "live_orphan", phone: true, firstEventTimeoutMs: 5_000 });
    // Ten minutes reserved, two used when the fixture was made.
    expect(controller.options.maxDurationMs as number).toBeGreaterThan(480_000 - (Date.now() - now) - 1_000);
    expect(controller.options.maxDurationMs as number).toBeLessThanOrEqual(480_000);
    // The call is under way, so no greeting fallback.
    await expect(controller.options.setup as Promise<{ greeting?: string }>).resolves.not.toHaveProperty("greeting");
    expect(mocks.createReceptionistAgent).toHaveBeenLastCalledWith(expect.objectContaining({ context: expect.objectContaining({ callId: "call_live_orphan", conversationId: "conv_1", callerPhone: "+14165550100", channel: "voice" }) }));
    // New turns follow the seven its first worker saved.
    (controller.options.onTurn as (turn: unknown) => void)({ sequence: 1, speaker: "caller", text: "Hello? Are you still there?" });
    await vi.waitFor(() => expect(mocks.saveLiveCallTurn).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ callId: "call_live_orphan", sequence: 8 })));
    // The sequence came with the orphan, so nothing more was read.
    expect(mocks.lastLiveCallSequence).not.toHaveBeenCalled();

    (controller.options.onFirstEvent as () => void)();
    const recovered = JSON.parse(String(info.mock.calls.find((call) => String(call[0]).includes("live.recovered"))![0]));
    expect(recovered).toMatchObject({ level: "info", message: "live.recovered", sessionId: "live_orphan", callId: "call_live_orphan", channel: "voice", note: "Delegations during the gap went unanswered." });
    expect(recovered.gapMs).toBeGreaterThanOrEqual(60_000);

    // OpenAI's usage covers the whole session; our own measurement runs from the call's original start.
    mocks.finishLiveCall.mockClear();
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_orphan", durationMs: 30_000, delegations: [], usageConfirmed: true, billedSeconds: 150, closeReason: "remote_hangup" });
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalledOnce());
    const finished = mocks.finishLiveCall.mock.calls[0]![1] as { seconds: number; measuredSeconds: number; end: string; recording: unknown };
    expect(finished).toMatchObject({ callId: "call_live_orphan", seconds: 150, end: "caller_hung_up", recording: { sessionId: "live_orphan", durationMs: expect.any(Number) } });
    expect(finished.measuredSeconds).toBeGreaterThanOrEqual(120);
    info.mockRestore();
  });

  it("measures a recovered call from its original start when OpenAI never confirms the usage", async () => {
    const handler = recoveringWorker();
    await handler.recover(orphan("live_orphan_unconfirmed"));
    const controller = mocks.controllers_.at(-1)!;
    (controller.options.onFirstEvent as () => void)();
    mocks.finishLiveCall.mockClear();
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_orphan_unconfirmed", durationMs: 10_000, delegations: [], usageConfirmed: false, billedSeconds: 30, closeReason: "sideband_closed" });
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalledOnce());
    expect((mocks.finishLiveCall.mock.calls[0]![1] as { seconds: number }).seconds).toBeGreaterThanOrEqual(120);
  });

  it("leaves a call that saved a turn in the last 45 seconds to its worker, even without a lock", async () => {
    const lock = sharedLock();
    await expect(recoveringWorker(lock).recover(orphan("live_busy", { lastActivityAt: new Date(Date.now() - 10_000) }))).resolves.toBe("owned");
    expect(lock.set).not.toHaveBeenCalled();
  });

  it("leaves a call whose sideband can't connect for the next run, without hanging up or finishing it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const lock = sharedLock();
    const handler = recoveringWorker(lock);
    await handler.recover(orphan("live_unreachable"));
    const controller = mocks.controllers_.at(-1)!;
    mocks.finishLiveCall.mockClear();
    mocks.hangup.mockClear();
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_unreachable", durationMs: 2_000, delegations: [], usageConfirmed: false, closeReason: "sideband_closed" });
    await vi.waitFor(() => expect(lock.keys.has("live-attach:live_unreachable")).toBe(false));
    expect(mocks.hangup).not.toHaveBeenCalled();
    expect(mocks.finishLiveCall).not.toHaveBeenCalled();
    expect(logLines(warn)).toContainEqual(expect.objectContaining({ level: "warn", message: "live.recovery_deferred", sessionId: "live_unreachable", callId: "call_live_unreachable", businessId: "biz_1" }));
    // The next run takes it again.
    await expect(handler.recover(orphan("live_unreachable"))).resolves.toBe("attached");
    warn.mockRestore();
  });

  it("finishes a silent re-attach only once its hangup goes through", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lock = sharedLock();
    await recoveringWorker(lock).recover(orphan("live_hangup_failed"));
    const controller = mocks.controllers_.at(-1)!;
    mocks.finishLiveCall.mockClear();
    mocks.hangup.mockClear();
    mocks.hangup.mockRejectedValueOnce(new Error("Request timed out."));
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_hangup_failed", durationMs: 5_000, delegations: [], usageConfirmed: false, closeReason: "no_session_events" });
    await vi.waitFor(() => expect(lock.keys.has("live-attach:live_hangup_failed")).toBe(false));
    expect(mocks.hangup).toHaveBeenCalledWith("live_hangup_failed", { timeout: 5_000 });
    expect(mocks.finishLiveCall).not.toHaveBeenCalled();
    vi.mocked(console.warn).mockRestore();
    vi.mocked(console.error).mockRestore();
  });

  it("lets a call go when another worker took its lock, without hanging up or finishing it", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379");
      vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
      const lock = sharedLock();
      const handler = recoveringWorker(lock);
      await handler.handle(attachRequest({ sessionId: "live_taken", businessId: "biz_1", callId: "call_taken", channel: "voice" }), response());
      const controller = mocks.controllers_.at(-1)!;
      // Redis lost this worker for longer than the lock lasts, and a recovery took the call.
      lock.keys.set("live-attach:live_taken", "worker:recovering");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(controller.detach).toHaveBeenCalledOnce();
      // Logged in the call's context, though the lock renewal runs outside it.
      expect(logLines(warn)).toContainEqual(expect.objectContaining({ level: "warn", message: "live.detached", sessionId: "live_taken", callId: "call_taken", businessId: "biz_1" }));
      // The controller closes its sideband and reports the detach.
      mocks.finishLiveCall.mockClear();
      (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_taken", durationMs: 50_000, delegations: [], usageConfirmed: false, closeReason: "detached" });
      await vi.advanceTimersByTimeAsync(0);
      expect(handler.activeCalls()).toBe(0);
      expect(mocks.finishLiveCall).not.toHaveBeenCalled();
      expect(lock.keys.get("live-attach:live_taken")).toBe("worker:recovering");
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("leaves a call alone while its owner renews the lock", async () => {
    const lock = sharedLock();
    await lock.set("live-attach:live_owned", "worker:alive");
    const before = mocks.controllers;
    mocks.finishLiveCall.mockClear();
    mocks.hangup.mockClear();
    await expect(recoveringWorker(lock).recover(orphan("live_owned"))).resolves.toBe("owned");
    expect(mocks.controllers - before).toBe(0);
    expect(mocks.finishLiveCall).not.toHaveBeenCalled();
    expect(mocks.hangup).not.toHaveBeenCalled();
  });

  it("finishes an orphan whose session is gone with its best known length", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await recoveringWorker().recover(orphan("live_gone"));
    const controller = mocks.controllers_.at(-1)!;
    mocks.finishLiveCall.mockClear();
    mocks.hangup.mockClear();
    mocks.finishLiveCall.mockResolvedValueOnce(true);
    // The controller hung up after hearing nothing (see sideband.test.ts in agent-core).
    (controller.options.onClose as (summary: unknown) => void)({ sessionId: "live_gone", durationMs: 5_000, delegations: [], usageConfirmed: false, closeReason: "no_session_events" });
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalledOnce());
    // The worker hung up first, and only finishes because that went through.
    expect(mocks.hangup).toHaveBeenCalledWith("live_gone", { timeout: 5_000 });
    // From the start to the last saved turn, 60 seconds.
    expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1", callId: "call_live_gone", seconds: 60, measuredSeconds: 60, end: "connection_lost", endedAt: new Date(now - 60_000), channel: "voice",
      recording: { sessionId: "live_gone", durationMs: 60_000 },
    });
    await vi.waitFor(() => expect(logLines(info)).toContainEqual({ level: "info", message: "live.orphan_finished", sessionId: "live_gone", callId: "call_live_gone", businessId: "biz_1", channel: "voice", reason: "session_gone", measuredSeconds: 60, completed: true }));
    info.mockRestore();
  });

  it("hangs up an orphan past its reserved length and bills no more than it reserved", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const lock = sharedLock();
    const before = mocks.controllers;
    mocks.finishLiveCall.mockClear();
    mocks.hangup.mockClear();
    // Ten minutes reserved, started almost twelve minutes ago, a turn saved eleven minutes in.
    const late = orphan("live_late", { startedAt: new Date(now - 700_000), lastActivityAt: new Date(now - 60_000) });
    // The plan has no minutes left for another slice.
    mocks.extendLiveCallReservation.mockClear();
    mocks.extendLiveCallReservation.mockResolvedValueOnce(0);
    await expect(recoveringWorker(lock).recover(late)).resolves.toBe("finished");
    expect(mocks.extendLiveCallReservation).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", callId: "call_live_late" });
    expect(mocks.controllers - before).toBe(0);
    // A hanging OpenAI can't hold up the job.
    expect(mocks.hangup).toHaveBeenCalledWith("live_late", { timeout: 5_000 });
    expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: "call_live_late", seconds: 600, measuredSeconds: 600, end: "connection_lost" }));
    expect(lock.keys.has("live-attach:live_late")).toBe(false);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("\"reason\":\"past_reservation\""));
    info.mockRestore();
  });

  it("closes a browser orphan past its reserved length over a new sideband", async () => {
    mocks.closeLiveSession.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(recoveringWorker().recover(orphan("live_late_web", { channel: "web_voice", slicedReservation: false, startedAt: new Date(now - 700_000) }))).resolves.toBe("finished");
    expect(mocks.closeLiveSession).toHaveBeenCalledWith(expect.anything(), "live_late_web", 5_000);
    vi.mocked(console.info).mockRestore();
  });

  it("re-attaches an orphan that ran past its reservation when one more slice covers the gap", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const before = mocks.controllers;
    mocks.extendLiveCallReservation.mockClear();
    mocks.extendLiveCallReservation.mockResolvedValueOnce(300);
    // Ten minutes reserved, almost twelve gone: the slice leaves about three.
    await expect(recoveringWorker().recover(orphan("live_late_topped_up", { startedAt: new Date(now - 700_000) }))).resolves.toBe("attached");
    expect(mocks.extendLiveCallReservation).toHaveBeenCalledOnce();
    expect(mocks.controllers - before).toBe(1);
    const controller = mocks.controllers_.at(-1)!;
    expect(controller.options.maxDurationMs as number).toBeGreaterThan(200_000 - (Date.now() - now) - 1_000);
    expect(controller.options.maxDurationMs as number).toBeLessThanOrEqual(200_000);
    vi.mocked(console.info).mockRestore();
  });

  it("tops up a recovered phone call's reservation, but not on an unlimited plan or for a browser call", async () => {
    mocks.extendLiveCallReservation.mockClear();
    const handler = recoveringWorker();
    const topUps: unknown[] = [];
    for (const [sessionId, overrides] of [["live_recovered_reserved", {}], ["live_recovered_unlimited", { slicedReservation: false }], ["live_recovered_web", { channel: "web_voice", slicedReservation: false }]] as const) {
      await expect(handler.recover(orphan(sessionId, overrides))).resolves.toBe("attached");
      topUps.push(mocks.controllers_.at(-1)!.options.topUp);
    }
    expect(topUps.map((topUp) => typeof topUp)).toEqual(["function", "undefined", "undefined"]);
    // None of them was past its reservation, so recovery itself asked for nothing.
    expect(mocks.extendLiveCallReservation).not.toHaveBeenCalled();
    await expect((topUps[0] as () => Promise<number>)()).resolves.toBe(300_000);
    expect(mocks.extendLiveCallReservation).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", callId: "call_live_recovered_reserved" });
  });

  it("attaches once when two workers recover the same call at once", async () => {
    const lock = sharedLock();
    const before = mocks.controllers;
    const [first, second] = [recoveringWorker(lock), recoveringWorker(lock)];
    const outcomes = await Promise.all([first.recover(orphan("live_race")), second.recover(orphan("live_race"))]);
    expect(outcomes.sort()).toEqual(["attached", "owned"]);
    expect(mocks.controllers - before).toBe(1);
    expect(first.activeCalls() + second.activeCalls()).toBe(1);
  });

  it("never recovers without Redis to lock with", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stalled = { set: vi.fn(() => new Promise<string | null>(() => undefined)), eval: vi.fn(async () => 1), del: vi.fn(async () => 1) };
    const before = mocks.controllers;
    await expect(recoveringWorker(stalled as never).recover(orphan("live_no_redis"))).resolves.toBe("skipped");
    expect(mocks.controllers - before).toBe(0);
  });

  it("takes back an attach lock that expired, so the recovery job doesn't read the call as orphaned", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379");
      vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
      const lock = sharedLock();
      const handler = recoveringWorker(lock);
      await handler.handle(attachRequest({ sessionId: "live_renew", businessId: "biz_1", callId: "call_renew", channel: "voice" }), response());
      const owner = lock.keys.get("live-attach:live_renew");
      // Redis lost the key, say after a restart.
      await lock.del("live-attach:live_renew");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(lock.eval).toHaveBeenCalledWith(RENEW_ATTACH_LOCK, 1, "live-attach:live_renew", owner, 30_000);
      expect(lock.keys.get("live-attach:live_renew")).toBe(owner);
      expect(mocks.controllers_.at(-1)!.detach).not.toHaveBeenCalled();
      await expect(handler.recover(orphan("live_renew"))).resolves.toBe("owned");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("liveDrainTimeoutMs", () => {
  it("leaves room before Railway's SIGKILL for the goodbye and finalization", () => {
    expect(liveDrainTimeoutMs({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "1860" })).toBe(1_825_000);
    expect(liveDrainTimeoutMs({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "20" })).toBe(0);
  });

  it("wraps calls up at once when the platform gives no time, unless LIVE_DRAIN_TIMEOUT_MS says otherwise", () => {
    expect(liveDrainTimeoutMs({})).toBe(0);
    expect(liveDrainTimeoutMs({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "", LIVE_DRAIN_TIMEOUT_MS: "" })).toBe(0);
    expect(liveDrainTimeoutMs({ RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "1860", LIVE_DRAIN_TIMEOUT_MS: "60000" })).toBe(60_000);
    expect(liveDrainTimeoutMs({ LIVE_DRAIN_TIMEOUT_MS: "0" })).toBe(0);
  });
});

describe("live call latency telemetry", () => {
  async function startCall() {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    mocks.recordProductEvent.mockClear();
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_2", businessId: "biz_1", callId: "call_2", channel: "web_voice", conversationId: "conv_2", callerPhone: "+14165550100" }), response());
    return mocks.controllerOptions.at(-1)!;
  }

  const delegation = { delegationId: "del_1", offsetMs: 4_000, transcriptWaitMs: 12, queueMs: 0, superseded: false, agentMs: 1_800, totalMs: 1_812, tools: ["getBusinessHours", "getBusinessHours"], modelSteps: 1, directAnswer: true, stepMs: [1_800], toolMs: 40, answer: "We're open until 5.", failed: false };

  it("answers delegations on the delegation model and speaks direct tool answers", async () => {
    await startCall();
    expect(mocks.createAgentModel).toHaveBeenLastCalledWith({ AI_CHAT_REASONING_EFFORT: "low" });
    expect(mocks.createReceptionistAgent).toHaveBeenLastCalledWith(expect.objectContaining({ directToolAnswers: true }));
  });

  it("logs live.delegation with timings, tools, model steps and per-step times", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = await startCall();
    options.onDelegation!(delegation as never);
    expect(logLines(info)).toContainEqual({ level: "info", message: "live.delegation", sessionId: "live_2", callId: "call_2", businessId: "biz_1", delegationId: "del_1", agentMs: 1_800, totalMs: 1_812, queueMs: 0, tools: ["getBusinessHours", "getBusinessHours"], modelSteps: 1, directAnswer: true, stepMs: [1_800], toolMs: 40, failed: false, superseded: false });
    info.mockRestore();
  });

  it("records voice.delegation_completed with timings and tool names only", async () => {
    const options = await startCall();
    options.onDelegation!(delegation as never);

    expect(mocks.recordProductEvent).toHaveBeenCalledWith({ db: {} }, {
      name: "voice.delegation_completed",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      actorType: "worker",
      properties: { callId: "call_2", channel: "web_voice", provider: "openai_live", conversationId: "conv_2", agentMs: 1_800, totalMs: 1_812, tools: ["getBusinessHours"], toolCount: 2, modelSteps: 1, directAnswer: true, toolMs: 40, modelMs: 1_760, failed: false },
    });
    expect(JSON.stringify(mocks.recordProductEvent.mock.calls)).not.toMatch(/open until|4165550100/);
  });

  it("records one voice.call_latency_recorded summary when the call closes", async () => {
    mocks.finishLiveCall.mockResolvedValueOnce(true);
    const options = await startCall();
    options.onClose!({
      sessionId: "live_2",
      durationMs: 60_000,
      delegations: [delegation, { ...delegation, delegationId: "del_2", totalMs: 3_000, failed: true }, { ...delegation, delegationId: "del_3", totalMs: 900 }],
      latency: { firstSpeechMs: 1_100, greetedFirst: true, answerGapsMs: [700, 400, 2_500, 900], speechSource: "transcript" },
    } as never);
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.recordProductEvent).toHaveBeenCalledWith({ db: {} }, expect.objectContaining({
      name: "voice.call_latency_recorded",
      businessId: "biz_1",
      properties: {
        callId: "call_2",
        channel: "web_voice",
        provider: "openai_live",
        conversationId: "conv_2",
        greetingMs: 1_100,
        firstSpeechMs: 1_100,
        greetedFirst: true,
        speechTimingSource: "transcript",
        answerCount: 4,
        answerP50Ms: 700,
        answerP90Ms: 2_500,
        answerMaxMs: 2_500,
        delegationCount: 3,
        delegationFailedCount: 1,
        delegationP50TotalMs: 1_812,
        delegationMaxTotalMs: 3_000,
        durationMs: 60_000,
      },
    }));
  });

  it("skips the latency summary when a late re-attach finds the call already finished", async () => {
    mocks.finishLiveCall.mockResolvedValueOnce(false);
    const options = await startCall();
    options.onClose!({ sessionId: "live_2", durationMs: 1_000, delegations: [] } as never);
    await vi.waitFor(() => expect(mocks.finishLiveCall).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.recordProductEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "voice.call_latency_recorded" }));
  });

  it("records the delegation's model usage and cost as a voice.delegation generation", async () => {
    const options = await startCall();
    mocks.recordAiGenerationEvent.mockClear();
    options.onDelegation!({ ...delegation, usage: { inputTokens: 1_400, outputTokens: 60 } } as never);
    expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith({ db: {} }, {
      provider: "openai",
      model: "gpt-6-luna",
      latencyMs: 1_800,
      inputTokens: 1_400,
      outputTokens: 60,
      totalCostUsd: 0.00021,
      businessId: "biz_1",
      operation: "voice.delegation",
      callId: "call_2",
      conversationId: "conv_2",
      financialEventKey: "voice_delegation:call_2:del_1",
    });
  });

  it("records a failed delegation as an errored generation with no cost", async () => {
    const options = await startCall();
    mocks.recordAiGenerationEvent.mockClear();
    options.onDelegation!({ ...delegation, failed: true } as never);
    expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith({ db: {} }, expect.objectContaining({ operation: "voice.delegation", isError: true, error: "generation_failed", model: "gpt-6-luna" }));
    expect(mocks.recordAiGenerationEvent.mock.calls[0]![1]).not.toHaveProperty("totalCostUsd");
  });

  it("checks a caller who spoke after the call was ended on the delegation model, and logs live.caller_done_check", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = await startCall();
    const setup = await (options.setup as unknown as Promise<{ callerDone: (conversation: string, abortSignal: AbortSignal) => Promise<boolean> }>);
    const signal = new AbortController().signal;
    await expect(setup.callerDone("Caller: Bye!", signal)).resolves.toBe(true);
    expect(mocks.callerIsDone).toHaveBeenCalledWith(mocks.createAgentModel.mock.results.at(-1)!.value, "Caller: Bye!", signal);
    expect(logLines(info)).toContainEqual({ level: "info", message: "live.caller_done_check", sessionId: "live_2", callId: "call_2", businessId: "biz_1", done: true, ms: expect.any(Number) });
    info.mockRestore();
  });

  it("logs each greeting step as live.greeting, with the caller audio received so far", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = await startCall();
    options.onGreeting!({ step: "sent", attempt: 2, trigger: "retry", sinceAttachMs: 9_200, inputAudioMs: 8_100 } as never);
    expect(logLines(info)).toContainEqual({ level: "info", message: "live.greeting", sessionId: "live_2", callId: "call_2", businessId: "biz_1", step: "sent", attempt: 2, trigger: "retry", sinceAttachMs: 9_200, inputAudioMs: 8_100 });
    info.mockRestore();
  });

  it("logs the reflected caller audio on live.closed", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = await startCall();
    options.onClose!({ sessionId: "live_2", durationMs: 12_000, delegations: [], usageConfirmed: true, lateAttach: false, outputAudio: { deltas: 55, coveredMs: 11_000, payloadBytes: 704_000 }, inputAudio: { chunks: 550, coveredMs: 11_000, loudMs: 1_400, payloadBytes: 704_000 } } as never);
    const closed = JSON.parse(String(info.mock.calls.find((call) => String(call[0]).includes("\"live.closed\""))![0]));
    expect(closed.inputAudio).toEqual({ chunks: 550, coveredMs: 11_000, loudMs: 1_400, payloadBytes: 704_000 });
    info.mockRestore();
  });

  it("never lets a telemetry failure reach the call", async () => {
    mocks.finishLiveCall.mockResolvedValueOnce(true);
    const options = await startCall();
    mocks.recordProductEvent.mockRejectedValueOnce(new Error("database unavailable"));
    mocks.recordProductEvent.mockImplementationOnce(() => { throw new Error("database unavailable"); });
    expect(() => options.onDelegation!(delegation as never)).not.toThrow();
    expect(() => options.onClose!({ sessionId: "live_2", durationMs: 1_000, delegations: [] } as never)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("providerSeconds", () => {
  it("uses the seconds OpenAI confirmed in session.closed", () => {
    expect(providerSeconds({ billedSeconds: 42, durationMs: 41_000, usageConfirmed: true }, "web_voice")).toBe(42);
    expect(providerSeconds({ billedSeconds: 15, durationMs: 800, usageConfirmed: true }, "web_voice")).toBe(15);
  });

  it("takes the larger of the latest usage and our measurement when the close wasn't confirmed", () => {
    expect(providerSeconds({ billedSeconds: 30, durationMs: 34_000, usageConfirmed: false }, "voice")).toBe(34);
    expect(providerSeconds({ billedSeconds: 40, durationMs: 34_000, usageConfirmed: false }, "voice")).toBe(40);
  });

  it("assumes OpenAI's 15-second WebRTC minimum when no usage arrived", () => {
    expect(providerSeconds({ durationMs: 5_472, usageConfirmed: false }, "web_voice")).toBe(15);
    expect(providerSeconds({ durationMs: 90_000, usageConfirmed: false }, "web_voice")).toBe(90);
  });

  it("uses the measured length for a phone call without any usage", () => {
    expect(providerSeconds({ durationMs: 5_472, usageConfirmed: false }, "voice")).toBe(5.472);
  });
});

describe("parseAttachRequest", () => {
  it("keeps only the fields the worker trusts", () => {
    expect(parseAttachRequest(JSON.stringify({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice", intakeOnly: "yes", maxDurationMs: -1, resume: "yes" })))
      .toEqual({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice" });
  });

  it("marks a retried delivery's attach as a resume", () => {
    expect(parseAttachRequest(JSON.stringify({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "voice", resume: true }))).toMatchObject({ resume: true });
  });
});
