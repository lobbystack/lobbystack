import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), open: vi.fn(), brand: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/branding", () => ({ loadPartnerBrand: fixture.brand }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, openPartnerBusiness: fixture.open }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const businessId = "7c2e8d54-45b6-4b9f-8b54-7d2a9e6a2d22";
const actor = { kind: "member", partnerId, userId: "user", role: "member" };
/** The business the signed-in request names, which the real route reads from the body. */
const fakeBusiness = (id: string | undefined) => { fakeOperator.businessId = id as string; };
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request(`http://localhost:3000/api/partner/businesses/open?partnerId=${partnerId}`, { method: "POST", headers, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.open.mockResolvedValue({ expiresAt: new Date("2026-10-26T20:00:00.000Z") });
  fixture.brand.mockResolvedValue({ kind: "partner", partnerId, origin: "https://acme.portal.example.test" });
});

it("opens the business for anyone on the partner's team and sends them to its dashboard on the partner's domain", async () => {
  fakeBusiness(businessId);
  const response = await call({ partnerId, businessId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ expiresAt: "2026-10-26T20:00:00.000Z", url: "https://acme.portal.example.test/" });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  // The open is limited to the console's own partner.
  expect(fixture.open).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId, partnerId, openedBy: { name: null } });
  expect(fixture.brand).toHaveBeenCalledWith(partnerId);
});

it("keeps the person on the partner's host when the console is open there", async () => {
  fakeBusiness(businessId);
  const response = await call({ partnerId, businessId }, { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://app.acme-agency.test" });
  expect(await response.json()).toMatchObject({ url: "https://app.acme-agency.test/" });
  expect(fixture.brand).not.toHaveBeenCalled();
});

it("needs a business, and passes the domain's refusal of another partner's business through", async () => {
  fakeBusiness(undefined);
  const missing = await call({ partnerId });
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ code: "business_required" });
  expect(fixture.open).not.toHaveBeenCalled();

  fakeBusiness(businessId);
  fixture.open.mockRejectedValueOnce(Object.assign(new Error("Business not found."), { status: 404, code: "business_not_found" }));
  const refused = await call({ partnerId, businessId });
  expect(refused.status).toBe(404);
  expect(await refused.json()).toMatchObject({ code: "business_not_found" });
});

it("acts only on the partner whose host the request came in on", async () => {
  fakeBusiness(businessId);
  const response = await call({ partnerId, businessId }, { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(response.status).toBe(404);
  expect(fixture.resolve).not.toHaveBeenCalled();
  expect(fixture.open).not.toHaveBeenCalled();
});
