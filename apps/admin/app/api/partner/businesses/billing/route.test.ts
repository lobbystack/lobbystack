import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/stripe-connect", () => ({ withStripeConnect: (context: object) => ({ ...context, stripeConnect: "stripe" }) }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, setPartnerBusinessBilling: fixture.set }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { PUT } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const businessId = "7e7f2d1a-49c4-4c55-8a8a-0b3a1d2c4e5f";
const packageId = "0c6d6c9e-3f0a-4a51-9a3b-2a4a3c7b9d10";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const put = (body: unknown) => PUT(new Request(`http://localhost:3000/api/partner/businesses/billing?partnerId=${partnerId}`, { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.set.mockResolvedValue({ kind: "package", packageId, packageName: "Front desk", status: "awaiting_payment" });
});

it("sells a business a package, or bills it outside LobbyStack, through the partner operation", async () => {
  const response = await put({ businessId, packageId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ billing: { kind: "package", packageId, packageName: "Front desk", status: "awaiting_payment" } });
  expect(fixture.set).toHaveBeenCalledWith({ db: "app", stripeConnect: "stripe" }, actor, { businessId, packageId });
  await put({ businessId, packageId: null });
  expect(fixture.set).toHaveBeenLastCalledWith(expect.anything(), actor, { businessId, packageId: null });
});

it.each([
  [{ packageId }, "invalid_request"],
  [{ businessId, packageId: "front-desk" }, "invalid_package"],
  [{ businessId }, "invalid_package"],
])("answers %j with 400 before changing anything", async (body, code) => {
  const response = await put(body);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code });
  expect(fixture.set).not.toHaveBeenCalled();
});

it("passes a refusal on, such as a business that already pays", async () => {
  fixture.set.mockRejectedValue(Object.assign(new Error("This business pays for its package through Stripe."), { status: 409, code: "subscription_active" }));
  const response = await put({ businessId, packageId: null });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "subscription_active" });
});
