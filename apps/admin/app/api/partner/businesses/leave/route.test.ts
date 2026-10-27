import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ leave: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ leavePartnerBusiness: fixture.leave }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

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
  expect(fixture.leave).toHaveBeenCalledWith(expect.anything(), { userId: "user", businessId: "business" });
});

it("needs a business", async () => {
  fakeOperator.businessId = undefined as unknown as string;
  const response = await POST(new Request("http://localhost:3000/api/partner/businesses/leave", { method: "POST", body: "{}" }));
  expect(response.status).toBe(400);
  expect(fixture.leave).not.toHaveBeenCalled();
});
