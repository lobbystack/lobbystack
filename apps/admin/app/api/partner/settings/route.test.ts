import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerSettings: fixture.read, savePartnerSettings: fixture.save }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, PATCH } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const otherPartnerId = "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };

function patch(body: unknown, query = `?partnerId=${partnerId}`): Promise<Response> {
  return PATCH(new Request(`http://localhost:3000/api/partner/settings${query}`, { method: "PATCH", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.read.mockResolvedValue({ role: "admin", telemetryEnabled: true });
  fixture.save.mockImplementation(async (_domain, _actor, input: { telemetryEnabled: boolean }) => ({ role: "admin", ...input }));
});

it("reads the partner's settings as the signed-in person, with the mode the server runs in for browser telemetry", async () => {
  vi.stubEnv("DEPLOYMENT_MODE", "cloud");
  const response = await GET(new Request(`http://localhost:3000/api/partner/settings?partnerId=${partnerId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ role: "admin", telemetryEnabled: true, deploymentMode: "cloud" });
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.read).toHaveBeenCalledWith(expect.anything(), actor);
});

it("acts only on the host's partner on a partner's host, and answers someone off the team with 404", async () => {
  const headers = { "x-lobbystack-brand": `partner:${otherPartnerId}`, "x-lobbystack-brand-origin": "https://other.portal.example.test" };
  expect((await GET(new Request(`http://localhost:3000/api/partner/settings?partnerId=${partnerId}`, { headers }))).status).toBe(404);
  expect(fixture.resolve).not.toHaveBeenCalled();
  fixture.resolve.mockRejectedValueOnce(Object.assign(new Error("Partner not found."), { status: 404, code: "partner_not_found" }));
  expect((await patch({ telemetryEnabled: false })).status).toBe(404);
  expect((await patch({ telemetryEnabled: false }, "")).status).toBe(400);
  expect(fixture.save).not.toHaveBeenCalled();
});

it("turns telemetry off and on for the partner", async () => {
  const off = await patch({ telemetryEnabled: false });
  expect(off.status).toBe(200);
  expect(await off.json()).toEqual({ role: "admin", telemetryEnabled: false });
  expect(fixture.save).toHaveBeenLastCalledWith(expect.anything(), actor, { telemetryEnabled: false });
  await patch({ telemetryEnabled: true });
  expect(fixture.save).toHaveBeenLastCalledWith(expect.anything(), actor, { telemetryEnabled: true });
});

it.each([["no setting", {}], ["a setting that isn't a boolean", { telemetryEnabled: "false" }]])("answers %s with 400 before saving", async (_case, body) => {
  const response = await patch(body);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "invalid_request" });
  expect(fixture.save).not.toHaveBeenCalled();
});

it("passes the domain's refusal of a member through", async () => {
  fixture.save.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can change the partner's settings."), { status: 403, code: "forbidden" }));
  const response = await patch({ telemetryEnabled: false });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "forbidden" });
});
