import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ readAllowanceUsageInTransaction: fixture.read }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const usage = { periodKey: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z", voiceSeconds: { used: 750, included: null, blocked: false }, chats: { used: 2, included: null, blocked: false }, overage: null };

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.read.mockResolvedValue(usage);
});

it("answers the business's minutes and chats against its allowance in the operator's transaction", async () => {
  // A partner's business gives no billing, and the route doesn't need it.
  fakeOperator.capabilities = ["activity"];
  const response = await GET(new Request("http://localhost:3000/api/usage?businessId=business"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(usage);
  expect(fixture.read).toHaveBeenCalledWith(fakeOperator.tx, { businessId: "business" });
  expect(fakeOperator.transactions).toHaveLength(1);
});

it("answers nothing to someone the business's transaction refuses", async () => {
  fakeOperator.denied = Object.assign(new Error("You do not have access to this business."), { status: 403, code: "forbidden" });
  const response = await GET(new Request("http://localhost:3000/api/usage?businessId=business"));
  expect(response.status).toBe(403);
  expect(fixture.read).not.toHaveBeenCalled();
});
