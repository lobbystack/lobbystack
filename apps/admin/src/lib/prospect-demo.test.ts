import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  limit: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./api-helpers", () => ({
  getAppDatabase: () => ({ db: { execute: mocks.execute } }),
  getWorkerDatabase: () => ({ db: {} }),
}));

import { hashProspectDemoToken, resolveWebVoiceAccess } from "./prospect-demo";

describe("prospect demo web voice access", () => {
  const originalDashboardToken = process.env.DASHBOARD_TEST_CALL_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: mocks.limit })),
        })),
      })),
    };
    mocks.withBusinessTransaction.mockImplementation(async (_db, _context, callback) => await callback(tx));
  });

  afterEach(() => {
    if (originalDashboardToken === undefined) delete process.env.DASHBOARD_TEST_CALL_TOKEN;
    else process.env.DASHBOARD_TEST_CALL_TOKEN = originalDashboardToken;
  });

  it("hashes public tokens before resolver lookup", () => {
    expect(hashProspectDemoToken("sample-token")).toBe("0f35d0ae14518b96bd6d3fec3ca15801fd58c9e048b1ccdea11a71378f2acdc9");
  });

  it("returns restricted mode only when the token resolves to the requested business", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ business_id: "business-a" }] })
      .mockResolvedValueOnce({ rows: [{ business_id: "business-a", prospect_demo_id: "demo-a" }] });

    await expect(resolveWebVoiceAccess({ businessSlug: "business", prospectDemoToken: "sample-token" })).resolves.toEqual({
      allowed: true,
      businessId: "business-a",
      mode: "prospect_demo",
      prospectDemoId: "demo-a",
    });
  });

  it("rejects a valid token belonging to another business", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ business_id: "business-a" }] })
      .mockResolvedValueOnce({ rows: [{ business_id: "business-b", prospect_demo_id: "demo-b" }] });

    await expect(resolveWebVoiceAccess({ businessSlug: "business", prospectDemoToken: "sample-token" })).resolves.toEqual({
      allowed: false,
      status: 403,
      reason: "mismatch",
    });
  });

  it("requires a token for an unclaimed demo tenant", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ business_id: "business-a" }] });
    mocks.limit.mockResolvedValueOnce([{ status: "active" }]);

    await expect(resolveWebVoiceAccess({ businessSlug: "business" })).resolves.toEqual({
      allowed: false,
      status: 403,
      reason: "token_required",
    });
  });

  it("allows a verified dashboard test token without enabling demo mode", async () => {
    process.env.DASHBOARD_TEST_CALL_TOKEN = "dashboard-secret";
    mocks.execute.mockResolvedValueOnce({ rows: [{ business_id: "business-a" }] });
    mocks.limit.mockResolvedValueOnce([{ status: "active" }]);

    await expect(resolveWebVoiceAccess({ businessSlug: "business", dashboardTestCallToken: "dashboard-secret" })).resolves.toEqual({
      allowed: true,
      businessId: "business-a",
      mode: "normal",
      dashboardTestCall: true,
    });
  });
});
