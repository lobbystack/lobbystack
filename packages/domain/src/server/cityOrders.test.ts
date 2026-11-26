import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planEntitlement } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn(), enqueueOutbox: vi.fn(), loadEntitlement: vi.fn(), loadBusinessBilling: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));
vi.mock("../authz", () => ({ requireBusinessAdmin: vi.fn() }));
vi.mock("./entitlement", () => ({ loadEntitlement: mocks.loadEntitlement, loadBusinessBilling: mocks.loadBusinessBilling }));

import { agents, businesses, onboardingNumberClaimEvents, phoneNumbers } from "@lobbystack/db";

import { orderExtraNumberClaim } from "./extraNumbers";
import { orderReplacementNumberClaim, type AssignedNumberProvider } from "./phoneNumbers";

const context = { db: {} as never };
const scope = { userId: "user-1", businessId: "business-1", claimTokenSecret: "city-order-unit-secret", idempotencyKey: "key-1" };
const selection = { countryCode: "RS" as const, kind: "local" as const, city: "Novi Sad" };
const assigned = { carrier: "zadarma" as const, providerPhoneId: "381211234567", e164: "+381211234567" };
const idle = { carrier: "zadarma" as const, providerPhoneId: "381213860081", e164: "+381213860081" };

function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy"]) node[method] = () => node;
  node.then = (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled);
  return node;
}

function provider(overrides: Partial<AssignedNumberProvider> = {}) {
  return { assignsOnOrder: () => true, listReusable: vi.fn(async () => []), take: vi.fn(async () => undefined), order: vi.fn(async () => assigned), release: vi.fn(async () => undefined), ...overrides } as AssignedNumberProvider & { order: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; take: ReturnType<typeof vi.fn>; listReusable: ReturnType<typeof vi.fn> };
}

/**
 * A paid hosted workspace. Each table answers with its own rows, so the order of a function's queries doesn't matter.
 * `execute` answers every raw query: who holds a number, whether the add-on bills, and the claim function.
 */
function workspace(options: { business?: Record<string, unknown>; earlier?: unknown[]; inFlight?: unknown[]; execute?: () => unknown; free?: boolean; subscribed?: boolean; plan?: "starter" | "free_cloud" } = {}) {
  vi.stubEnv("ZADARMA_DOCUMENTS_GROUP_ID", "5");
  const entitlement = options.free ? planEntitlement("free_cloud") : planEntitlement("starter", { live: true, capMinor: null });
  mocks.loadEntitlement.mockResolvedValue(entitlement);
  mocks.loadBusinessBilling.mockResolvedValue({ entitlement, plan: options.free ? "free_cloud" : "starter" });
  const business = { stage: "complete", timezone: "Europe/Belgrade", deploymentMode: "cloud", replacementUsedAt: null, at: null, partnerId: null, ...options.business };
  let claimQueries = 0;
  const rows = new Map<unknown, unknown[]>([[businesses, [business]], [agents, [{ id: "agent-1" }]], [phoneNumbers, [{ id: "number-1" }]]]);
  const tx = {
    select: () => ({ from: (table: unknown) => {
      // The claims table answers the earlier-claim lookup first, then the in-flight one.
      if (table === onboardingNumberClaimEvents) return chain(claimQueries++ === 0 ? (options.earlier ?? []) : (options.inFlight ?? []));
      return chain(rows.get(table) ?? []);
    } }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
    execute: vi.fn(async () => await (options.execute ?? (() => ({ rows: [{ id: "claim-1", live: options.subscribed ?? true }] })))()),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback(tx));
  return tx;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("orderReplacementNumberClaim", () => {
  const input = { ...scope, selection, phoneNumberId: "number-1" };

  it("orders in the city and reserves the replacement for the number the carrier assigned", async () => {
    const tx = workspace();
    const carrier = provider();
    expect(await orderReplacementNumberClaim(context, input, carrier)).toBe("claim-1");
    expect(carrier.order).toHaveBeenCalledWith({ countryCode: "RS", kind: "local", city: "Novi Sad", label: "LobbyStack business-1" });
    expect(JSON.stringify((tx.execute.mock.calls as unknown[][]).at(-1)![0])).toContain("+381211234567");
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "phoneNumber.provision", aggregateId: "claim-1" }));
  });

  it("gives out an idle number the account holds instead of ordering, and never releases it for a good claim", async () => {
    workspace();
    const carrier = provider({ listReusable: vi.fn(async () => [idle]) } as never);
    expect(await orderReplacementNumberClaim(context, input, carrier)).toBe("claim-1");
    expect(carrier.take).toHaveBeenCalledWith({ carrier: "zadarma", providerPhoneId: "381213860081" });
    expect(carrier.order).not.toHaveBeenCalled();
    expect(carrier.release).not.toHaveBeenCalled();
  });

  it("orders nothing when the replacement was already used, or one is being set up", async () => {
    const carrier = provider();
    workspace({ business: { replacementUsedAt: new Date() } });
    await expect(orderReplacementNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "replacement_already_used" });
    workspace({ business: { at: new Date() } });
    await expect(orderReplacementNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "replacement_already_reserved" });
    workspace({ inFlight: [{ id: "claim-0" }] });
    await expect(orderReplacementNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "replacement_already_reserved" });
    expect(carrier.order).not.toHaveBeenCalled();
  });

  it("returns the claim it already made for the same key, and orders nothing again", async () => {
    workspace({ earlier: [{ id: "claim-0" }] });
    const carrier = provider();
    expect(await orderReplacementNumberClaim(context, input, carrier)).toBe("claim-0");
    expect(carrier.order).not.toHaveBeenCalled();
  });

  it("releases the number when the claim is refused after the order", async () => {
    workspace({ execute: () => { throw new Error("claim refused"); } });
    const carrier = provider();
    await expect(orderReplacementNumberClaim(context, input, carrier)).rejects.toThrow("claim refused");
    expect(carrier.release).toHaveBeenCalledWith({ carrier: "zadarma", providerPhoneId: "381211234567" });
  });

  it("orders nothing without a city, or in a country whose numbers are picked from a list", async () => {
    workspace();
    const carrier = provider();
    await expect(orderReplacementNumberClaim(context, { ...input, selection: { countryCode: "RS", kind: "local" } }, carrier)).rejects.toMatchObject({ code: "city_required" });
    workspace();
    await expect(orderReplacementNumberClaim(context, input, provider({ assignsOnOrder: () => false }))).rejects.toMatchObject({ code: "city_order_unsupported" });
    expect(carrier.order).not.toHaveBeenCalled();
  });
});

