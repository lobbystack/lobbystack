import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerPlatformKeys: fixture.list, createPartnerPlatformKey: fixture.create, revokePartnerPlatformKey: fixture.revoke }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE } from "./[platformKeyId]/route";
import { GET, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const platformKeyId = "0f8fa9d4-7a9b-4f4f-a2a6-1a5c1c4d9e22";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const record = { id: platformKeyId, name: "Zapier", prefix: "lsp_1a2b3c4d", scopes: ["business:read", "businesses:create"], createdAt: "2026-10-26T12:00:00.000Z", createdBy: null, lastUsedAt: null, revokedAt: null };
const url = (path = "", query = `?partnerId=${partnerId}`) => `http://localhost:3000/api/partner/platform-keys${path}${query}`;

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
});

it("lists the partner's keys as the signed-in person", async () => {
  fixture.list.mockResolvedValue([record]);
  const response = await GET(new Request(url()));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ keys: [record] });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.list).toHaveBeenCalledWith(expect.anything(), actor);
});

it("makes a key and returns it once", async () => {
  fixture.create.mockResolvedValue({ platformKey: record, key: "lsp_1a2b3c4d_secretsecretsecretsecretsecret12" });
  const response = await POST(new Request(url("", ""), { method: "POST", body: JSON.stringify({ partnerId, name: "Zapier", scopes: ["business:read", "businesses:create"] }) }));
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ platformKey: record, key: "lsp_1a2b3c4d_secretsecretsecretsecretsecret12" });
  expect(fixture.create).toHaveBeenCalledWith(expect.anything(), actor, { name: "Zapier", scopes: ["business:read", "businesses:create"] });
});

it("passes the domain's refusals through, such as a member making a key or a bad name", async () => {
  fixture.create.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can manage the partner's platform keys."), { status: 403, code: "forbidden" }));
  expect((await POST(new Request(url(), { method: "POST", body: JSON.stringify({ name: "Zapier", scopes: ["business:read"] }) }))).status).toBe(403);
  fixture.create.mockRejectedValueOnce(Object.assign(new Error("Name the key in 1 to 120 characters."), { status: 400, code: "invalid_name" }));
  const response = await POST(new Request(url(), { method: "POST", body: JSON.stringify({ name: 7, scopes: ["business:read"] }) }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "invalid_name" });
  expect(fixture.create).toHaveBeenLastCalledWith(expect.anything(), actor, { name: "", scopes: ["business:read"] });
});

it("revokes a key by its id", async () => {
  fixture.revoke.mockResolvedValue({ platformKey: { ...record, revokedAt: "2026-10-26T13:00:00.000Z" }, disabledWebhookEndpointIds: ["hook"] });
  const response = await DELETE(new Request(url(`/${platformKeyId}`), { method: "DELETE" }), { params: Promise.resolve({ platformKeyId }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ platformKey: { ...record, revokedAt: "2026-10-26T13:00:00.000Z" } });
  expect(fixture.revoke).toHaveBeenCalledWith(expect.anything(), actor, { platformKeyId });
});

it("answers 400 for a key id that isn't a UUID, and 404 for a key the partner doesn't have", async () => {
  expect((await DELETE(new Request(url("/abc"), { method: "DELETE" }), { params: Promise.resolve({ platformKeyId: "abc" }) })).status).toBe(400);
  expect(fixture.revoke).not.toHaveBeenCalled();
  fixture.revoke.mockRejectedValueOnce(Object.assign(new Error("Platform key not found."), { status: 404, code: "not_found" }));
  expect((await DELETE(new Request(url(`/${platformKeyId}`), { method: "DELETE" }), { params: Promise.resolve({ platformKeyId }) })).status).toBe(404);
});

it("answers someone off the partner's team with 404, and a request naming no partner with 400", async () => {
  fixture.resolve.mockRejectedValue(Object.assign(new Error("Partner not found."), { status: 404, code: "partner_not_found" }));
  expect((await GET(new Request(url()))).status).toBe(404);
  expect((await GET(new Request(url("", "")))).status).toBe(400);
  expect(fixture.list).not.toHaveBeenCalled();
});
