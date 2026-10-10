import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn(), enqueueOutbox: vi.fn(), requireBusinessAdmin: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));
vi.mock("../authz", () => ({ requireBusinessAdmin: mocks.requireBusinessAdmin }));

import { reserveOnboardingNumberClaim, reserveReplacementNumberClaim, searchBusinessNumberInventory } from "./phoneNumbers";

const context = { db: {} as never };
const scope = { userId: "user-1", businessId: "business-1", claimTokenSecret: "number-claim-unit-secret" };
const phone = "+14165550123";

function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit"]) node[method] = () => node;
  node.then = (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return node;
}

function setup(execute: () => unknown = () => ({ rows: [{ id: "claim-1" }] })) {
  const selects = [[{ stage: "complete", timezone: "America/Toronto", deploymentMode: "self_hosted_standard", replacementUsedAt: null }], [], [{ id: "number-1" }]];
  const tx = { select: () => chain(selects.shift() ?? []), execute: vi.fn(async () => await execute()) };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback(tx));
  return tx;
}

async function offer(purpose: "onboarding" | "replacement" = "onboarding") {
  const { numbers } = await searchBusinessNumberInventory(context, { ...scope, purpose }, { listAvailablePhoneNumbers: async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }] });
  return numbers[0]!.claimToken;
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers({ now: new Date("2026-10-09T12:00:00.000Z") }); });
afterEach(() => { vi.useRealTimers(); });

describe("searchBusinessNumberInventory", () => {
  it("offers only numbers that can call and text, up to the limit", async () => {
    setup();
    const result = await searchBusinessNumberInventory(context, { ...scope, limit: 2 }, { listAvailablePhoneNumbers: async () => [
      { phoneE164: "+14165550101", countryCode: "CA", capabilities: { sms: false, voice: true } },
      { phoneE164: "+14165550102", countryCode: "CA", capabilities: { sms: true, voice: true } },
      { phoneE164: "+14165550103", countryCode: "CA", capabilities: { sms: true, voice: true } },
      { phoneE164: "+14165550104", countryCode: "CA", capabilities: { sms: true, voice: true } },
    ] });
    expect(result.numbers.map(number => number.phoneE164)).toEqual(["+14165550102", "+14165550103"]);
    expect(result.numbers.every(number => typeof number.claimToken === "string")).toBe(true);
  });
});

describe("number claims", () => {
  it("refuses an offer older than five minutes with 409 before reserving anything", async () => {
    const tx = setup();
    const claimToken = await offer();
    vi.advanceTimersByTime(6 * 60_000);
    await expect(reserveOnboardingNumberClaim(context, { ...scope, claimToken, idempotencyKey: "key" })).rejects.toMatchObject({ status: 409, code: "number_offer_expired" });
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("refuses a tampered offer with 400", async () => {
    setup();
    const claimToken = await offer();
    await expect(reserveOnboardingNumberClaim(context, { ...scope, claimToken: `${claimToken}x`, idempotencyKey: "key" })).rejects.toMatchObject({ status: 400, code: "number_offer_invalid" });
  });

  it.each([
    ["number_claim_in_progress", 409],
    ["business_number_exists", 409],
    ["number_claim_rate_limited", 429],
    ["monthly_claim_quota_reached", 429],
  ])("maps the %s database refusal to %i without echoing the phone", async (reason, status) => {
    setup(() => { throw Object.assign(new Error(`Failed query: SELECT app.reserve_onboarding_number_claim params: ${phone}`), { cause: Object.assign(new Error(reason), { code: "P0001" }) }); });
    const error = await reserveOnboardingNumberClaim(context, { ...scope, claimToken: await offer(), idempotencyKey: "key" }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status, code: reason });
    expect(String((error as Error).message)).not.toContain(phone);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("maps a replacement refusal and leaves an unexpected database error alone", async () => {
    setup(() => { throw Object.assign(new Error("Failed query"), { cause: new Error("replacement_number_must_differ") }); });
    await expect(reserveReplacementNumberClaim(context, { ...scope, claimToken: await offer("replacement"), idempotencyKey: "key" })).rejects.toMatchObject({ status: 409, code: "replacement_number_must_differ" });
    const outage = new Error("connection terminated");
    setup(() => { throw outage; });
    await expect(reserveReplacementNumberClaim(context, { ...scope, claimToken: await offer("replacement"), idempotencyKey: "key" })).rejects.toBe(outage);
  });
});
