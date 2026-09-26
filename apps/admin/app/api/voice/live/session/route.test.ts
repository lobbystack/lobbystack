import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rateLimit: vi.fn(),
  allowance: vi.fn(),
  snapshot: vi.fn(),
  startLiveWebCall: vi.fn(),
  finishLiveCall: vi.fn(),
  recordProspectDemoCallStarted: vi.fn(),
  recordProspectDemoCallError: vi.fn(),
  recordVoiceSnapshotLoaded: vi.fn(),
  attach: vi.fn(),
  create: vi.fn(),
  hangup: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  finishLiveCall: mocks.finishLiveCall,
  getWebVoiceBillingAllowance: mocks.allowance,
  recordProspectDemoCallError: mocks.recordProspectDemoCallError,
  recordProspectDemoCallStarted: mocks.recordProspectDemoCallStarted,
  recordVoiceSnapshotLoaded: mocks.recordVoiceSnapshotLoaded,
  startLiveWebCall: mocks.startLiveWebCall,
}));
vi.mock("@/lib/live-web-call", async (original) => ({ ...(await original<typeof import("@/lib/live-web-call")>()), resolveLiveWebCallAccess: mocks.access }));
vi.mock("@/lib/web-voice-policy", () => ({ enforceWebVoiceRateLimits: mocks.rateLimit }));
vi.mock("@/lib/business-snapshot", () => ({ loadValidBusinessSnapshot: mocks.snapshot }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/live-prototype", () => ({
  requireLivePrototype: vi.fn(),
  attachWorkerToLiveSession: mocks.attach,
  getLiveClient: () => ({ live: { create: mocks.create, sessions: { hangup: mocks.hangup } } }),
}));
vi.mock("@lobbystack/agent-core/live/session", () => ({ buildBrowserSessionConfig: () => ({ model: "gpt-live-1" }) }));

import { POST } from "./route";

const snapshot = { businessId: "biz_1", greeting: "Hi", contactChannels: { phoneNumber: "+15815020392" } };

function start(widgetId: string, extra: Record<string, string> = {}) {
  return POST(new Request("https://admin.lobbystack.test/api/voice/live/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sdp: "v=0\r\n", widgetId, ...extra }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.allowance.mockResolvedValue({ allowed: true });
  mocks.snapshot.mockResolvedValue(snapshot);
  mocks.create.mockResolvedValue({ session: { id: "live_1" }, transport: { sdp: "answer" } });
  mocks.startLiveWebCall.mockResolvedValue({ callId: "call_1", maxDurationMs: 120_000 });
  mocks.hangup.mockResolvedValue(undefined);
  mocks.finishLiveCall.mockResolvedValue(true);
  mocks.recordProspectDemoCallError.mockResolvedValue(undefined);
  mocks.recordProspectDemoCallStarted.mockResolvedValue(undefined);
  mocks.attach.mockResolvedValue(undefined);
});

describe("POST /api/voice/live/session", () => {
  it("records a prospect demo call as intake-only and unbilled", async () => {
    mocks.access.mockResolvedValue({ businessId: "biz_1", origin: "https://admin.lobbystack.test", widgetId: "lobbystack-prospect-demo", prospectDemoId: "demo_1", dashboardTestCall: false });
    const response = await start("lobbystack-prospect-demo", { businessSlug: "acme", prospectDemoToken: "secret" });
    expect(response.status).toBe(201);
    expect(mocks.allowance).not.toHaveBeenCalled();
    expect(mocks.startLiveWebCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sessionId: "live_1", billable: false, sessionPurpose: "prospect_demo", prospectDemoId: "demo_1" }));
    expect(mocks.recordProspectDemoCallStarted).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", prospectDemoId: "demo_1", callId: "call_1", channel: "web_voice", provider: "openai_live" });
    expect(mocks.attach).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "live_1", callId: "call_1", channel: "web_voice", intakeOnly: true, maxDurationMs: 120_000 }));
  });

  it("stops before creating a session when the plan is out of minutes", async () => {
    mocks.access.mockResolvedValue({ businessId: "biz_1", origin: "https://admin.lobbystack.test", widgetId: "lobbystack-dashboard-test-call", dashboardTestCall: true });
    mocks.allowance.mockResolvedValue({ allowed: false, errorCode: "voice_limit_reached" });
    const response = await start("lobbystack-dashboard-test-call");
    expect(response.status).toBe(402);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hangs up and releases the call when the worker can't take it", async () => {
    mocks.access.mockResolvedValue({ businessId: "biz_1", origin: "https://admin.lobbystack.test", widgetId: "lobbystack-prospect-demo", prospectDemoId: "demo_1", dashboardTestCall: false });
    mocks.attach.mockRejectedValue(new Error("Worker attach failed with status 500."));
    const response = await start("lobbystack-prospect-demo", { businessSlug: "acme", prospectDemoToken: "secret" });
    expect(response.status).toBe(500);
    expect(mocks.hangup).toHaveBeenCalledWith("live_1");
    expect(mocks.finishLiveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callId: "call_1", seconds: 0, end: "setup_failed", channel: "web_voice" }));
    expect(mocks.recordProspectDemoCallError).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prospectDemoId: "demo_1", callId: "call_1", reason: "web_call_start_failed" }));
  });

  it("refuses widget voice for a business without a phone number", async () => {
    mocks.access.mockResolvedValue({ businessId: "biz_1", origin: "https://client.example", widgetId: "lobbystack-widget", dashboardTestCall: false });
    mocks.snapshot.mockResolvedValue({ ...snapshot, contactChannels: {} });
    const response = await start("lobbystack-widget");
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("passes the WebRTC offer to OpenAI unchanged", async () => {
    mocks.access.mockResolvedValue({ businessId: "biz_1", origin: "https://admin.lobbystack.test", widgetId: "lobbystack-dashboard-test-call", dashboardTestCall: true });
    await start("lobbystack-dashboard-test-call");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ transport: { type: "webrtc", sdp: "v=0\r\n" } }));
  });

  it("rejects unknown callers", async () => {
    const response = await start("somebody-else");
    expect(response.status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
