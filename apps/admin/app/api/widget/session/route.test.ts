import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), mint: vi.fn(), limit: vi.fn(), ip: vi.fn() }));
vi.mock("@/lib/api-helpers", () => ({ readJson: (request: Request) => request.json() }));
vi.mock("@/lib/widget-access", () => ({ resolveWidgetAccess: mocks.access }));
vi.mock("@/lib/widget-keys", () => ({ createWidgetSessionToken: mocks.mint, requestIpHash: mocks.ip }));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetRateLimits: mocks.limit }));
import { POST } from "./route";

const visitorId = "5ef3b4ef-720d-47a7-8320-e6f4707a64e2";
const request = () => new Request("https://admin.test/api/widget/session", { method: "POST", headers: { origin: "https://business.test", "content-type": "application/json" }, body: JSON.stringify({ widgetKey: "widget-key", visitorId }) });

describe("widget session admission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({ ok: true, session: { businessId: "business", widgetKeyId: "key", origin: "https://business.test" } });
    mocks.ip.mockReturnValue("trusted-ip-hash");
    mocks.mint.mockReturnValue({ token: "signed", expiresAt: "2026-10-01T00:00:00.000Z" });
  });
  it.each([429, 503])("does not mint when policy denies with %s", async (status) => {
    mocks.limit.mockResolvedValue({ allowed: false, status, code: "widget_rate_limited" });
    expect((await POST(request())).status).toBe(status);
    expect(mocks.mint).not.toHaveBeenCalled();
  });
  it("consumes the tenant, visitor and trusted IP budget before signing", async () => {
    mocks.limit.mockResolvedValue({ allowed: true });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith({ businessId: "business", widgetKeyId: "key", visitorId, ipHash: "trusted-ip-hash", operation: "session" }, { consume: true });
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.mint.mock.invocationCallOrder[0]!);
  });
});
