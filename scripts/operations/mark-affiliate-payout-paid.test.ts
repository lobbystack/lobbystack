import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markAffiliatePayoutItemPaid: vi.fn(),
  item: [{ status: "ready", amountCents: 12_000, currency: "usd" }] as unknown[],
}));

vi.mock("../../packages/domain/src/server/affiliates", () => ({ markAffiliatePayoutItemPaid: mocks.markAffiliatePayoutItemPaid }));
vi.mock("@lobbystack/db", () => {
  const query = { from: () => query, where: () => query, limit: async () => mocks.item };
  return {
    affiliatePayoutItems: { id: "id", status: "status", amountCents: "amount_cents", currency: "currency" },
    createDatabaseClient: () => ({ db: {}, pool: { end: async () => undefined } }),
    withDispatcherTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) => await run({ select: () => query }),
  };
});

import { main } from "./mark-affiliate-payout-paid";

const payoutItemId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.markAffiliatePayoutItemPaid.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("mark affiliate payout paid", () => {
  it("changes nothing without --apply", async () => {
    await main(["--payout-item-id", payoutItemId, "--amount-cents", "12000", "--reference", "paypal-123"]);
    expect(mocks.markAffiliatePayoutItemPaid).not.toHaveBeenCalled();
  });

  it("marks the item paid with the reference on --apply", async () => {
    mocks.markAffiliatePayoutItemPaid.mockResolvedValue(true);
    await main(["--payout-item-id", payoutItemId, "--amount-cents", "12000", "--reference", "paypal-123", "--apply"]);
    expect(mocks.markAffiliatePayoutItemPaid).toHaveBeenCalledWith({ db: {} }, { payoutItemId, expectedAmountCents: 12_000, externalReference: "paypal-123" });
  });

  it("refuses when the item no longer holds the amount that was sent", async () => {
    // The daily run added $30 of newly cleared commission after the operator sent $90.
    await expect(main(["--payout-item-id", payoutItemId, "--amount-cents", "9000", "--reference", "paypal-123", "--apply"])).rejects.toThrow("holds 12000 cents and you sent 9000");
    expect(mocks.markAffiliatePayoutItemPaid).not.toHaveBeenCalled();
  });

  it("fails when the item is not ready", async () => {
    mocks.markAffiliatePayoutItemPaid.mockResolvedValue(false);
    await expect(main(["--payout-item-id", payoutItemId, "--amount-cents", "12000", "--reference", "paypal-123", "--apply"])).rejects.toThrow("nothing changed");
  });

  it("requires a reference and the amount sent", async () => {
    await expect(main(["--payout-item-id", payoutItemId, "--amount-cents", "12000", "--apply"])).rejects.toThrow();
    await expect(main(["--payout-item-id", payoutItemId, "--reference", "paypal-123", "--apply"])).rejects.toThrow();
    expect(mocks.markAffiliatePayoutItemPaid).not.toHaveBeenCalled();
  });
});
