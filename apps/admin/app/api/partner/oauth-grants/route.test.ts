import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerOAuthGrants: fixture.list, revokePartnerOAuthGrant: fixture.revoke }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE } from "./[grantId]/route";
import { GET } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "member" };
const grant = { id: "grant-1", clientId: "https://claude.ai/oauth/metadata", clientName: "Claude", clientUri: null, clientDiscovery: "cimd", scopes: ["partner:read"], grantedBy: { userId: "user", name: "Ada", email: "ada@example.test" }, createdAt: "2026-10-26T12:00:00.000Z", updatedAt: null, lastUsedAt: null };
const url = (path = "", query = `?partnerId=${partnerId}`) => `http://localhost:3000/api/partner/oauth-grants${path}${query}`;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
});

it("lists the partner's agency connections the person may see", async () => {
  fixture.list.mockResolvedValue([grant]);
  const response = await GET(new Request(url()));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ grants: [grant] });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it("disconnects one, and answers 404 for one the person can't see", async () => {
  fixture.revoke.mockResolvedValueOnce(true);
  const response = await DELETE(new Request(url("/grant-1"), { method: "DELETE" }), { params: Promise.resolve({ grantId: "grant-1" }) });
  expect(response.status).toBe(200);
  expect(fixture.revoke).toHaveBeenCalledWith(expect.anything(), actor, { grantId: "grant-1" });
  fixture.revoke.mockResolvedValueOnce(false);
  expect((await DELETE(new Request(url("/other"), { method: "DELETE" }), { params: Promise.resolve({ grantId: "other" }) })).status).toBe(404);
});

it("answers someone off the partner's team with 404", async () => {
  fixture.resolve.mockRejectedValue(Object.assign(new Error("Partner not found."), { status: 404, code: "partner_not_found" }));
  expect((await GET(new Request(url()))).status).toBe(404);
  expect(fixture.list).not.toHaveBeenCalled();
});
