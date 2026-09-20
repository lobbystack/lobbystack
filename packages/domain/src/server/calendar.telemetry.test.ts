import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import { connectCalendar } from "./calendar";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("calendar connection telemetry", () => {
  it("records integration.calendar_connected at business scope after the connection commits", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("conn_1");

    await expect(connectCalendar(context, { userId: "user_1", businessId: "biz_1", provider: "google", externalAccountId: "acct_1" })).resolves.toBe("conn_1");

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "integration.calendar_connected",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { provider: "google", scope: "business" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("records integration.calendar_connected at staff scope when a staff member is assigned", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("conn_2");

    await connectCalendar(context, { userId: "user_1", businessId: "biz_1", provider: "google", externalAccountId: "acct_2", staffId: "staff_1" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "integration.calendar_connected",
      properties: { provider: "google", scope: "staff" },
    }));
  });

  it("does not record integration.calendar_connected when the connection transaction fails", async () => {
    mocks.withBusinessTransaction.mockRejectedValue(new Error("insert failed"));

    await expect(connectCalendar(context, { userId: "user_1", businessId: "biz_1", provider: "google", externalAccountId: "acct_1" })).rejects.toThrow("insert failed");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
