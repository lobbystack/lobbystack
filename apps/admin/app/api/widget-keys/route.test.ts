import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock("@/lib/api-helpers", () => ({
  readJson: (request: Request) => request.json(),
  withOperatorTransaction: (_request: Request, callback: (input: unknown) => Promise<unknown>) => callback({ businessId: "business", tx: { insert: mocks.insert } }),
  jsonError: (message: string, status = 400, code?: string) => new Response(JSON.stringify({ error: message, ...(code ? { code } : {}) }), { status }),
  asApiResponse: (error: unknown) => (error instanceof Response ? error : new Response(JSON.stringify({ error: "Request failed." }), { status: 500 })),
}));

vi.mock("@lobbystack/db", () => ({ widgetKeys: {} }));

import { POST } from "./route";

const request = (body: Record<string, unknown> = {}) => new Request("https://admin.test/api/widget-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("widget key issuance gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.insert.mockReturnValue({
      values: () => ({
        returning: async () => [{
          id: "00000000-0000-4000-8000-000000000001",
          status: "active",
          label: null,
          allowedOrigins: [],
          config: {},
          lastUsedAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }],
      }),
    });
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
    expect(await response.json()).toMatchObject({ ok: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
