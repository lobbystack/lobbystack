import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ limit: vi.fn(), order: vi.fn(), secret: vi.fn(() => "x".repeat(32)), telephonyOrder: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/phone-number-search-limit", () => ({ assertPhoneNumberSearchAllowed: fixture.limit }));
vi.mock("@lobbystack/domain", () => ({ orderOnboardingNumberClaim: fixture.order }));
vi.mock("@/lib/telephony", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/telephony")>(),
  getNumberClaimTokenSecret: fixture.secret,
  requireNumberSearch: () => undefined,
  getTelephony: () => ({ assignedNumbers: { assignsOnOrder: () => true, order: fixture.telephonyOrder }, forNumber: () => ({ inventory: { releasePhoneNumber: fixture.release } }) }),
}));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

const request = (body: unknown) => new Request("http://localhost:3000/api/onboarding/phone-numbers/order?businessId=business", { method: "POST", body: JSON.stringify(body) });

it("counts the order against the search limit, then reserves a claim for the city, answering 202", async () => {
  fixture.order.mockResolvedValue("claim-1");
  const response = await POST(request({ selection: { countryCode: "RS", kind: "local", city: "Novi Sad" }, idempotencyKey: "key-1" }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ claimId: "claim-1" });
  expect(fixture.limit).toHaveBeenCalledWith(expect.objectContaining({ initial: false }));
  expect(fixture.order).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ selection: { countryCode: "RS", kind: "local", city: "Novi Sad" }, idempotencyKey: "key-1", claimTokenSecret: "x".repeat(32) }), expect.anything());
});

it("makes a key when the browser sends none, and hands the domain a provider that orders and releases through the carrier", async () => {
  fixture.order.mockImplementation(async (_domain: unknown, _input: unknown, provider: { order: (input: unknown) => Promise<unknown>; release: (input: unknown) => Promise<void>; assignsOnOrder: (country: string) => boolean }) => {
    expect(provider.assignsOnOrder("RS")).toBe(true);
    await provider.order({ countryCode: "RS", kind: "local", city: "Nis", label: "x" });
    await provider.release({ carrier: "zadarma", providerPhoneId: "381211234567" });
    return "claim-2";
  });
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" } }))).status).toBe(202);
  expect(fixture.order.mock.calls[0]![1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(fixture.telephonyOrder).toHaveBeenCalledWith({ countryCode: "RS", kind: "local", city: "Nis", label: "x" });
  expect(fixture.release).toHaveBeenCalledWith({ providerPhoneId: "381211234567" });
});

it("orders nothing when the search limit refuses", async () => {
  fixture.limit.mockRejectedValue(Object.assign(new Error("Too many number searches."), { status: 429 }));
  const response = await POST(request({ selection: { countryCode: "RS", city: "Nis" } }));
  expect(response.status).toBe(429);
  expect(fixture.order).not.toHaveBeenCalled();
});
