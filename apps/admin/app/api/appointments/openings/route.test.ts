import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ openings: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ findBookingOpenings: fixture.openings }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const serviceId = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const staffId = "7a2d3c0f-2e3b-4d4c-8f9a-1b2c3d4e5f60";
const openings = (query: string) => GET(new Request(`http://localhost:3010/api/appointments/openings?businessId=business_1&${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.openings.mockResolvedValue({ timezone: "America/Toronto", openings: ["2026-10-14T10:00:00.000-04:00"] });
});

describe("operator booking openings API", () => {
  it("lists the open times for a service on a day", async () => {
    const response = await openings(`serviceId=${serviceId}&date=2026-10-14`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ timezone: "America/Toronto", openings: ["2026-10-14T10:00:00.000-04:00"] });
    expect(fixture.openings).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", serviceId, date: "2026-10-14" });
  });

  it("narrows to one staff member", async () => {
    await openings(`serviceId=${serviceId}&staffId=${staffId}&date=2026-10-14`);
    expect(fixture.openings).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", serviceId, staffId, date: "2026-10-14" });
  });

  it("rejects a malformed service, staff member or day", async () => {
    expect((await openings("serviceId=nope&date=2026-10-14")).status).toBe(400);
    expect((await openings(`serviceId=${serviceId}&staffId=nope&date=2026-10-14`)).status).toBe(400);
    expect((await openings(`serviceId=${serviceId}&date=Oct 14`)).status).toBe(400);
    expect(fixture.openings).not.toHaveBeenCalled();
  });

  it("returns the domain's refusal for a service that's off", async () => {
    fixture.openings.mockRejectedValue(Object.assign(new Error("Service is not available."), { status: 409, code: "service_unavailable" }));
    const response = await openings(`serviceId=${serviceId}&date=2026-10-14`);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "service_unavailable" });
  });
});
