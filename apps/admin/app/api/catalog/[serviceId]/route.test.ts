import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ updateService: fixture.update }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
});

describe("service update API", () => {
  it("acts as the signed-in operator even when the body names another user, business or service", async () => {
    const response = await PATCH(
      new Request("http://localhost:3000/api/catalog/service_1?businessId=business_1", {
        method: "PATCH",
        body: JSON.stringify({ userId: "owner", businessId: "business_2", serviceId: "service_2", active: false }),
      }),
      { params: Promise.resolve({ serviceId: "service_1" }) },
    );
    expect(response.status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", serviceId: "service_1", active: false });
  });
});
