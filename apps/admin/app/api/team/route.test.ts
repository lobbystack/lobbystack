import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ invite: vi.fn(), remove: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  requireApiSession: async () => ({ user: { id: "user_1" } }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: async () => ({ allowed: true }), fixedWindowLimit: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ inviteMember: fixture.invite, removeMember: fixture.remove, revokeInvitation: fixture.revoke }));

import { DELETE, POST } from "./route";

const businessId = "7d1f5a52-2f0e-4a4c-9a55-0c8a4c1b2f10";

beforeEach(() => { vi.clearAllMocks(); });

it.each([
  [{ businessId: "abc", email: "ann@example.com", role: "viewer" }, "businessId must be a UUID."],
  [{ businessId, role: "viewer" }, "email is required."],
  [{ businessId, email: "ann@example.com", role: "business_owner" }, "role is invalid."],
])("answers bad invitation input %j with 400 instead of a server error", async (body, error) => {
  const response = await POST(new Request("http://localhost:3000/api/team", { method: "POST", body: JSON.stringify(body) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(fixture.invite).not.toHaveBeenCalled();
});

it("answers a member id that isn't a UUID with 400", async () => {
  const response = await DELETE(new Request(`http://localhost:3000/api/team?businessId=${businessId}`, { method: "DELETE", body: JSON.stringify({ membershipId: "abc" }) }));
  expect(response.status).toBe(400);
  expect(fixture.remove).not.toHaveBeenCalled();
});
