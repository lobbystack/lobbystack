import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), invite: vi.fn(), change: vi.fn(), remove: vi.fn(), revoke: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: fixture.limit, fixedWindowLimit: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerTeam: fixture.list, invitePartnerMember: fixture.invite, changePartnerMemberRole: fixture.change, removePartnerMember: fixture.remove, revokePartnerInvitation: fixture.revoke }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, GET, PATCH, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const memberId = "0f8fa9d4-7a9b-4f4f-a2a6-1a5c1c4d9e22";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const call = (handler: (request: Request) => Promise<Response>, method: string, body: unknown, query = `?partnerId=${partnerId}`) =>
  handler(new Request(`http://localhost:3000/api/partner/team${query}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.limit.mockResolvedValue({ allowed: true });
});

it("acts as the signed-in person on the partner the request names", async () => {
  fixture.list.mockResolvedValue({ role: "admin", members: [], invitations: [] });
  const response = await call(GET, "GET", undefined);
  expect(response.status).toBe(200);
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it.each([
  ["no partner", "", {}],
  ["a partner id that isn't a UUID", "?partnerId=acme", {}],
  ["two different partners", `?partnerId=${partnerId}`, { partnerId: memberId }],
])("answers a request naming %s with 400 before looking anything up", async (_case, query, body) => {
  const response = await call(POST, "POST", { email: "ann@example.com", role: "member", ...body }, query);
  expect(response.status).toBe(400);
  expect(fixture.resolve).not.toHaveBeenCalled();
  expect(fixture.invite).not.toHaveBeenCalled();
});

it("answers someone off the partner's team with 404", async () => {
  fixture.resolve.mockRejectedValue(Object.assign(new Error("Partner not found."), { status: 404, code: "partner_not_found" }));
  const response = await call(POST, "POST", { partnerId, email: "ann@example.com", role: "member" });
  expect(response.status).toBe(404);
  expect(fixture.invite).not.toHaveBeenCalled();
});

it.each([
  [{ role: "member" }, "email is required."],
  [{ email: "ann@example.com", role: "business_admin" }, "role is invalid."],
])("answers bad invitation input %j with 400", async (input, error) => {
  const response = await call(POST, "POST", { partnerId, ...input });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(fixture.invite).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as a member inviting or an admin granting the owner role", async () => {
  fixture.invite.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can manage the team."), { status: 403, code: "forbidden" }));
  expect((await call(POST, "POST", { partnerId, email: "ann@example.com", role: "member" })).status).toBe(403);
  fixture.change.mockRejectedValueOnce(Object.assign(new Error("Only owners can make someone an owner or change an owner's role."), { status: 403, code: "owner_only" }));
  const response = await call(PATCH, "PATCH", { partnerId, memberId, role: "owner" });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "owner_only" });
  fixture.remove.mockRejectedValueOnce(Object.assign(new Error("A partner always keeps at least one owner."), { status: 409, code: "final_owner" }));
  expect((await call(DELETE, "DELETE", { partnerId, memberId })).status).toBe(409);
});

it("caps how many invitations one account sends", async () => {
  fixture.limit.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_user_hour" });
  const response = await call(POST, "POST", { partnerId, email: "ann@example.com", role: "member" });
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: "rate_limited" });
  expect(fixture.invite).not.toHaveBeenCalled();
});

it("invites, changes roles, removes and revokes through the partner operations", async () => {
  fixture.invite.mockResolvedValue({ invitationId: "invitation", expiresAt: new Date(0) });
  expect((await call(POST, "POST", { partnerId, email: "ann@example.com", role: "owner" })).status).toBe(201);
  expect(fixture.invite).toHaveBeenCalledWith(expect.anything(), actor, { email: "ann@example.com", role: "owner" });
  expect((await call(PATCH, "PATCH", { partnerId, memberId, role: "member" })).status).toBe(200);
  expect(fixture.change).toHaveBeenCalledWith(expect.anything(), actor, { memberId, role: "member" });
  expect((await call(DELETE, "DELETE", { partnerId, memberId })).status).toBe(200);
  expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), actor, { memberId });
  expect((await call(DELETE, "DELETE", { partnerId, invitationId: memberId })).status).toBe(200);
  expect(fixture.revoke).toHaveBeenCalledWith(expect.anything(), actor, { invitationId: memberId });
});

it.each([
  [PATCH, "PATCH", { memberId: "abc", role: "member" }],
  [PATCH, "PATCH", { memberId, role: "boss" }],
  [DELETE, "DELETE", {}],
  [DELETE, "DELETE", { memberId: "abc" }],
] as const)("answers a bad %s body with 400", async (handler, method, input) => {
  const response = await call(handler, method, { partnerId, ...input });
  expect(response.status).toBe(400);
  expect(fixture.change).not.toHaveBeenCalled();
  expect(fixture.remove).not.toHaveBeenCalled();
  expect(fixture.revoke).not.toHaveBeenCalled();
});
