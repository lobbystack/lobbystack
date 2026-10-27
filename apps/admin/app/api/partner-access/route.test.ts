import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ listPartnerAccess: fixture.list }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.list.mockResolvedValue([{ id: "event", kind: "opened", at: new Date("2026-10-26T20:00:00.000Z"), name: "Mia", partnerName: "Acme Reception" }]);
});

it("lists the partner's visits for the business's owners and admins", async () => {
  const response = await GET(new Request("http://localhost:3000/api/partner-access?businessId=business"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ events: [expect.objectContaining({ kind: "opened", name: "Mia" })] });
  expect(fixture.list).toHaveBeenCalledWith(fakeOperator.tx, { businessId: "business" });
  expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
});
