import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), save: vi.fn(), remove: vi.fn(), limit: vi.fn(), storage: { kind: "storage" } }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: () => ({}) }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => fixture.storage }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listBusinessTemplates: fixture.list, saveBusinessTemplate: fixture.save, deleteBusinessTemplate: fixture.remove }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, GET, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const businessId = "7c2e8d54-45b6-4b9f-8b54-7d2a9e6a2d22";
const templateId = "1e6c2f4a-8b3d-4c7e-9f10-2a3b4c5d6e7f";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const call = (handler: (request: Request) => Promise<Response>, method: string, body?: unknown) =>
  handler(new Request(`http://localhost:3000/api/partner/templates?partnerId=${partnerId}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.limit.mockResolvedValue({ allowed: true });
});

it("lists the partner's templates for anyone on its team", async () => {
  fixture.list.mockResolvedValue([{ templateId, name: "Dental" }]);
  const response = await call(GET, "GET");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ templates: [{ templateId, name: "Dental" }] });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it("saves one of the partner's businesses as a template, with storage for its documents", async () => {
  fakeOperator.businessId = businessId;
  fixture.save.mockResolvedValue({ templateId, name: "Dental", createdAt: "2026-10-26T00:00:00.000Z", template: {} });
  const response = await call(POST, "POST", { partnerId, businessId, name: "Dental" });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ templateId, name: "Dental" });
  expect(fixture.save).toHaveBeenCalledWith(expect.anything(), actor, { businessId, name: "Dental" }, { storage: fixture.storage });
});

it("needs a business and a name before it saves anything, and caps how many one account saves", async () => {
  fakeOperator.businessId = undefined as unknown as string;
  expect(await (await call(POST, "POST", { partnerId, name: "Dental" })).json()).toMatchObject({ code: "business_required" });
  fakeOperator.businessId = businessId;
  expect(await (await call(POST, "POST", { partnerId, businessId, name: " " })).json()).toMatchObject({ code: "invalid_name" });
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
  const limited = await call(POST, "POST", { partnerId, businessId, name: "Dental" });
  expect(limited.status).toBe(429);
  expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  expect(fixture.save).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as a member saving one", async () => {
  fakeOperator.businessId = businessId;
  fixture.save.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can manage the partner's templates."), { status: 403, code: "forbidden" }));
  expect((await call(POST, "POST", { partnerId, businessId, name: "Dental" })).status).toBe(403);
  fixture.save.mockRejectedValueOnce(Object.assign(new Error("A template can't hold part of this business's setup."), { status: 409, code: "template_invalid" }));
  expect(await (await call(POST, "POST", { partnerId, businessId, name: "Dental" })).json()).toMatchObject({ code: "template_invalid" });
});

it("deletes a template through the partner operation", async () => {
  fixture.remove.mockResolvedValue(undefined);
  const response = await call(DELETE, "DELETE", { partnerId, templateId });
  expect(response.status).toBe(200);
  expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), actor, { templateId });
  expect(await (await call(DELETE, "DELETE", { partnerId, templateId: "dental" })).json()).toMatchObject({ code: "template_required" });
  expect(fixture.remove).toHaveBeenCalledTimes(1);
});
