import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerDomains: fixture.read, addPartnerCustomDomain: fixture.add, removePartnerCustomDomain: fixture.remove }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, GET, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const domains = {
  role: "admin",
  subdomain: "bright.portal.example.test",
  subdomainUrl: "https://bright.portal.example.test",
  customDomains: "available",
  custom: { hostname: "app.bright.example", status: "pending", records: [{ type: "CNAME", name: "app.bright.example", value: "edge.portal.example.test", verified: false }], errors: [], checkedAt: null, url: null },
};
const url = `http://localhost:3000/api/partner/domain?partnerId=${partnerId}`;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.read.mockResolvedValue(domains);
  fixture.add.mockResolvedValue(domains);
  fixture.remove.mockResolvedValue({ ...domains, custom: null });
});

it("reads the partner's domains as the signed-in person on the partner the request names", async () => {
  const response = await GET(new Request(url));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(domains);
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.read).toHaveBeenCalledWith(expect.anything(), actor);
});

it("adds the hostname the page sends, and refuses a request without one before reaching the partner operation", async () => {
  expect((await POST(new Request(url, { method: "POST", body: JSON.stringify({ hostname: "app.bright.example" }) }))).status).toBe(200);
  expect(fixture.add).toHaveBeenCalledWith(expect.anything(), actor, { hostname: "app.bright.example" });
  for (const body of [{}, { hostname: " " }, { hostname: 42 }]) {
    const response = await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_domain" });
  }
  expect(fixture.add).toHaveBeenCalledTimes(1);
});

it("passes on the partner operation's refusals, such as a free tier's", async () => {
  fixture.add.mockRejectedValueOnce(Object.assign(new Error("Your own domain comes with a paid tier."), { status: 403, code: "paid_tier_required" }));
  const response = await POST(new Request(url, { method: "POST", body: JSON.stringify({ hostname: "app.bright.example" }) }));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "paid_tier_required" });
});

it("removes the partner's own domain", async () => {
  const response = await DELETE(new Request(url, { method: "DELETE" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ custom: null });
  expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), actor);
});

it("acts only on the host's partner on a partner's host", async () => {
  const headers = { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://other.portal.example.test" };
  const response = await POST(new Request(url, { method: "POST", headers, body: JSON.stringify({ hostname: "app.bright.example" }) }));
  expect(response.status).toBe(404);
  expect(fixture.add).not.toHaveBeenCalled();
});
