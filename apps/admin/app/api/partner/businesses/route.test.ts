import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: () => ({}) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: "worker" }) }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ kind: "storage" }) }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerBusinesses: fixture.list, createPartnerBusiness: fixture.create, deletePartnerBusiness: fixture.remove }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, GET, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const valid = { partnerId, name: "Harbor Dental", timezone: "America/Toronto", accessLevel: "activity", ownerEmail: "owner@example.com" };
const call = (handler: (request: Request) => Promise<Response>, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost:3000/api/partner/businesses?partnerId=${partnerId}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.limit.mockResolvedValue({ allowed: true });
});

it("lists the partner's businesses for anyone on its team", async () => {
  fixture.list.mockResolvedValue([{ businessId: "business", name: "Harbor Dental" }]);
  const response = await call(GET, "GET");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ businesses: [{ businessId: "business", name: "Harbor Dental" }] });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it("creates a business at the access level the partner picked and invites its owner", async () => {
  fixture.create.mockResolvedValue({ businessId: "business", invitationId: "invitation", expiresAt: new Date("2026-11-02T00:00:00.000Z") });
  const response = await call(POST, "POST", valid);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ businessId: "business", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" });
  expect(fixture.create).toHaveBeenCalledWith(expect.anything(), actor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "service_company", accessLevel: "activity", ownerEmail: "owner@example.com", packageId: null });
});

it("sells the new business the package the partner picked", async () => {
  fixture.create.mockResolvedValue({ businessId: "business", invitationId: "invitation", expiresAt: new Date("2026-11-02T00:00:00.000Z") });
  const packageId = "0c6d6c9e-3f0a-4a51-9a3b-2a4a3c7b9d10";
  expect((await call(POST, "POST", { ...valid, packageId })).status).toBe(201);
  expect(fixture.create).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({ packageId }));
});

it("applies the template the partner picked, with the worker's context and storage", async () => {
  fixture.create.mockResolvedValue({ businessId: "business", invitationId: "invitation", expiresAt: new Date("2026-11-02T00:00:00.000Z") });
  const templateId = "1e6c2f4a-8b3d-4c7e-9f10-2a3b4c5d6e7f";
  expect((await call(POST, "POST", { ...valid, templateId })).status).toBe(201);
  expect(fixture.create).toHaveBeenCalledWith(expect.anything(), actor, { name: "Harbor Dental", timezone: "America/Toronto", businessType: "service_company", accessLevel: "activity", ownerEmail: "owner@example.com", packageId: null, templateId }, { worker: { db: "worker" }, storage: { kind: "storage" } });

  fixture.create.mockRejectedValueOnce(Object.assign(new Error("The template couldn't set up the business, so it wasn't created: x"), { status: 409, code: "template_failed" }));
  const failed = await call(POST, "POST", { ...valid, templateId });
  expect(failed.status).toBe(409);
  expect(await failed.json()).toMatchObject({ code: "template_failed" });
});

it("sells a package and applies a template to the same new business", async () => {
  fixture.create.mockResolvedValue({ businessId: "business", invitationId: "invitation", expiresAt: new Date("2026-11-02T00:00:00.000Z") });
  const packageId = "0c6d6c9e-3f0a-4a51-9a3b-2a4a3c7b9d10";
  const templateId = "1e6c2f4a-8b3d-4c7e-9f10-2a3b4c5d6e7f";
  expect((await call(POST, "POST", { ...valid, packageId, templateId })).status).toBe(201);
  expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ stripeConnect: null }), actor, expect.objectContaining({ packageId, templateId }), { worker: { db: "worker" }, storage: { kind: "storage" } });
});

it.each([
  [{ templateId: "dental" }, "invalid_template"],
  [{ name: " " }, "invalid_name"],
  [{ timezone: undefined }, "invalid_timezone"],
  [{ accessLevel: 3 }, "invalid_access_level"],
  [{ ownerEmail: "" }, "invalid_email"],
  [{ businessType: 7 }, "invalid_business_type"],
  [{ packageId: 7 }, "invalid_package"],
])("answers bad input %j with 400 before creating anything", async (change, code) => {
  const response = await call(POST, "POST", { ...valid, ...change });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code });
  expect(fixture.create).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as a member creating one or a partner with no domain", async () => {
  fixture.create.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can create the partner's businesses."), { status: 403, code: "forbidden" }));
  expect((await call(POST, "POST", valid)).status).toBe(403);
  fixture.create.mockRejectedValueOnce(Object.assign(new Error("You need your own domain before you can create a business."), { status: 409, code: "partner_domain_required" }));
  const response = await call(POST, "POST", valid);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "partner_domain_required" });
});

it("caps how many businesses one account creates, since each sends an invitation", async () => {
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
  const response = await call(POST, "POST", valid);
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: "rate_limited" });
  expect(fixture.create).not.toHaveBeenCalled();
});

it("acts only on the partner whose host the request came in on", async () => {
  const response = await call(POST, "POST", valid, { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(response.status).toBe(404);
  expect(fixture.resolve).not.toHaveBeenCalled();
  expect(fixture.create).not.toHaveBeenCalled();
});

it("deletes a business through the partner operation, which checks the actor's role", async () => {
  fakeOperator.businessId = "7c2e8d54-45b6-4b9f-8b54-7d2a9e6a2d22";
  fixture.remove.mockResolvedValue(undefined);
  const response = await call(DELETE, "DELETE", { partnerId, businessId: fakeOperator.businessId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), actor, { businessId: fakeOperator.businessId });

  fixture.remove.mockRejectedValueOnce(Object.assign(new Error("The business's phone number is still being set up. Try again in a few minutes."), { status: 409, code: "business_number_in_progress" }));
  const holding = await call(DELETE, "DELETE", { partnerId, businessId: fakeOperator.businessId });
  expect(holding.status).toBe(409);
  expect(await holding.json()).toMatchObject({ code: "business_number_in_progress" });
});

it("needs a business to delete", async () => {
  fakeOperator.businessId = undefined as unknown as string;
  const response = await call(DELETE, "DELETE", { partnerId });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "business_required" });
  expect(fixture.remove).not.toHaveBeenCalled();
});
