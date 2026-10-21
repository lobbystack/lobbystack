import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), mint: vi.fn(), limit: vi.fn(), ip: vi.fn(), register: vi.fn(), touch: vi.fn() }));
vi.mock("@/lib/api-helpers", () => ({ readJson: (request: Request) => request.json() }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/widget-access", () => ({ resolveWidgetAccess: mocks.access }));
vi.mock("@/lib/widget-keys", () => ({ createWidgetSessionToken: mocks.mint, requestIpHash: mocks.ip, touchWidgetKeyLastUsed: mocks.touch }));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetRateLimits: mocks.limit }));
vi.mock("@lobbystack/domain", () => ({ registerWidgetVisitor: mocks.register }));
import { POST } from "./route";

const visitorId = "5ef3b4ef-720d-47a7-8320-e6f4707a64e2";
const request = () => new Request("https://admin.test/api/widget/session", { method: "POST", headers: { origin: "https://business.test", "content-type": "application/json", "user-agent": "Visitor browser" }, body: JSON.stringify({ widgetKey: "widget-key", visitorId }) });

describe("widget session admission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ ok: true, session: { businessId: "business", widgetKeyId: "key", origin: "https://business.test" } });
    mocks.ip.mockReturnValue("trusted-ip-hash");
    mocks.mint.mockReturnValue({ token: "signed", expiresAt: "2026-10-01T00:00:00.000Z" });
    mocks.register.mockResolvedValue({ visitorId, contactId: null });
    mocks.touch.mockResolvedValue(undefined);
  });
  it.each([429, 503])("does not mint when policy denies with %s", async (status) => {
    mocks.limit.mockResolvedValue({ allowed: false, status, code: "widget_rate_limited" });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.mint).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.touch).not.toHaveBeenCalled();
  });
  it("lets the loader read why an origin was refused", async () => {
    mocks.access.mockResolvedValue({ ok: false, response: Response.json({ error: "This website is not authorized to load this widget.", code: "widget_origin_denied" }, { status: 403 }) });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://business.test");
    expect(await response.json()).toMatchObject({ code: "widget_origin_denied" });
  });
  it("consumes the tenant, visitor and trusted IP budget before signing", async () => {
    mocks.limit.mockResolvedValue({ allowed: true });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith({ businessId: "business", widgetKeyId: "key", visitorId, ipHash: "trusted-ip-hash", operation: "session" });
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.mint.mock.invocationCallOrder[0]!);
  });
  // The chat's own requests rely on the session having saved both.
  it("saves the visitor, with its browser and website, and the key's last use before signing", async () => {
    mocks.limit.mockResolvedValue({ allowed: true });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith({}, { businessId: "business", visitorId, metadata: { userAgent: "Visitor browser", pageUrl: "https://business.test" } });
    expect(mocks.touch).toHaveBeenCalledExactlyOnceWith({ businessId: "business", widgetKeyId: "key" });
    expect(mocks.register.mock.invocationCallOrder[0]).toBeLessThan(mocks.mint.mock.invocationCallOrder[0]!);
    expect(mocks.touch.mock.invocationCallOrder[0]).toBeLessThan(mocks.mint.mock.invocationCallOrder[0]!);
  });
  it("signs no session when the visitor can't be saved", async () => {
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.register.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://business.test");
    expect(await response.json()).toMatchObject({ code: "widget_session_failed" });
    expect(mocks.mint).not.toHaveBeenCalled();
  });
});
