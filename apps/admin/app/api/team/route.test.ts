import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ invite: vi.fn(), remove: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/fixed-window-limit", () => ({ enforceFixedWindow: async () => ({ allowed: true }), fixedWindowLimit: () => ({}) }));
vi.mock("@lobbystack/domain", () => ({ inviteMember: fixture.invite, removeMember: fixture.remove, revokeInvitation: fixture.revoke }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); resetFakeOperator(); });

it.each([
  [{ role: "viewer" }, "email is required."],
  [{ email: "ann@example.com", role: "business_owner" }, "role is invalid."],
])("answers bad invitation input %j with 400 instead of a server error", async (body, error) => {
  const response = await POST(new Request("http://localhost:3000/api/team", { method: "POST", body: JSON.stringify(body) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error });
  expect(fixture.invite).not.toHaveBeenCalled();
});

it("answers a member id that isn't a UUID with 400", async () => {
  const response = await DELETE(new Request("http://localhost:3000/api/team", { method: "DELETE", body: JSON.stringify({ membershipId: "abc" }) }));
  expect(response.status).toBe(400);
  expect(fixture.remove).not.toHaveBeenCalled();
});
