import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), create: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerDemos: fixture.list, createPartnerDemo: fixture.create }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "member" };
const call = (handler: (request: Request) => Promise<Response>, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost:3000/api/partner/demos?partnerId=${partnerId}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.limit.mockResolvedValue({ allowed: true });
});

it("lists the partner's demos for anyone on its team", async () => {
  fixture.list.mockResolvedValue([{ demoId: "demo", businessName: "Harbor Dental" }]);
  const response = await call(GET, "GET");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ demos: [{ demoId: "demo", businessName: "Harbor Dental" }] });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it("makes a demo at the access level the console sends, passing only what a demo takes", async () => {
  fixture.create.mockResolvedValue({ demoId: "demo", businessId: "business", token: "token", url: "https://bright.portal.example.test/demo#prospect_demo_token=token", status: "preparing", accessLevel: "activity" });
  const response = await call(POST, "POST", { partnerId, name: "Harbor Dental", websiteUrl: "https://harbor.example", greeting: "", locale: "en", suggestedPrompts: ["Hours?", "Prices?"], accessLevel: "activity", operatorUserId: "someone-else" });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ demoId: "demo", url: "https://bright.portal.example.test/demo#prospect_demo_token=token" });
  expect(fixture.create).toHaveBeenCalledWith(expect.anything(), actor, { name: "Harbor Dental", websiteUrl: "https://harbor.example", accessLevel: "activity", locale: "en", greeting: "", suggestedPrompts: ["Hours?", "Prices?"] });
});

it("needs a name and a website before it makes anything, and caps how many one account makes", async () => {
  expect(await (await call(POST, "POST", { partnerId, name: " ", websiteUrl: "https://harbor.example" })).json()).toMatchObject({ code: "invalid_name" });
  expect(await (await call(POST, "POST", { partnerId, name: "Harbor Dental" })).json()).toMatchObject({ code: "invalid_website_url" });
  expect(await (await call(POST, "POST", { partnerId, name: "Harbor Dental", websiteUrl: "https://harbor.example", accessLevel: 1 })).json()).toMatchObject({ code: "invalid_access_level" });
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
  const limited = await call(POST, "POST", { partnerId, name: "Harbor Dental", websiteUrl: "https://harbor.example" });
  expect(limited.status).toBe(429);
  expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  expect(fixture.create).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as a partner without a domain", async () => {
  fixture.create.mockRejectedValueOnce(Object.assign(new Error("You need your own domain before you can make a demo."), { status: 409, code: "partner_domain_required" }));
  const refused = await call(POST, "POST", { partnerId, name: "Harbor Dental", websiteUrl: "https://harbor.example" });
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "partner_domain_required" });
});

it("acts only on the partner of the host the request came from", async () => {
  const response = await call(GET, "GET", undefined, { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://acme.portal.example.test" });
  expect(response.status).toBe(404);
  expect(fixture.list).not.toHaveBeenCalled();
});
