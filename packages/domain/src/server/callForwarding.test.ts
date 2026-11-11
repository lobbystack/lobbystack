import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  recordProductEventInTransaction: vi.fn(),
  sharedSmsSender: vi.fn(() => "+18885550100" as string | null),
}));

vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.withBusinessTransaction }));
vi.mock("./productEvents", () => ({ recordProductEventInTransaction: mocks.recordProductEventInTransaction }));
vi.mock("./smsSender", () => ({ sharedSmsSender: mocks.sharedSmsSender }));

import { forwardedFromCandidate, recordForwardedCall } from "./callForwarding";

const ours = "+14165550100";

describe("forwardedFromCandidate", () => {
  it("takes the first line that isn't ours, the caller's or the shared sender", () => {
    expect(forwardedFromCandidate({ dialled: ours, from: "+14165550134", candidates: [ours, "+14165550134", "+18885550100", "+14165550177", "+14165550166"], ownNumbers: [ours], sharedSender: "+18885550100" })).toBe("+14165550177");
  });

  it("finds nothing in a call only the trunk diverted, or a business's other number", () => {
    expect(forwardedFromCandidate({ dialled: ours, candidates: [ours], ownNumbers: [ours] })).toBeNull();
    expect(forwardedFromCandidate({ dialled: ours, candidates: ["+14165550199"], ownNumbers: [ours, "+14165550199"] })).toBeNull();
    expect(forwardedFromCandidate({ dialled: ours, candidates: ["not-a-phone"], ownNumbers: [ours] })).toBeNull();
  });
});

describe("recordForwardedCall", () => {
  let updated: Array<{ id: string }>;
  beforeEach(() => {
    vi.clearAllMocks();
    updated = [{ id: "phone-1" }];
    const tx = {
      select: () => ({ from: () => ({ where: async () => [{ id: "phone-1", e164: ours, detectedAt: null }] }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: async () => updated }) }) }),
    };
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, work: (tx: unknown) => unknown) => await work(tx));
  });

  it("stores the line on the first forwarded call and records voice.forwarding_detected", async () => {
    await expect(recordForwardedCall({ db: {} as never }, { businessId: "business-1", dialled: ours, candidates: ["+14165550177", ours], source: "sip" })).resolves.toBe("+14165550177");
    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: "voice.forwarding_detected",
      businessId: "business-1",
      distinctId: "system:business:business-1",
      properties: { phoneNumberId: "phone-1", source: "sip" },
    }));
  });

  it("records nothing once the number already knows its line", async () => {
    updated = [];
    await expect(recordForwardedCall({ db: {} as never }, { businessId: "business-1", dialled: ours, candidates: ["+14165550177"], source: "twilio" })).resolves.toBeNull();
    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });

  it("opens no transaction for a call with no forwarding header", async () => {
    await expect(recordForwardedCall({ db: {} as never }, { businessId: "business-1", dialled: ours, candidates: [], source: "sip" })).resolves.toBeNull();
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });
});
