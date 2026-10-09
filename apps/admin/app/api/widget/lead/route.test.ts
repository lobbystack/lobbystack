import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ register: vi.fn(), businessNumber: undefined as string | undefined }));
vi.mock("@lobbystack/db", () => ({ phoneNumbers: {}, withBusinessTransaction: async () => mocks.businessNumber }));
vi.mock("@/lib/api-helpers", () => ({ readJson: (request: Request) => request.json() }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/widget-access", () => ({ resolveWidgetSessionAccess: async () => ({ ok: true, session: { businessId: "business", widgetKeyId: "key", visitorId } }) }));
vi.mock("@/lib/widget-keys", () => ({ requestIpHash: () => undefined }));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetRateLimits: async () => ({ allowed: true }) }));
vi.mock("@lobbystack/domain", () => ({ registerWidgetVisitor: mocks.register }));
import { POST } from "./route";

const visitorId = "5ef3b4ef-720d-47a7-8320-e6f4707a64e2";
const request = (lead: Record<string, string>, acceptLanguage = "en-CA,en;q=0.9") => new Request("https://admin.test/api/widget/lead", { method: "POST", headers: { "content-type": "application/json", "accept-language": acceptLanguage }, body: JSON.stringify({ visitorId, ...lead }) });

describe("widget lead form", () => {
  afterEach(() => { vi.resetAllMocks(); mocks.businessNumber = undefined; });

  it("stores a local phone number in E.164 so it matches the caller's contact", async () => {
    mocks.register.mockResolvedValue({ contactId: "contact", visitorId });
    const response = await POST(request({ name: "Ana", phone: "416-555-0100" }));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: "+14165550100" }));
  });

  it.each([
    ["es-MX,es;q=0.9", "55 1234 5678", "+525512345678"],
    ["sr-RS,sr;q=0.9", "064 123 4567", "+381641234567"],
  ])("reads a local number in the country of the browser language %s", async (acceptLanguage, typed, e164) => {
    mocks.register.mockResolvedValue({ contactId: "contact", visitorId });
    const response = await POST(request({ phone: typed }, acceptLanguage));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: e164 }));
  });

  it("reads a local number in the business's own country before the browser language", async () => {
    mocks.businessNumber = "+442079460000";
    mocks.register.mockResolvedValue({ contactId: "contact", visitorId });
    const response = await POST(request({ phone: "020 7946 0018" }, "en-US,en;q=0.9"));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ phone: "+442079460018" }));
  });

  it.each([
    [{ phone: "call me later" }, "invalid_phone"],
    [{ email: "bob@" }, "invalid_email"],
  ])("rejects %j with 400 %s", async (lead, code) => {
    const response = await POST(request(lead));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
