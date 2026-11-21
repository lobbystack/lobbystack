import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ limit: vi.fn(), order: vi.fn(), secret: vi.fn(() => "x".repeat(32)) }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/phone-number-search-limit", () => ({ assertPhoneNumberSearchAllowed: fixture.limit }));
vi.mock("@lobbystack/domain", () => ({ orderReplacementNumberClaim: fixture.order }));
vi.mock("@/lib/assigned-number-provider", () => ({ assignedNumberProvider: () => ({ marker: "provider" }) }));
vi.mock("@/lib/telephony", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/telephony")>(), getNumberClaimTokenSecret: fixture.secret, requireNumberSearch: () => undefined }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

const request = (body: unknown) => new Request("http://localhost:3000/api/phone-numbers/replacement/order?businessId=business", { method: "POST", body: JSON.stringify(body) });

it("counts the order against the search limit, then reserves the replacement for the number being replaced, answering 202", async () => {
  fixture.order.mockResolvedValue("claim-1");
  const response = await POST(request({ selection: { countryCode: "RS", kind: "local", city: "Novi Sad" }, idempotencyKey: "key-1", phoneNumberId: "number-1" }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ claimId: "claim-1" });
  expect(fixture.limit).toHaveBeenCalledWith(expect.objectContaining({ initial: false }));
  expect(fixture.order).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ selection: { countryCode: "RS", kind: "local", city: "Novi Sad" }, idempotencyKey: "key-1", phoneNumberId: "number-1", claimTokenSecret: "x".repeat(32) }), { marker: "provider" });
});

it("replaces the newest number when none is named, and refuses a phoneNumberId that isn't an id", async () => {
  fixture.order.mockResolvedValue("claim-2");
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" } }))).status).toBe(202);
  expect(fixture.order.mock.calls[0]![1]).not.toHaveProperty("phoneNumberId");
  expect(fixture.order.mock.calls[0]![1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" }, phoneNumberId: 7 }))).status).toBe(400);
});

it("orders nothing when the search limit refuses", async () => {
  fixture.limit.mockRejectedValue(Object.assign(new Error("Too many number searches."), { status: 429 }));
  expect((await POST(request({ selection: { countryCode: "RS", city: "Nis" } }))).status).toBe(429);
  expect(fixture.order).not.toHaveBeenCalled();
});
