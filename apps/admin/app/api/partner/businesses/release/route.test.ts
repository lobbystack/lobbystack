import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, releaseBusiness: fixture.release }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const businessId = "7c2e8d54-45b6-4b9f-8b54-7d2a9e6a2d22";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
/** The business the signed-in request names, which the real route reads from the body. */
const fakeBusiness = (id: string | undefined) => { fakeOperator.businessId = id as string; };
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`http://localhost:3000/api/partner/businesses/release?partnerId=${partnerId}`, { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.release.mockResolvedValue({ ownerUserId: "owner" });
});

it("releases the business to its owner through the partner operation", async () => {
  fakeBusiness(businessId);
  const response = await call({ partnerId, businessId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.release).toHaveBeenCalledWith(expect.anything(), actor, { businessId });
});

it("needs a business, and passes the domain's refusals through", async () => {
  fakeBusiness(undefined);
  const missing = await call({ partnerId });
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ code: "business_required" });
  expect(fixture.release).not.toHaveBeenCalled();

  fakeBusiness(businessId);
  fixture.release.mockRejectedValueOnce(Object.assign(new Error("The business's owner has to accept their invitation before you can release it."), { status: 409, code: "owner_required" }));
  const waiting = await call({ partnerId, businessId });
  expect(waiting.status).toBe(409);
  expect(await waiting.json()).toMatchObject({ code: "owner_required" });
  fixture.release.mockRejectedValueOnce(Object.assign(new Error("Business not found."), { status: 404, code: "business_not_found" }));
  expect((await call({ partnerId, businessId })).status).toBe(404);
});

it("acts only on the partner whose host the request came in on", async () => {
  fakeBusiness(businessId);
  const response = await call({ partnerId, businessId }, { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(response.status).toBe(404);
  expect(fixture.resolve).not.toHaveBeenCalled();
  expect(fixture.release).not.toHaveBeenCalled();
});
