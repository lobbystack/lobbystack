import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  return {
    execute,
    getFinanceExportDatabase: vi.fn(() => ({ db: { execute } })),
  };
});

vi.mock("@/lib/api-helpers", () => ({
  getFinanceExportDatabase: mocks.getFinanceExportDatabase,
}));

import { GET } from "./route";

describe("finance export", () => {
  afterEach(() => {
    delete process.env.FINANCE_EXPORT_ENABLED;
    delete process.env.FINANCE_EXPORT_TOKEN;
    mocks.execute.mockReset();
    mocks.getFinanceExportDatabase.mockClear();
  });

  it("is absent unless explicitly enabled", async () => {
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=usage"));
    expect(response.status).toBe(404);
    expect(mocks.getFinanceExportDatabase).not.toHaveBeenCalled();
  });

  it("requires the dedicated finance bearer token", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=usage", {
      headers: { authorization: "Bearer some-internal-service-token" },
    }));
    expect(response.status).toBe(401);
    expect(mocks.getFinanceExportDatabase).not.toHaveBeenCalled();
  });

  it("returns cursor-safe mutable metrics with bookings", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "business:2026-09-09", businessId: "business", date: "2026-09-09", callCount: 2, voiceSeconds: 42, bookingCount: 1, updatedAt: "2026-09-09T12:00:00.000Z" }] });
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=metrics", {
      headers: { authorization: "Bearer finance-only-token" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version: "v1", resource: "metrics", data: [expect.objectContaining({ bookingCount: 1 })], nextCursor: null });
    expect(mocks.execute.mock.calls[0]?.[0]).toContain("daily_bookings");
    expect(mocks.execute.mock.calls[0]?.[0]).toContain("booking_count");
    expect(mocks.execute.mock.calls[0]?.[0]).toContain("status <> 'canceled'");
  });

  it("rejects a syntactically valid cursor with an invalid timestamp", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    const cursor = Buffer.from(JSON.stringify({ updatedAt: "not-a-date", id: "row" })).toString("base64url");
    const response = await GET(new Request(`http://localhost/api/internal/finance/export?resource=usage&cursor=${cursor}`, {
      headers: { authorization: "Bearer finance-only-token" },
    }));
    expect(response.status).toBe(400);
    expect(mocks.getFinanceExportDatabase).not.toHaveBeenCalled();
  });

  it("includes provider and embedding ledger events in usage exports", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=usage", {
      headers: { authorization: "Bearer finance-only-token" },
    }));
    expect(response.status).toBe(200);
    const query = mocks.execute.mock.calls[0]?.[0] as string;
    expect(query).not.toContain("event_kind in");
    expect(query).toContain("knowledge.%");
    expect(query).toContain("%_provider");
  });

  it("exports service periods that overlap the requested window", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=service-periods&from=2026-09-01&to=2026-09-30", {
      headers: { authorization: "Bearer finance-only-token" },
    }));
    expect(response.status).toBe(200);
    const query = mocks.execute.mock.calls[0]?.[0] as string;
    expect(query).toContain("current_period_end is null or current_period_end >= '2026-09-01'::date");
    expect(query).toContain("current_period_start < ('2026-09-30'::date + interval '1 day')");
  });

  it("serializes updatedAt at microsecond precision for strict cursors", async () => {
    process.env.FINANCE_EXPORT_ENABLED = "true";
    process.env.FINANCE_EXPORT_TOKEN = "finance-only-token";
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/internal/finance/export?resource=usage", {
      headers: { authorization: "Bearer finance-only-token" },
    }));
    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0]?.[0]).toContain("HH24:MI:SS.US");
  });
});
