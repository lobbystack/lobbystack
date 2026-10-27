import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ leave: vi.fn(), current: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ leavePartnerBusiness: fixture.leave, currentPartnerOpen: fixture.current }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.leave.mockResolvedValue({ left: true });
});

it("ends the person's own open of the business they name", async () => {
  fakeOperator.businessId = "business";
  const response = await POST(new Request("http://localhost:3000/api/partner/businesses/leave", { method: "POST", body: JSON.stringify({ businessId: "business" }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ left: true });
  expect(fixture.leave).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", openedAt: undefined });
});

it("ends only the open that began when the tab says, and says when the running one began", async () => {
  fakeOperator.businessId = "business";
  fixture.current.mockResolvedValue({ openedAt: new Date("2026-10-26T20:00:00.000Z") });
  expect(await (await GET(new Request("http://localhost:3000/api/partner/businesses/leave?businessId=business"))).json()).toEqual({ openedAt: "2026-10-26T20:00:00.000Z" });
  await POST(new Request("http://localhost:3000/api/partner/businesses/leave", { method: "POST", body: JSON.stringify({ businessId: "business", openedAt: "2026-10-26T20:00:00.000Z" }) }));
  expect(fixture.leave).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business", openedAt: new Date("2026-10-26T20:00:00.000Z") });
  expect((await POST(new Request("http://localhost:3000/api/partner/businesses/leave", { method: "POST", body: JSON.stringify({ businessId: "business", openedAt: "soon" }) }))).status).toBe(400);
});

it("needs a business", async () => {
  fakeOperator.businessId = undefined as unknown as string;
  const response = await POST(new Request("http://localhost:3000/api/partner/businesses/leave", { method: "POST", body: "{}" }));
  expect(response.status).toBe(400);
  expect(fixture.leave).not.toHaveBeenCalled();
});
