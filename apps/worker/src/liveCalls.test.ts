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
  createReceptionistAgent: vi.fn((..._args: unknown[]) => ({})),
  closeLiveSession: vi.fn(async (..._args: unknown[]) => undefined),
  controllers_: [] as Array<{ endSession: ReturnType<typeof vi.fn>; endAfterGoodbye: ReturnType<typeof vi.fn>; options: Record<string, unknown> }>,
}));

vi.mock("@lobbystack/agent-core", () => ({
  createAgentModel: mocks.createAgentModel,
  createReceptionistAgent: mocks.createReceptionistAgent,
  liveDelegationEnvironment: () => ({ AI_CHAT_REASONING_EFFORT: "low" }),
  liveLanguage: () => "English",
  closeLiveSession: mocks.closeLiveSession,
  agentModelId: () => ({ provider: "openai", model: "gpt-6-luna" }),
  describeAgentUsage: (usage: { inputTokens: number; outputTokens: number }, latencyMs: number) => ({ provider: "openai", model: "gpt-6-luna", latencyMs, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalCostUsd: 0.00021 }),
  LiveCallController: class {
    endSession = vi.fn();
    endAfterGoodbye = vi.fn();
    constructor(options: Record<string, (...args: never[]) => unknown>) {
      mocks.controllers += 1;
      mocks.controllerOptions.push(options);
      mocks.controllers_.push({ endSession: this.endSession, endAfterGoodbye: this.endAfterGoodbye, options });
    }
    start() {}
  },
}));
vi.mock("@lobbystack/domain", () => ({
  blockLiveCaller: vi.fn(async () => undefined),
  getCachedBusinessSnapshot: mocks.snapshot,
  finishLiveCall: mocks.finishLiveCall,
  LIVE_CALL_PROVIDER: "openai_live",
  recordProductEvent: mocks.recordProductEvent,
  recordAiGenerationEvent: mocks.recordAiGenerationEvent,
}));
vi.mock("@lobbystack/jobs", () => ({ renewVoicePresenceGateway: vi.fn(async () => undefined), updateVoicePresence: vi.fn(async () => undefined) }));
vi.mock("openai", () => ({ default: class {} }));

import { createLiveCallHandler, parseAttachRequest, providerSeconds } from "./liveCalls";

function attachRequest(body: Record<string, unknown>, url = "/internal/live/attach"): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { url, method: "POST", headers: { "x-internal-service-token": "token" } }) as unknown as IncomingMessage;
}

// A Redis-like lock shared by two worker instances.
function sharedLock() {
  const keys = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => { if (keys.has(key)) return null; keys.set(key, value); return "OK"; }),
    pexpire: vi.fn(async () => 1),
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

  it("ends the call after the goodbye when the agent hangs up, and at once on a timeout", async () => {
    vi.stubEnv("LIVE_PROTOTYPE_ENABLED", "true");
    vi.stubEnv("INTERNAL_SERVICE_TOKEN", "token");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    mocks.snapshot.mockResolvedValue({ businessId: "biz_1", greeting: "Hi" });
    const handler = createLiveCallHandler({ domain: { db: {} as never } });
    await handler.handle(attachRequest({ sessionId: "live_bye", businessId: "biz_1", callId: "call_1", channel: "voice" }), response());
    const controller = mocks.controllers_.at(-1)!;
    const context = (mocks.createReceptionistAgent.mock.lastCall![0] as { context: { callControl: { hangup: (reason: string) => Promise<void> } } }).context;
    await context.callControl.hangup("caller_finished");
    expect(controller.endAfterGoodbye).toHaveBeenCalled();
    expect(controller.endSession).not.toHaveBeenCalled();
    (controller.options.onTimeout as (reason: string) => void)("silence_timeout");
    expect(controller.endSession).toHaveBeenCalled();
    await expect((controller.options.setup as Promise<{ language: string }>)).resolves.toMatchObject({ greeting: "Hi", language: "English" });
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
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "live.delegation", sessionId: "live_2", agentMs: 1_800, totalMs: 1_812, queueMs: 0, tools: ["getBusinessHours", "getBusinessHours"], modelSteps: 1, directAnswer: true, stepMs: [1_800], toolMs: 40, failed: false, superseded: false }));
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

  it("logs each greeting step as live.greeting", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const options = await startCall();
    options.onGreeting!({ step: "sent", attempt: 1, trigger: "session_started", sinceAttachMs: 1_700 } as never);
    expect(info).toHaveBeenCalledWith(JSON.stringify({ event: "live.greeting", sessionId: "live_2", step: "sent", attempt: 1, trigger: "session_started", sinceAttachMs: 1_700 }));
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
    expect(parseAttachRequest(JSON.stringify({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice", intakeOnly: "yes", maxDurationMs: -1 })))
      .toEqual({ sessionId: "live_1", businessId: "biz_1", callId: "call_1", channel: "web_voice" });
  });
});
