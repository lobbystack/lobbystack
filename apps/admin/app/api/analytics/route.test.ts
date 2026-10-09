import { afterEach, describe, expect, it, vi } from "vitest";

const getAnalytics = vi.hoisted(() => vi.fn(async () => ({ series: [] })));
vi.mock("@lobbystack/domain", () => ({ analyticsGranularities: ["hour", "day", "week", "month", "year"], getAnalytics }));
vi.mock("@/lib/api-helpers", () => ({
  requireOperatorBusiness: async () => ({ session: { user: { id: "user" } }, businessId: "business" }),
  asApiResponse: () => Response.json({ error: "Request failed" }, { status: 400 }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));

import { GET } from "./route";

afterEach(() => { vi.clearAllMocks(); });

function request(days: number, granularity: string) {
  const from = new Date(Date.UTC(2026, 0, 1));
  const to = new Date(from.getTime() + days * 86_400_000);
  return GET(new Request(`http://localhost:3000/api/analytics?from=${from.toISOString()}&to=${to.toISOString()}&granularity=${granularity}`));
}

describe("analytics route range limits", () => {
  it.each<[string, number]>([["hour", 20], ["day", 366], ["week", 3493], ["month", 3660], ["year", 3660]])("allows %s ranges up to %i days", async (granularity, days) => {
    expect((await request(days, granularity)).status).toBe(200);
    expect((await request(days + 1, granularity)).status).toBe(400);
  });
});
