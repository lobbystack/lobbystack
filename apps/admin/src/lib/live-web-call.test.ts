import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withOperatorTransaction: vi.fn(),
  resolveWebVoiceAccess: vi.fn(),
  verifyWidgetSessionToken: vi.fn(),
  widgetKey: { status: "active", allowedOrigins: ["https://client.example"], agentId: "agent_widget" } as { status: string; allowedOrigins: string[]; agentId?: string } | undefined,
}));

vi.mock("./api-helpers", () => ({
  withOperatorTransaction: mocks.withOperatorTransaction,
  getWorkerDatabase: () => ({ db: {} }),
}));
vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: vi.fn(async () => mocks.widgetKey),
}));
vi.mock("./prospect-demo", () => ({ resolveWebVoiceAccess: mocks.resolveWebVoiceAccess }));
vi.mock("./widget-keys", async (original) => ({
  ...(await original<typeof import("./widget-keys")>()),
  verifyWidgetSessionToken: mocks.verifyWidgetSessionToken,
}));

import { resolveLiveWebCallAccess } from "./live-web-call";

const app = "https://admin.lobbystack.test";
function request(headers: Record<string, string> = {}) {
  return new Request(`${app}/api/voice/live/session`, { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
  vi.stubEnv("APP_BASE_URL", app);
  mocks.widgetKey = { status: "active", allowedOrigins: ["https://client.example"], agentId: "agent_widget" };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("resolveLiveWebCallAccess", () => {
  it("lets an operator test-call their own business from the dashboard", async () => {
    mocks.withOperatorTransaction.mockResolvedValue({ businessId: "biz_1" });
    await expect(resolveLiveWebCallAccess(request({ origin: app }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toMatchObject({ businessId: "biz_1", dashboardTestCall: true, origin: app });
  });

  it("tests the receptionist the operator picked, only when it belongs to their business", async () => {
    const agentId = "0b8a4c7e-3f1d-4a55-9d3e-2c1f0e9a7b61";
    const rows: Array<{ id: string }> = [{ id: agentId }];
    const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }) };
    mocks.withOperatorTransaction.mockImplementation(async (_request: Request, callback: (input: unknown) => unknown) => await callback({ businessId: "biz_1", tx }));
    await expect(resolveLiveWebCallAccess(request({ origin: app }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call", agentId })).resolves.toMatchObject({ businessId: "biz_1", agentId });
    rows.length = 0;
    const foreign = await resolveLiveWebCallAccess(request({ origin: app }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call", agentId });
    expect(foreign).toMatchObject({ businessId: "biz_1" });
    expect(foreign).not.toHaveProperty("agentId");
  });

  it("accepts the dashboard's origin when the proxy hands the app an internal URL", async () => {
    mocks.withOperatorTransaction.mockResolvedValue({ businessId: "biz_1" });
    const internal = new Request("http://[::]:3000/api/voice/live/session", { method: "POST", headers: { origin: app } });
    await expect(resolveLiveWebCallAccess(internal, { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toMatchObject({ businessId: "biz_1", dashboardTestCall: true, origin: app });
  });

  it("records the trusted origin the call came from, not the first configured one", async () => {
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://second.lobbystack.test");
    mocks.withOperatorTransaction.mockResolvedValue({ businessId: "biz_1" });
    await expect(resolveLiveWebCallAccess(request({ origin: "https://second.lobbystack.test" }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toMatchObject({ businessId: "biz_1", origin: "https://second.lobbystack.test" });
  });

  it("refuses a DNS-rebinding request whose host and origin match each other but not the app", async () => {
    const rebound = new Request("https://evil.example/api/voice/live/session", { method: "POST", headers: { origin: "https://evil.example" } });
    await expect(resolveLiveWebCallAccess(rebound, { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toEqual({ status: 403, code: "origin_denied" });
    expect(mocks.withOperatorTransaction).not.toHaveBeenCalled();
  });

  it("refuses a dashboard test call started from another site", async () => {
    await expect(resolveLiveWebCallAccess(request({ origin: "https://evil.example" }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toEqual({ status: 403, code: "origin_denied" });
    expect(mocks.withOperatorTransaction).not.toHaveBeenCalled();
  });

  it("accepts the widget's session token from the page it was issued to", async () => {
    mocks.verifyWidgetSessionToken.mockReturnValue({ businessId: "biz_2", widgetKeyId: "key_1", visitorId: "visitor_1", origin: "https://client.example" });
    await expect(resolveLiveWebCallAccess(request({ authorization: "Bearer token", "x-widget-parent-origin": "https://client.example" }), { sdp: "v=0", widgetId: "lobbystack-widget", visitorId: "visitor_1" }))
      .resolves.toMatchObject({ businessId: "biz_2", origin: "https://client.example", widgetId: "lobbystack-widget", visitorId: "visitor_1", dashboardTestCall: false, agentId: "agent_widget" });
  });

  it("rejects a widget token presented from a different page", async () => {
    mocks.verifyWidgetSessionToken.mockReturnValue({ businessId: "biz_2", widgetKeyId: "key_1", visitorId: "visitor_1", origin: "https://client.example" });
    await expect(resolveLiveWebCallAccess(request({ authorization: "Bearer token", "x-widget-parent-origin": "https://other.example" }), { sdp: "v=0", widgetId: "lobbystack-widget" })).resolves.toEqual({ status: 403, code: "widget_session_invalid" });
  });

  it("rejects a widget whose key was revoked", async () => {
    mocks.verifyWidgetSessionToken.mockReturnValue({ businessId: "biz_2", widgetKeyId: "key_1", visitorId: "visitor_1", origin: "https://client.example" });
    mocks.widgetKey = { status: "revoked", allowedOrigins: ["https://client.example"] };
    await expect(resolveLiveWebCallAccess(request({ authorization: "Bearer token", "x-widget-parent-origin": "https://client.example" }), { sdp: "v=0", widgetId: "lobbystack-widget" })).resolves.toEqual({ status: 403, code: "widget_origin_denied" });
  });

  it("runs prospect demos under their demo", async () => {
    mocks.resolveWebVoiceAccess.mockResolvedValue({ allowed: true, businessId: "biz_3", mode: "prospect_demo", prospectDemoId: "demo_1" });
    await expect(resolveLiveWebCallAccess(request(), { sdp: "v=0", widgetId: "lobbystack-prospect-demo", businessSlug: "acme", prospectDemoToken: "secret" })).resolves.toMatchObject({ businessId: "biz_3", prospectDemoId: "demo_1" });
  });

  it("allows the landing demo only from an allowed origin", async () => {
    vi.stubEnv("WEB_CALL_PUBLIC_BUSINESS_SLUG", "lobbystack-demo");
    vi.stubEnv("WEB_CALL_ALLOWED_ORIGINS", "https://lobbystack.com");
    mocks.resolveWebVoiceAccess.mockResolvedValue({ allowed: true, businessId: "biz_4", mode: "normal", dashboardTestCall: false });
    await expect(resolveLiveWebCallAccess(request({ origin: "https://lobbystack.com" }), { sdp: "v=0", widgetId: "lobbystack-landing", businessSlug: "lobbystack-demo" })).resolves.toMatchObject({ businessId: "biz_4", origin: "https://lobbystack.com" });
    await expect(resolveLiveWebCallAccess(request({ origin: "https://evil.example" }), { sdp: "v=0", widgetId: "lobbystack-landing", businessSlug: "lobbystack-demo" })).resolves.toEqual({ status: 403, code: "web_voice_authorization_required" });
  });
});
