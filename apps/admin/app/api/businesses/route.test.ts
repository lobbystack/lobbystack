import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ updateBusiness: fixture.update }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
});

describe("business settings API", () => {
  it("acts as the signed-in operator even when the body names another user or business", async () => {
    const response = await PATCH(new Request("http://localhost:3000/api/businesses?businessId=business_1", {
      method: "PATCH",
      body: JSON.stringify({ userId: "owner", businessId: "business_2", timezone: "Asia/Tokyo" }),
    }));
    expect(response.status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", timezone: "Asia/Tokyo" });
  });
});
