import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planEntitlement, type Entitlement } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn(), enqueueOutbox: vi.fn(), requireBusinessAdmin: vi.fn(), loadEntitlement: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));
vi.mock("../authz", () => ({ requireBusinessAdmin: mocks.requireBusinessAdmin }));
vi.mock("./entitlement", () => ({ loadEntitlement: mocks.loadEntitlement }));

import { readNumberOffer, reserveOnboardingNumberClaim, reserveReplacementNumberClaim, searchBusinessNumberInventory, skipOnboardingNumber } from "./phoneNumbers";

const context = { db: {} as never };
const scope = { userId: "user-1", businessId: "business-1", claimTokenSecret: "number-claim-unit-secret" };
const phone = "+14165550123";

function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy"]) node[method] = () => node;
  node.then = (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return node;
}

/** The business holds this entitlement. */
function entitled(entitlement: Entitlement) {
  mocks.loadEntitlement.mockResolvedValue(entitlement);
}

// Selects in order: the business, then what the purpose needs. A self-hosted business has no limit; a cloud one here is on Free.
function setup(execute: () => unknown = () => ({ rows: [{ id: "claim-1" }] }), business: Record<string, unknown> = {}) {
  const row = { stage: "complete", timezone: "America/Toronto", deploymentMode: "self_hosted_standard", replacementUsedAt: null, ...business };
  entitled(planEntitlement(row.deploymentMode === "cloud" ? "free_cloud" : "self_host"));
  const selects = [[row], [{ id: "number-1" }]];
  const tx = { select: () => chain(selects.shift() ?? []), update: () => ({ set: () => ({ where: async () => [] }) }), execute: vi.fn(async () => await execute()) };
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
  afterEach(() => { vi.unstubAllEnvs(); });

  const inventory = [
    { phoneE164: "+14165550100", countryCode: "CA" as const, capabilities: { sms: true, voice: false } },
    { phoneE164: "+14165550101", countryCode: "CA" as const, capabilities: { sms: false, voice: true } },
    { phoneE164: "+14165550102", countryCode: "CA" as const, capabilities: { sms: true, voice: true } },
    { phoneE164: "+14165550103", countryCode: "CA" as const, capabilities: { sms: true, voice: true } },
  ];

  it("offers a hosted business numbers that take calls, texting or not, up to the limit", async () => {
    entitled(planEntitlement("starter", { live: true, capMinor: null }));
    const selects = [[{ stage: "complete", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], []];
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []) }));
    const listAvailablePhoneNumbers = vi.fn(async () => inventory);
    const result = await searchBusinessNumberInventory(context, { ...scope, limit: 2 }, { listAvailablePhoneNumbers });
    expect(result.numbers.map(number => number.phoneE164)).toEqual(["+14165550101", "+14165550102"]);
    expect(result.numbers.every(number => typeof number.claimToken === "string")).toBe(true);
    expect(result.trial).toBe(false);
    expect(listAvailablePhoneNumbers).toHaveBeenCalledWith(expect.not.objectContaining({ sms: true }));
  });

  it("offers a self-hosted business only numbers that also text, since it texts from its own number", async () => {
    setup();
    const listAvailablePhoneNumbers = vi.fn(async () => inventory);
    const result = await searchBusinessNumberInventory(context, { ...scope, limit: 2 }, { listAvailablePhoneNumbers });
    expect(result.numbers.map(number => number.phoneE164)).toEqual(["+14165550102", "+14165550103"]);
    expect(listAvailablePhoneNumbers).toHaveBeenCalledWith(expect.objectContaining({ sms: true }));
  });

  it.each([
    ["a cloud workspace without a verified email", { deploymentMode: "cloud" }, "onboarding", 409, "email_verification_required"],
    ["a workspace that already replaced its number", { replacementUsedAt: new Date() }, "replacement", 409, "replacement_already_used"],
    ["a workspace still creating its business", { stage: "create_business" }, "onboarding", 409, "invalid_onboarding_stage"],
  ] as const)("answers a search from %s with %i", async (_case, business, purpose, status, code) => {
    setup(undefined, business);
    await expect(offer(purpose)).rejects.toMatchObject({ status, code });
  });

  it("searches mobile numbers for businesses in the UK and Australia once their bundles are set", async () => {
    vi.stubEnv("TWILIO_GB_BUNDLE_SID", "BUGB");
    vi.stubEnv("TWILIO_AU_BUNDLE_SID", "BUAU");
    vi.stubEnv("TWILIO_AU_ADDRESS_SID", "ADAU");
    const listAvailablePhoneNumbers = vi.fn(async () => []);
    setup(undefined, { timezone: "Europe/London" });
    await searchBusinessNumberInventory(context, scope, { listAvailablePhoneNumbers });
    setup();
    await searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "AU", kind: "local" } }, { listAvailablePhoneNumbers });
    expect(listAvailablePhoneNumbers).toHaveBeenNthCalledWith(1, expect.objectContaining({ countryCode: "GB", kind: "mobile" }));
    expect(listAvailablePhoneNumbers).toHaveBeenNthCalledWith(2, expect.objectContaining({ countryCode: "AU", kind: "mobile" }));
  });

  it("refuses UK numbers until the UK bundle is set", async () => {
    setup(undefined, { timezone: "Europe/London" });
    await expect(searchBusinessNumberInventory(context, scope, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 400, code: "unsupported_country" });
  });

  describe("free trial numbers", () => {
    // A business on Free. Selects in order: the business, the user's verified phone, its approved attempt, then trials.
    function trialSetup(countryCode: string, trials: unknown[] = []) {
      entitled(planEntitlement("free_cloud"));
      const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: "+14165550123" }], [{ countryCode }], [{ email: "owner@example.invalid", emailVerified: true }], trials];
      mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []) }));
    }

    it("offers a free business trial numbers from its verified phone's country", async () => {
      trialSetup("CA");
      const listAvailablePhoneNumbers = vi.fn(async () => [{ phoneE164: "+14165550101", countryCode: "CA", capabilities: { sms: true, voice: true } }]);
      const result = await searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "US", kind: "local" } }, { listAvailablePhoneNumbers });
      expect(listAvailablePhoneNumbers).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "CA" }));
      expect(result.trial).toBe(true);
      const payload = JSON.parse(Buffer.from(result.numbers[0]!.claimToken.split(".")[0]!, "base64url").toString("utf8")) as { selection: { trial?: boolean; verifiedPhone?: string } };
      expect(payload.selection).toMatchObject({ trial: true, verifiedPhone: "+14165550123" });
    });

    it("offers the plans when no verified phone and no trusted network can identify the claimer", async () => {
      entitled(planEntitlement("free_cloud"));
      const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: null }], [{ email: "owner@example.invalid", emailVerified: true }]];
      const execute = vi.fn(async () => ({ rows: [{ used: false }] }));
      mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []), execute }));
      await expect(searchBusinessNumberInventory(context, scope, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 409, code: "trial_not_available" });
    });

    it("signs a trial without a phone when the email and network are clean", async () => {
      entitled(planEntitlement("free_cloud"));
      const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: null }], [{ email: "owner@example.invalid", emailVerified: true }]];
      const execute = vi.fn(async () => ({ rows: [{ used: false }] }));
      mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []), execute }));
      const result = await searchBusinessNumberInventory(context, { ...scope, ipHash: "network-hash", ipCountry: "CA" }, { listAvailablePhoneNumbers: async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }] });
      const payload = JSON.parse(Buffer.from(result.numbers[0]!.claimToken.split(".")[0]!, "base64url").toString("utf8")) as { selection: { trial?: boolean; verifiedPhone?: string; withoutSms?: boolean } };
      expect(payload.selection).toMatchObject({ trial: true, withoutSms: true });
      expect(payload.selection.verifiedPhone).toBeUndefined();
      // The request's country picked the number's, so the chooser offers no other.
      expect(result.countryFixed).toBe(true);
    });

    /** A business on Free whose owner verified no phone, searching from a clean network. */
    function noPhoneSetup() {
      entitled(planEntitlement("free_cloud"));
      const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: null }], [{ email: "owner@example.invalid", emailVerified: true }]];
      const execute = vi.fn(async () => ({ rows: [{ used: false }] }));
      mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []), execute }));
    }

    it("searches the country the request comes from, whatever country the search asked for", async () => {
      noPhoneSetup();
      const listAvailablePhoneNumbers = vi.fn(async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }]);
      const result = await searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "US", kind: "local" }, ipHash: "network-hash", ipCountry: "CA" }, { listAvailablePhoneNumbers });
      expect(listAvailablePhoneNumbers).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "CA" }));
      expect(result).toMatchObject({ market: { countryCode: "CA" }, trial: true, countryFixed: true });
    });

    it("signs the dashboard's offers as the dashboard's", async () => {
      noPhoneSetup();
      const { numbers } = await searchBusinessNumberInventory(context, { ...scope, ipHash: "network-hash", ipCountry: "CA" }, { listAvailablePhoneNumbers: async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }] });
      expect(readNumberOffer(numbers[0]!.claimToken, scope.claimTokenSecret).via).toBe("dashboard");
    });

    it.each(["VI", "GU", "AS", "MP"])("searches US numbers for an owner in a US territory (%s)", async (ipCountry) => {
      noPhoneSetup();
      const listAvailablePhoneNumbers = vi.fn(async () => [{ phoneE164: "+13405550100", countryCode: "US", capabilities: { sms: true, voice: true } }]);
      const result = await searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "CA", kind: "local" }, ipHash: "network-hash", ipCountry }, { listAvailablePhoneNumbers });
      expect(listAvailablePhoneNumbers).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "US" }));
      expect(result).toMatchObject({ market: { countryCode: "US" }, trial: true, countryFixed: true });
    });

    it("offers the plans to someone in a country without trial numbers", async () => {
      noPhoneSetup();
      await expect(searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "US", kind: "local" }, ipHash: "network-hash", ipCountry: "BD" }, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 409, code: "trial_country_mismatch" });
    });

    it("offers the plans when the verified mobile's country isn't the one the request comes from", async () => {
      trialSetup("CA");
      await expect(searchBusinessNumberInventory(context, { ...scope, ipHash: "network-hash", ipCountry: "US" }, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 409, code: "trial_country_mismatch" });
    });

    it("keeps the verified mobile's trial when the deployment trusts no country", async () => {
      trialSetup("CA");
      const result = await searchBusinessNumberInventory(context, { ...scope, ipCountry: undefined }, { listAvailablePhoneNumbers: async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }] });
      expect(result).toMatchObject({ trial: true, countryFixed: true });
    });

    it("sends Australia to the plans, since its numbers are paid only", async () => {
      vi.stubEnv("TWILIO_AU_BUNDLE_SID", "BUAU");
      vi.stubEnv("TWILIO_AU_ADDRESS_SID", "ADAU");
      trialSetup("AU");
      await expect(searchBusinessNumberInventory(context, scope, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 409, code: "dedicated_number_requires_paid_plan" });
    });

    it("refuses a second trial for the same business", async () => {
      trialSetup("CA", [{ id: "trial-1" }]);
      await expect(searchBusinessNumberInventory(context, scope, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 409, code: "trial_already_used" });
    });
  });

  it.each(["IR", "cu", "KP", "SY"])("refuses every number search from %s, on a paid plan too", async (ipCountry) => {
    const listAvailablePhoneNumbers = vi.fn(async () => inventory);
    setup();
    await expect(searchBusinessNumberInventory(context, { ...scope, ipCountry }, { listAvailablePhoneNumbers })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    setup(undefined, { deploymentMode: "cloud" });
    await expect(searchBusinessNumberInventory(context, { ...scope, ipCountry }, { listAvailablePhoneNumbers })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    setup();
    await expect(searchBusinessNumberInventory(context, { ...scope, purpose: "replacement", ipCountry }, { listAvailablePhoneNumbers })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    expect(listAvailablePhoneNumbers).not.toHaveBeenCalled();
  });

  it("answers an unsupported country with 400", async () => {
    setup();
    await expect(searchBusinessNumberInventory(context, { ...scope, selection: { countryCode: "FR" as never } }, { listAvailablePhoneNumbers: async () => [] })).rejects.toMatchObject({ status: 400, code: "unsupported_country" });
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

  it("refuses an offer made to another business or for the other flow with 400", async () => {
    const tx = setup();
    const claimToken = await offer();
    await expect(reserveOnboardingNumberClaim(context, { ...scope, businessId: "business-2", claimToken, idempotencyKey: "key" })).rejects.toMatchObject({ status: 400, code: "number_offer_invalid" });
    await expect(reserveReplacementNumberClaim(context, { ...scope, claimToken, idempotencyKey: "key" })).rejects.toMatchObject({ status: 400, code: "number_offer_invalid" });
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("refuses a claim from a sanctioned country before reserving anything", async () => {
    const tx = setup();
    const claimToken = await offer();
    await expect(reserveOnboardingNumberClaim(context, { ...scope, claimToken, idempotencyKey: "key", ipCountry: "IR" })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    setup();
    await expect(reserveReplacementNumberClaim(context, { ...scope, claimToken: await offer("replacement"), idempotencyKey: "key", ipCountry: "SY" })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("checks a trial offer's country again at the claim, so switching networks after the search gets the plans", async () => {
    entitled(planEntitlement("free_cloud"));
    const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: null }], [{ email: "owner@example.invalid", emailVerified: true }]];
    const execute = vi.fn(async () => ({ rows: [{ used: false }] }));
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain(selects.shift() ?? []), execute }));
    const { numbers } = await searchBusinessNumberInventory(context, { ...scope, ipHash: "network-hash", ipCountry: "CA" }, { listAvailablePhoneNumbers: async () => [{ phoneE164: phone, countryCode: "CA", capabilities: { sms: true, voice: true } }] });
    execute.mockClear();
    await expect(reserveOnboardingNumberClaim(context, { ...scope, claimToken: numbers[0]!.claimToken, idempotencyKey: "key", ipHash: "network-hash", ipCountry: "US" })).rejects.toMatchObject({ status: 409, code: "trial_country_mismatch" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("claims a US trial offer from a US territory", async () => {
    entitled(planEntitlement("free_cloud"));
    const selects = [[{ stage: "phone_number", timezone: "America/Toronto", deploymentMode: "cloud", replacementUsedAt: null }], [{ phone: null }], [{ email: "owner@example.invalid", emailVerified: true }]];
    const execute = vi.fn(async () => ({ rows: [{ used: false, id: "claim-1" }] }));
    const tx = { select: () => chain(selects.shift() ?? []), update: () => ({ set: () => ({ where: async () => [] }) }), execute };
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback(tx));
    const { numbers } = await searchBusinessNumberInventory(context, { ...scope, ipHash: "network-hash", ipCountry: "US" }, { listAvailablePhoneNumbers: async () => [{ phoneE164: "+13405550100", countryCode: "US", capabilities: { sms: true, voice: true } }] });
    mocks.loadEntitlement.mockResolvedValue(planEntitlement("free_cloud"));
    expect(await reserveOnboardingNumberClaim(context, { ...scope, claimToken: numbers[0]!.claimToken, idempotencyKey: "key", ipHash: "network-hash", ipCountry: "VI" })).toBe("claim-1");
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

describe("skipping the number step", () => {
  it.each(["IR", "CU", "KP", "SY"])("refuses a skip from %s before reading the business, as the number step offers no way on", async (ipCountry) => {
    await expect(skipOnboardingNumber(context, { userId: "user-1", businessId: "business-1", countryCode: "IR", ipCountry })).rejects.toMatchObject({ status: 403, code: "number_country_restricted" });
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });

  it("lets an owner elsewhere skip to a country without numbers", async () => {
    const business = { stage: "phone_number", partnerId: null, deploymentMode: "cloud" };
    const update = vi.fn(() => ({ set: () => ({ where: async () => [] }) }));
    mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback({ select: () => chain([business]), update }));
    await expect(skipOnboardingNumber(context, { userId: "user-1", businessId: "business-1", countryCode: "FR", ipCountry: "FR" })).resolves.toBeUndefined();
    expect(update).toHaveBeenCalled();
  });
});
