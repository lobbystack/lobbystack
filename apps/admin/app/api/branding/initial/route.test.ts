import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ save: vi.fn(), forget: vi.fn(), load: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ saveInitialBranding: fixture.save }));
vi.mock("@/lib/api-helpers", () => ({
  getAppDatabase: () => ({ db: {} }),
  requireApiSession: async () => ({ user: { id: "owner" } }),
  jsonError: (message: string, status = 400, code?: string) => Response.json({ error: message, ...(code ? { code } : {}) }, { status }),
  asApiResponse: (error: unknown) => error instanceof Response ? error : Response.json({ error: "Request failed." }, { status: (error as { status?: number }).status ?? 500 }),
}));
vi.mock("@/lib/branding", () => ({ forgetCachedBranding: fixture.forget, loadRequestBrand: fixture.load }));

import { POST } from "./route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function post(body: string, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/branding/initial", { method: "POST", body, headers: { "content-type": "application/json", ...headers } }));
}

beforeEach(() => {
  fixture.save.mockResolvedValue(undefined);
  fixture.load.mockResolvedValue({ name: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("initial branding route", () => {
  it("saves the name and the decoded logo, then answers with what pages now show", async () => {
    const response = await post(JSON.stringify({ appName: "Acme Desk", logo: PNG.toString("base64") }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
    expect(fixture.save).toHaveBeenCalledWith({ db: {} }, { userId: "owner", appName: "Acme Desk", logo: PNG });
    expect(fixture.forget).toHaveBeenCalledBefore(fixture.load);
  });

  it("leaves out a field the environment already sets", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Operator Desk");
    await post(JSON.stringify({ appName: "Acme Desk", logo: PNG.toString("base64") }));
    expect(fixture.save).toHaveBeenCalledWith({ db: {} }, { userId: "owner", appName: null, logo: PNG });
  });

  it("refuses a body that isn't a name and a base64 logo", async () => {
    for (const body of ['{"appName":7}', '{"logo":"not base64!"}', "[]", "null"]) {
      const response = await post(body);
      expect(response.status, body).toBe(400);
      expect((await response.json()).code, body).toBe("invalid_branding");
    }
    expect((await (await post("{")).json()).code).toBe("invalid_json");
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it("stops reading an upload past the size limit", async () => {
    const declared = await post("{}", { "content-length": String(1024 * 1024) });
    expect(declared.status).toBe(413);
    const streamed = await post(JSON.stringify({ logo: Buffer.alloc(400 * 1024).toString("base64") }));
    expect(streamed.status).toBe(413);
    expect((await streamed.json()).code).toBe("logo_too_large");
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it("refuses on the cloud, which keeps LobbyStack's brand", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    const response = await post(JSON.stringify({ appName: "Acme Desk" }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("branding_not_allowed");
    expect(fixture.save).not.toHaveBeenCalled();
    expect(fixture.forget).not.toHaveBeenCalled();
  });

  it("passes on the domain's refusal", async () => {
    fixture.save.mockRejectedValue(Object.assign(new Error("Someone already chose."), { status: 409, code: "branding_already_saved" }));
    expect((await post("{}")).status).toBe(409);
    expect(fixture.forget).not.toHaveBeenCalled();
  });
});
