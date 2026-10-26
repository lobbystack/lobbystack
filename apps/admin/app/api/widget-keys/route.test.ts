import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), select: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, PATCH, POST } from "./route";

beforeEach(() => {
  resetFakeOperator();
  fakeOperator.tx = { insert: mocks.insert, select: mocks.select, update: mocks.update };
});

const request = (body: Record<string, unknown> = {}) => new Request("https://admin.test/api/widget-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("widget key issuance gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.values.mockReturnValue({
        returning: async () => [{
          id: "00000000-0000-4000-8000-000000000001",
          status: "active",
          label: null,
          allowedOrigins: [],
          config: {},
          lastUsedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }],
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses new keys by default while website chat is restricted", async () => {
    vi.stubEnv("WIDGET_KEY_ISSUANCE_ENABLED", "");
    const response = await POST(request({ allowedOrigins: ["https://business.test"] }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "widget_issuance_disabled" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("issues a key only after an explicit operator opt-in", async () => {
    vi.stubEnv("WIDGET_KEY_ISSUANCE_ENABLED", "true");
    const response = await POST(request({ allowedOrigins: ["https://business.test"] }));
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; key: { key: string } };
    expect(body).toMatchObject({ ok: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    // The key is kept beside its hash so the dashboard can show the snippet again.
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ keyValue: body.key.key }));
  });

  it("refuses an origin without https:// instead of saving one no browser sends", async () => {
    vi.stubEnv("WIDGET_KEY_ISSUANCE_ENABLED", "true");
    const response = await POST(request({ allowedOrigins: ["https://business.test", "business.test"] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_origin" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("widget key listing", () => {
  it("returns each key so its snippet can be copied again, except revoked and older keys", async () => {
    vi.stubEnv("WIDGET_KEY_ISSUANCE_ENABLED", "true");
    const row = { status: "active", label: null, allowedOrigins: [], config: {}, lastUsedAt: null, createdAt: new Date("2026-01-01T00:00:00.000Z") };
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy: async () => [
      { ...row, id: "00000000-0000-4000-8000-000000000001", keyValue: "wk_live_one" },
      { ...row, id: "00000000-0000-4000-8000-000000000002", keyValue: "wk_live_two", status: "revoked" },
      { ...row, id: "00000000-0000-4000-8000-000000000003", keyValue: null },
    ] }) }) });
    const response = await GET(new Request("https://admin.test/api/widget-keys"));
    const { keys, issuanceEnabled } = await response.json() as { keys: Array<{ key: string | null }>; issuanceEnabled: boolean };
    expect(keys.map((key) => key.key)).toEqual(["wk_live_one", null, null]);
    // The widget page reads this instead of billing, which a partner's business doesn't have.
    expect(issuanceEnabled).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("widget key updates", () => {
  const keyId = "00000000-0000-4000-8000-000000000001";
  const patch = (body: Record<string, unknown>, id = keyId) => PATCH(new Request(`https://admin.test/api/widget-keys?id=${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const existing = (status: string) => mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: keyId, status }] }) }) });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("answers user mistakes with 400, 404 or 409 and saves nothing", async () => {
    existing("active");
    const typo = await patch({ status: "paused", label: "Site" });
    expect(typo.status).toBe(400);
    expect((await patch({}, "not-a-key")).status).toBe(404);
    existing("revoked");
    const revive = await patch({ status: "active" });
    expect(revive.status).toBe(409);
    expect(await revive.json()).toMatchObject({ code: "widget_key_revoked" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
