import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), lifecycle: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerLifecycle: fixture.lifecycle }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const call = (query = `?partnerId=${partnerId}`, headers: Record<string, string> = {}) => GET(new Request(`http://localhost:3000/api/partner/lifecycle${query}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
});

it("reads where the partner stands for the person, whose role the partner operation checks", async () => {
  const ending = { state: "ending", tierEndedAt: "2026-11-01T00:00:00.000Z", pausesAt: "2026-12-01T00:00:00.000Z", deletesAt: "2027-01-30T00:00:00.000Z" };
  fixture.lifecycle.mockResolvedValue(ending);
  const response = await call();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ending);
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.lifecycle).toHaveBeenCalledWith(expect.anything(), actor);
});

it("answers a member with the operation's refusal", async () => {
  fixture.lifecycle.mockRejectedValue(Object.assign(new Error("Only owners and admins see where the partner's tier stands."), { status: 403, code: "forbidden" }));
  const response = await call();
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "forbidden" });
});

it("needs the partner, and on a partner's host acts only on that host's partner", async () => {
  expect((await call("")).status).toBe(400);
  const elsewhere = await call(`?partnerId=${partnerId}`, { "x-lobbystack-brand": "partner:0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  expect(elsewhere.status).toBe(404);
  expect(fixture.lifecycle).not.toHaveBeenCalled();
});