describe("orderExtraNumberClaim", () => {
  const input = { ...scope, agentId: "agent-1", selection };

  it("orders in the city for the agent at the price shown, once the add-on bills, and reserves the claim", async () => {
    const tx = workspace();
    const carrier = provider();
    expect(await orderExtraNumberClaim(context, input, carrier)).toBe("claim-1");
    expect(carrier.order).toHaveBeenCalledOnce();
    const sent = JSON.stringify((tx.execute.mock.calls as unknown[][]).at(-1)![0]);
    expect(sent).toContain("+381211234567");
    expect(sent).toContain("1200");
  });

  it("gives out an idle number for the extra, so nothing is bought", async () => {
    workspace();
    const carrier = provider({ listReusable: vi.fn(async () => [idle]) } as never);
    expect(await orderExtraNumberClaim(context, input, carrier)).toBe("claim-1");
    expect(carrier.take).toHaveBeenCalled();
    expect(carrier.order).not.toHaveBeenCalled();
  });

  it("orders nothing while the add-on that bills a priced number isn't live, since the claim would refuse it", async () => {
    workspace({ subscribed: false });
    const carrier = provider();
    await expect(orderExtraNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "extra_numbers_subscription_required" });
    expect(carrier.order).not.toHaveBeenCalled();
  });

  it("orders nothing for a business on Free, a claim in flight, or an agent that isn't the business's", async () => {
    const carrier = provider();
    workspace({ free: true });
    await expect(orderExtraNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "dedicated_number_requires_paid_plan" });
    workspace({ inFlight: [{ id: "claim-0" }] });
    await expect(orderExtraNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "number_claim_in_progress" });
    const tx = workspace();
    // An agent the business doesn't have answers no row.
    const original = tx.select;
    tx.select = () => ({ from: (table: unknown) => (table === agents ? chain([]) : (original() as { from: (table: unknown) => unknown }).from(table)) }) as never;
    await expect(orderExtraNumberClaim(context, input, carrier)).rejects.toMatchObject({ code: "agent_not_found" });
    expect(carrier.order).not.toHaveBeenCalled();
  });

  it("releases the number when the claim is refused after the order", async () => {
    let calls = 0;
    // The first raw query asks whether the add-on bills, and the claim function is last.
    workspace({ execute: () => { if (calls++ < 2) return { rows: [{ live: true }] }; throw new Error("claim refused"); } });
    const carrier = provider();
    await expect(orderExtraNumberClaim(context, input, carrier)).rejects.toThrow("claim refused");
    expect(carrier.release).toHaveBeenCalledWith({ carrier: "zadarma", providerPhoneId: "381211234567" });
  });
});
