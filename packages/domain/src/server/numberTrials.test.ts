import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadEntitlement: vi.fn(), requireBusinessMembership: vi.fn() }));

vi.mock("../authz", () => ({ hasMinimumRole: vi.fn(), requireBusinessAdmin: vi.fn(), requireBusinessMembership: mocks.requireBusinessMembership }));
vi.mock("./entitlement", () => ({ loadEntitlement: mocks.loadEntitlement }));

import { assertTransferNumberAllowed, numberCountries, numberTrialEmailDueAt, numberTrialEndsAt, numberTrialReleaseAt, onboardingNumberTrialOutlookInTransaction, trialCountries } from "./numberTrials";

describe("number trial clock", () => {
  it("ends at midnight after the 14th day in the business's time zone, counting the purchase day as day 1", () => {
    // Bought at 3 p.m. in Montreal on Oct 11: the trial runs through Oct 24.
    const endsAt = numberTrialEndsAt(new Date("2026-10-11T19:00:00Z"), "America/Toronto");
    expect(endsAt.toISOString()).toBe("2026-10-25T04:00:00.000Z");
  });

  it("keeps the number until the day before Twilio bills its second month", () => {
    expect(numberTrialReleaseAt(new Date("2026-10-11T19:00:00Z")).toISOString()).toBe("2026-11-10T19:00:00.000Z");
  });

  it("sends the reminders at 9 a.m. local on day 10, day 13 and the day after the trial", () => {
    const endsAt = new Date("2026-10-25T04:00:00Z");
    expect(numberTrialEmailDueAt("day10", endsAt, "America/Toronto").toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(numberTrialEmailDueAt("day13", endsAt, "America/Toronto").toISOString()).toBe("2026-10-23T13:00:00.000Z");
    expect(numberTrialEmailDueAt("ended", endsAt, "America/Toronto").toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });
});

describe("number countries", () => {
  it("sells US, Canadian and Puerto Rican numbers with no registration, and the others once their bundle is set", () => {
    expect(numberCountries({})).toEqual(["US", "CA", "PR"]);
    expect(numberCountries({ TWILIO_GB_BUNDLE_SID: "BU1", TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_NZ_BUNDLE_SID: "BU3", TWILIO_NZ_ADDRESS_SID: "AD3" })).toEqual(["US", "CA", "PR", "GB", "NZ"]);
    expect(numberCountries({ TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_AU_ADDRESS_SID: "AD2" })).toEqual(["US", "CA", "PR", "AU"]);
  });

  it("gives no free trial in Australia, where a number costs $8.25 a month", () => {
    expect(trialCountries({ TWILIO_GB_BUNDLE_SID: "BU1", TWILIO_AU_BUNDLE_SID: "BU2", TWILIO_AU_ADDRESS_SID: "AD2" })).toEqual(["US", "CA", "PR", "GB"]);
  });
});

describe("assertTransferNumberAllowed", () => {
  // A business with no number trial.
  const tx = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as never;
  const businessId = "biz_1";

  it("refuses a number in a country Twilio can't call, including a Caribbean +1 number", async () => {
    await expect(assertTransferNumberAllowed(tx, { businessId, phone: "+18765550100" })).rejects.toMatchObject({ status: 400, code: "transfer_country_unsupported" });
    await expect(assertTransferNumberAllowed(tx, { businessId, phone: "+79161234567" })).rejects.toMatchObject({ status: 400, code: "transfer_country_unsupported" });
  });

  it("accepts a Canadian number", async () => {
    await expect(assertTransferNumberAllowed(tx, { businessId, phone: "+14165550199" })).resolves.toBeUndefined();
  });
});

function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy", "for"]) node[method] = () => node;
  node.then = (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return node;
}

type Setup = {
  deploymentMode?: string;
  timezone?: string;
  partnerId?: string | null;
  live?: boolean;
  number?: unknown[];
  phone?: unknown[];
  attempt?: unknown[];
  used?: boolean;
  ipLimited?: boolean;
  ipHash?: string | null;
};

/** The trial outlook for a business, with the reads it makes in the order it makes them. */
function outlook({ deploymentMode = "cloud", timezone = "America/Toronto", partnerId = null, live = false, number = [], phone = [{ phone: null }], attempt = [], used = false, ipLimited = false, ipHash = null }: Setup = {}) {
  mocks.loadEntitlement.mockResolvedValue({ live });
  const rows = [[{ deploymentMode, timezone, partnerId }], number, phone, attempt];
  let trialReads = 0;
  const tx = {
    select: () => chain(rows.shift() ?? []),
    execute: vi.fn(async () => ({ rows: [{ used: trialReads++ === 0 ? used : ipLimited }] })),
  };
  return onboardingNumberTrialOutlookInTransaction(tx as never, { userId: "user-1", businessId: "business-1", ipHash }).then((result) => ({ result, tx }));
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("the number step's trial outlook", () => {
  it("asks for a phone when a free trial is still possible", async () => {
    const { result } = await outlook();
    expect(result).toEqual({ verificationNeeded: true, refusal: null });
  });

  it("skips the phone on a live plan, which includes a number", async () => {
    const { result } = await outlook({ live: true });
    expect(result).toEqual({ verificationNeeded: false, refusal: null });
  });

  it("skips the phone on a self-hosted install, which buys its numbers", async () => {
    const { result } = await outlook({ deploymentMode: "self_hosted_standard" });
    expect(result).toEqual({ verificationNeeded: false, refusal: null });
  });

  it("keeps the phone for a partner's business, whose calls forward to it", async () => {
    const { result } = await outlook({ partnerId: "partner-1" });
    expect(result).toEqual({ verificationNeeded: true, refusal: null });
  });

  it("skips the phone when the workspace already has a number", async () => {
    const { result } = await outlook({ number: [{ id: "number-1" }] });
    expect(result).toEqual({ verificationNeeded: false, refusal: null });
  });

  it("skips the phone when the owner already verified one", async () => {
    const { result } = await outlook({ phone: [{ phone: "+14165550123" }], attempt: [{ countryCode: "CA" }] });
    expect(result).toEqual({ verificationNeeded: false, refusal: null });
  });

  it("sends a used trial straight to the plans", async () => {
    const { result } = await outlook({ used: true });
    expect(result).toEqual({ verificationNeeded: false, refusal: "trial_already_used" });
  });

  it("sends a network that already had a trial to the plans", async () => {
    const { result } = await outlook({ ipHash: "network-hash", ipLimited: true });
    expect(result).toEqual({ verificationNeeded: false, refusal: "trial_ip_limited" });
  });

  it("sends a market without trial numbers to the plans", async () => {
    const { result } = await outlook({ timezone: "Australia/Sydney" });
    expect(result).toEqual({ verificationNeeded: false, refusal: "dedicated_number_requires_paid_plan" });
  });
});
