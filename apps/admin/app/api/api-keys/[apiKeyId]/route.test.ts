import { beforeEach, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ updateApiKey: vi.fn(), revokeApiKey: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => domain);

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { PATCH } from "./route";

const apiKeyId = "0f8fa9d4-7a9b-4f4f-a2a6-1a5c1c4d9e22";
const record = { id: apiKeyId, name: "CRM sync", prefix: "lsk_1a2b3c4d", scopes: ["calls:read"], createdAt: "2026-10-26T12:00:00.000Z", createdBy: null, lastUsedAt: null, revokedAt: null };
const patch = (id: string, body: unknown) => PATCH(new Request(`http://localhost:3000/api/api-keys/${id}?businessId=business`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ apiKeyId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
});

it("changes a key's name and scopes as the signed-in person, in their business", async () => {
  domain.updateApiKey.mockResolvedValue(record);
  const response = await patch(apiKeyId, { name: "CRM sync", scopes: ["calls:read"] });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ apiKey: record });
  expect(domain.updateApiKey).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", apiKeyId, name: "CRM sync", scopes: ["calls:read"] });
});

it("answers 400 for an id that isn't a UUID and 404 for a key the business doesn't have", async () => {
  expect((await patch("abc", { name: "x", scopes: ["calls:read"] })).status).toBe(400);
  expect(domain.updateApiKey).not.toHaveBeenCalled();
  domain.updateApiKey.mockResolvedValue(null);
  const response = await patch(apiKeyId, { name: "x", scopes: ["calls:read"] });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: "not_found" });
});

it("passes the domain's refusals through, such as a viewer, a revoked key or a missing name", async () => {
  domain.updateApiKey.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can do that."), { status: 403, code: "forbidden" }));
  expect((await patch(apiKeyId, { name: "x", scopes: ["calls:read"] })).status).toBe(403);
  domain.updateApiKey.mockRejectedValueOnce(Object.assign(new Error("A revoked key can't be changed."), { status: 409, code: "conflict" }));
  expect((await patch(apiKeyId, { name: "x", scopes: ["calls:read"] })).status).toBe(409);
  domain.updateApiKey.mockRejectedValueOnce(Object.assign(new Error("Name the key in 1 to 120 characters."), { status: 400, code: "invalid_request" }));
  expect((await patch(apiKeyId, { name: 7, scopes: ["calls:read"] })).status).toBe(400);
  expect(domain.updateApiKey).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ name: "" }));
});
