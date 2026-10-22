import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent, recordProductEventBestEffort: mocks.recordProductEvent }));

import { connectInstagramAccount } from "./instagram";

const context = { db: {} as never };
const input = { userId: "user_1", businessId: "biz_1", instagramUserId: "ig_1", username: "studio", encryptedAccessToken: "sealed", tokenExpiresAt: new Date("2026-12-01T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("instagram connection telemetry", () => {
  it("records integration.instagram_connected after the connection commits", async () => {
    // First the owner lookup (nobody holds the account), then the upsert.
    mocks.withBusinessTransaction.mockResolvedValueOnce(null).mockResolvedValueOnce(undefined);

    await connectInstagramAccount(context, input);

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "integration.instagram_connected",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[1]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("refuses an account another workspace holds, without recording the event", async () => {
    mocks.withBusinessTransaction.mockResolvedValueOnce("biz_other");

    await expect(connectInstagramAccount(context, input)).rejects.toMatchObject({ status: 409, code: "instagram_account_in_use" });

    expect(mocks.withBusinessTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record integration.instagram_connected when the connection transaction fails", async () => {
    mocks.withBusinessTransaction.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("insert failed"));

    await expect(connectInstagramAccount(context, input)).rejects.toThrow("insert failed");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
