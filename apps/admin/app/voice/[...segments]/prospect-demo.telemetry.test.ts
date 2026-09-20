import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  asApiResponse: vi.fn((error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "request failed" },
      { status: 500 },
    ),
  ),
  body: {} as Record<string, unknown>,
  enforceWebVoiceRateLimits: vi.fn(),
  execute: vi.fn(),
  readJson: vi.fn(),
  recordProspectDemoCallError: vi.fn(),
  recordProspectDemoCallStarted: vi.fn(),
  requireInternalService: vi.fn(),
  resolveWebVoiceAccess: vi.fn(),
  startCall: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => await original<typeof import("@lobbystack/db")>());

vi.mock("@lobbystack/domain", () => ({
  recordProspectDemoCallError: mocks.recordProspectDemoCallError,
  recordProspectDemoCallStarted: mocks.recordProspectDemoCallStarted,
  startCall: mocks.startCall,
}));

vi.mock("@/lib/api-helpers", () => ({
  asApiResponse: mocks.asApiResponse,
  getAppDatabase: () => ({ db: { execute: mocks.execute } }),
  readJson: mocks.readJson,
  requireInternalService: mocks.requireInternalService,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: () => ({ db: {} }),
}));

vi.mock("@/lib/prospect-demo", () => ({
  resolveWebVoiceAccess: mocks.resolveWebVoiceAccess,
}));

vi.mock("@/lib/web-voice-policy", () => ({
  enforceWebVoiceRateLimits: mocks.enforceWebVoiceRateLimits,
}));

vi.mock("@/lib/voice-ai-cost", () => ({
  recordVoiceAiCostLedger: vi.fn(),
}));

import { POST } from "./route";

const demoBody = {
  businessSlug: "acme",
  prospectDemoToken: "demo-token",
  origin: "https://example.test",
  providerCallId: "provider_call_1",
};

function postStartWeb() {
  return POST(
    new Request("https://admin.example.test/voice/call/start-web", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ segments: ["call", "start-web"] }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireInternalService.mockResolvedValue(undefined);
  mocks.readJson.mockImplementation(async () => mocks.body);
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.resolveWebVoiceAccess.mockResolvedValue({ allowed: true, businessId: "biz_1", mode: "prospect_demo", prospectDemoId: "demo_1" });
  mocks.enforceWebVoiceRateLimits.mockResolvedValue({ allowed: true });
  mocks.startCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false });
  mocks.recordProspectDemoCallStarted.mockResolvedValue(undefined);
  mocks.recordProspectDemoCallError.mockResolvedValue(undefined);
  mocks.body = demoBody;
});

describe("prospect demo web call telemetry", () => {
  it("records prospect_demo.call_started and keeps the demo id server-side", async () => {
    const response = await postStartWeb();

    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toMatchObject({ callId: "call_1" });
    expect(JSON.stringify(payload)).not.toContain("demo_1");
    expect(mocks.recordProspectDemoCallStarted).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      prospectDemoId: "demo_1",
      callId: "call_1",
      channel: "web_voice",
      provider: "openai_realtime",
    });
  });

  it("records prospect_demo.call_error when the call cannot start", async () => {
    mocks.startCall.mockRejectedValue(Object.assign(new Error("Voice limit reached."), { status: 402, code: "voice_limit_reached" }));

    const response = await postStartWeb();

    expect(response.status).toBe(402);
    expect(mocks.recordProspectDemoCallError).toHaveBeenCalledWith(expect.anything(), {
      businessId: "biz_1",
      prospectDemoId: "demo_1",
      reason: "voice_limit_reached",
    });
  });

  it("does not record demo call telemetry for a non-demo web call", async () => {
    mocks.resolveWebVoiceAccess.mockResolvedValue({ allowed: true, businessId: "biz_1", mode: "normal", dashboardTestCall: false });

    const response = await postStartWeb();

    expect(response.status).toBe(200);
    expect(mocks.recordProspectDemoCallStarted).not.toHaveBeenCalled();
    expect(mocks.recordProspectDemoCallError).not.toHaveBeenCalled();
  });
});
