import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "request failed" },
      { status: 500 },
    ),
  ),
  dbExecute: vi.fn(),
  getAppDatabase: vi.fn(),
  readJson: vi.fn(),
  recordUsage: vi.fn(),
  recordVoiceAiCostLedger: vi.fn(),
  requireInternalService: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  recordUsage: mocks.recordUsage,
}));

vi.mock("@lobbystack/db", () => ({
  calls: {},
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  getAppDatabase: mocks.getAppDatabase,
  readJson: mocks.readJson,
  requireInternalService: mocks.requireInternalService,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: () => ({ db: {} }),
}));

vi.mock("@/lib/prospect-demo", () => ({ resolveWebVoiceAccess: vi.fn() }));
vi.mock("@/lib/web-voice-policy", () => ({ enforceWebVoiceRateLimits: vi.fn() }));
vi.mock("@/lib/voice-ai-cost", () => ({
  recordVoiceAiCostLedger: mocks.recordVoiceAiCostLedger,
}));

import { POST } from "./route";

describe("POST /voice/call/web-recording-target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInternalService.mockResolvedValue(undefined);
    mocks.readJson.mockResolvedValue({ gatewaySessionId: "gateway-session-123" });
    mocks.getAppDatabase.mockReturnValue({ db: { execute: mocks.dbExecute } });
    mocks.withBusinessTransaction.mockResolvedValue({ maxDurationMs: 240_000, mediaStartedAt: null });
  });

  it("serializes raw SQL timestamp strings for durable web-call cleanup", async () => {
    mocks.withBusinessTransaction.mockResolvedValueOnce({
      maxDurationMs: 240_000,
      mediaStartedAt: new Date("2026-09-21T02:33:03.000Z"),
    });
    mocks.dbExecute.mockResolvedValue({
      rows: [{
        call_id: "call_123",
        business_id: "business_123",
        provider_call_id: "provider_123",
        started_at: "2026-09-21T02:33:00.000Z",
        ended_at: "2026-09-21T02:33:12.000Z",
        status: "completed",
      }],
    });

    const response = await POST(
      new Request("https://admin.example.test/voice/call/web-recording-target", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ segments: ["call", "web-recording-target"] }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callId: "call_123",
      providerCallId: "provider_123",
      startedAt: "2026-09-21T02:33:00.000Z",
      mediaStartedAt: "2026-09-21T02:33:03.000Z",
      endedAt: "2026-09-21T02:33:12.000Z",
      status: "completed",
      webCallMaxDurationMs: 240_000,
    });
  });

  it("preserves Date values and omits a null end timestamp", async () => {
    mocks.dbExecute.mockResolvedValue({
      rows: [{
        call_id: "call_123",
        business_id: "business_123",
        provider_call_id: "provider_123",
        started_at: new Date("2026-09-21T02:33:00.000Z"),
        ended_at: null,
        status: "in_progress",
      }],
    });

    const response = await POST(
      new Request("https://admin.example.test/voice/call/web-recording-target", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ segments: ["call", "web-recording-target"] }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callId: "call_123",
      providerCallId: "provider_123",
      startedAt: "2026-09-21T02:33:00.000Z",
      status: "in_progress",
      webCallMaxDurationMs: 240_000,
    });
  });

  it("rejects invalid raw SQL timestamps instead of serializing corrupt data", async () => {
    mocks.dbExecute.mockResolvedValue({
      rows: [{
        call_id: "call_123",
        business_id: "business_123",
        provider_call_id: "provider_123",
        started_at: "not-a-timestamp",
        ended_at: null,
        status: "in_progress",
      }],
    });

    const response = await POST(
      new Request("https://admin.example.test/voice/call/web-recording-target", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ segments: ["call", "web-recording-target"] }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid started_at timestamp returned by the database.",
    });
    expect(mocks.asApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Invalid started_at timestamp returned by the database.",
      }),
    );
  });
});

describe("POST /voice/call/ai-cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInternalService.mockResolvedValue(undefined);
    mocks.readJson.mockResolvedValue({
      businessId: "business_123",
      eventKey: "voice_ai:response:call_123:response_123",
      costUsd: 0.012345,
      occurredAt: "2026-09-09T12:00:00.000Z",
      provider: "openai",
      model: "gpt-realtime",
      operation: "voice.response_generation",
      callId: "call_123",
      conversationId: "conversation_123",
    });
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.recordVoiceAiCostLedger.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes billing usage and the idempotent voice AI unit-economics ledger", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:34:56.000Z"));

    const response = await POST(
      new Request("https://admin.example.test/voice/call/ai-cost", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ segments: ["call", "ai-cost"] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      {
        businessId: "business_123",
        periodKey: "2026-09",
        sourceKey: "voice_ai:response:call_123:response_123",
        usageKind: "voice.ai.cost",
        quantity: 0.012345,
        sync: false,
      },
    );
    expect(mocks.recordVoiceAiCostLedger).toHaveBeenCalledWith(
      expect.anything(),
      {
        businessId: "business_123",
        eventKey: "voice_ai:response:call_123:response_123",
        costUsd: 0.012345,
        occurredAt: "2026-09-09T12:00:00.000Z",
        provider: "openai",
        model: "gpt-realtime",
        operation: "voice.response_generation",
        callId: "call_123",
        conversationId: "conversation_123",
      },
    );
  });

  it("records an unpriced generation once without inventing billing usage", async () => {
    mocks.readJson.mockResolvedValueOnce({
      businessId: "business_123",
      eventKey: "voice_ai:response:call_123:unpriced-response",
      costUsd: null,
      provider: "openai",
      model: "unlisted-model",
      operation: "voice.response_generation",
      callId: "call_123",
      pricingVersion: "catalog-2026-09-09",
      pricingSource: "https://example.test/prices",
      pricingEffectiveDate: "2026-09-09",
    });

    const response = await POST(
      new Request("https://admin.example.test/voice/call/ai-cost", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ segments: ["call", "ai-cost"] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.recordUsage).not.toHaveBeenCalled();
    expect(mocks.recordVoiceAiCostLedger).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventKey: "voice_ai:response:call_123:unpriced-response",
      costUsd: null,
      pricingSource: "https://example.test/prices",
      pricingEffectiveDate: "2026-09-09",
    }));
  });
});
