import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ claimProspectDemo: fixture.claim }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@/lib/api-helpers", async (original) => ({ ...(await original<typeof import("@/lib/api-helpers")>()), requireApiSession: async () => ({ user: { id: "prospect" } }) }));

import { POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const claim = (body: unknown, headers: Record<string, string>) => POST(new Request("http://localhost/api/demo/claim", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  fixture.claim.mockResolvedValue({ businessId: "business", status: "claimed" });
});

it("claims a demo on the brand the proxy resolved, so a partner's demo stays on the partner's domain", async () => {
  expect((await claim({ token: "token" }, { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" })).status).toBe(200);
  expect(fixture.claim).toHaveBeenLastCalledWith({ db: "app" }, { userId: "prospect", token: "token", brand: { kind: "partner", partnerId } });
  await claim({ token: "token" }, { "x-lobbystack-brand": "host" });
  expect(fixture.claim).toHaveBeenLastCalledWith({ db: "app" }, { userId: "prospect", token: "token", brand: { kind: "host" } });
});

it("passes the domain's refusal through, such as someone on the partner's team", async () => {
  fixture.claim.mockRejectedValueOnce(Object.assign(new Error("People on the business's partner's team work in it from the partner's console, so they can't join its team."), { status: 409, code: "partner_member_not_on_team" }));
  const refused = await claim({ token: "token" }, { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "partner_member_not_on_team" });
});
