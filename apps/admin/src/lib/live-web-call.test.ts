import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withOperatorTransaction: vi.fn(),
  resolveWebVoiceAccess: vi.fn(),
  verifyWidgetSessionToken: vi.fn(),
  widgetKey: { status: "active", allowedOrigins: ["https://client.example"] } as { status: string; allowedOrigins: string[] } | undefined,
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
  mocks.widgetKey = { status: "active", allowedOrigins: ["https://client.example"] };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("resolveLiveWebCallAccess", () => {
  it("lets an operator test-call their own business from the dashboard", async () => {
    mocks.withOperatorTransaction.mockResolvedValue("biz_1");
    await expect(resolveLiveWebCallAccess(request({ origin: app }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toMatchObject({ businessId: "biz_1", dashboardTestCall: true, origin: app });
  });

  it("refuses a dashboard test call started from another site", async () => {
    await expect(resolveLiveWebCallAccess(request({ origin: "https://evil.example" }), { sdp: "v=0", widgetId: "lobbystack-dashboard-test-call" })).resolves.toEqual({ status: 403, code: "origin_denied" });
    expect(mocks.withOperatorTransaction).not.toHaveBeenCalled();
  });

  it("accepts the widget's session token from the page it was issued to", async () => {
    mocks.verifyWidgetSessionToken.mockReturnValue({ businessId: "biz_2", widgetKeyId: "key_1", visitorId: "visitor_1", origin: "https://client.example" });
    await expect(resolveLiveWebCallAccess(request({ authorization: "Bearer token", "x-widget-parent-origin": "https://client.example" }), { sdp: "v=0", widgetId: "lobbystack-widget", visitorId: "visitor_1" }))
      .resolves.toMatchObject({ businessId: "biz_2", origin: "https://client.example", widgetId: "lobbystack-widget", visitorId: "visitor_1", dashboardTestCall: false });
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
