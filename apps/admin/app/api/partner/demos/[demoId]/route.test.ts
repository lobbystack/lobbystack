import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), publish: vi.fn(), rotate: vi.fn(), revoke: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, publishPartnerDemo: fixture.publish, rotatePartnerDemoToken: fixture.rotate, revokePartnerDemo: fixture.revoke, deletePartnerDemo: fixture.remove }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const demoId = "7c2e8d54-45b6-4b9f-8b54-7d2a9e6a2d22";
const actor = { kind: "member", partnerId, userId: "user", role: "member" };
const act = (body: Record<string, unknown>, id = demoId) =>
  POST(new Request(`http://localhost:3000/api/partner/demos/${id}`, { method: "POST", body: JSON.stringify({ partnerId, ...body }) }), { params: Promise.resolve({ demoId: id }) });
const remove = (id = demoId) =>
  DELETE(new Request(`http://localhost:3000/api/partner/demos/${id}`, { method: "DELETE", body: JSON.stringify({ partnerId }) }), { params: Promise.resolve({ demoId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
});

it("gives the demo a new link, publishes it with the link's token, and turns it off", async () => {
  fixture.rotate.mockResolvedValue({ token: "token", url: "https://bright.portal.example.test/demo#prospect_demo_token=token" });
  expect(await (await act({ action: "rotate" })).json()).toEqual({ token: "token", url: "https://bright.portal.example.test/demo#prospect_demo_token=token" });
  expect(fixture.rotate).toHaveBeenCalledWith(expect.anything(), actor, { demoId });

  fixture.publish.mockResolvedValue({ status: "active", expiresAt: "2026-11-25T12:00:00.000Z" });
  expect((await act({ action: "publish", token: "token", suggestedPrompts: ["Hours?", "Prices?"] })).status).toBe(200);
  expect(fixture.publish).toHaveBeenCalledWith(expect.anything(), actor, { demoId, token: "token", suggestedPrompts: ["Hours?", "Prices?"] });

  expect(await (await act({ action: "revoke" })).json()).toEqual({ status: "revoked" });
  expect(fixture.revoke).toHaveBeenCalledWith(expect.anything(), actor, { demoId });
});

it("refuses a malformed demo, a publish without the link's token, and an unknown action", async () => {
  expect((await act({ action: "revoke" }, "demo")).status).toBe(404);
  expect(await (await act({ action: "publish" })).json()).toMatchObject({ code: "token_required" });
  expect(await (await act({ action: "delete" })).json()).toMatchObject({ code: "invalid_action" });
  expect(fixture.publish).not.toHaveBeenCalled();
  expect(fixture.revoke).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as another partner's demo", async () => {
  fixture.revoke.mockRejectedValueOnce(Object.assign(new Error("Prospect demo not found."), { status: 404, code: "demo_not_found" }));
  const refused = await act({ action: "revoke" });
  expect(refused.status).toBe(404);
  expect(await refused.json()).toMatchObject({ code: "demo_not_found" });
});

it("deletes a closed demo, and passes on the refusal of one that's still open", async () => {
  fixture.remove.mockResolvedValueOnce(undefined);
  expect(await (await remove()).json()).toEqual({ ok: true });
  expect(fixture.remove).toHaveBeenCalledWith(expect.anything(), actor, { demoId });

  fixture.remove.mockRejectedValueOnce(Object.assign(new Error("Turn the demo off before you delete it."), { status: 409, code: "demo_open" }));
  const refused = await remove();
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "demo_open" });
  expect((await remove("demo")).status).toBe(404);
  expect(fixture.remove).toHaveBeenCalledTimes(2);
});
