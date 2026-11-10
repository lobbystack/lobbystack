import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ openings: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ findRescheduleOpenings: fixture.openings }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const appointmentId = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const openings = (date: string, id = appointmentId) => GET(
  new Request(`http://localhost:3010/api/appointments/${id}/openings?businessId=business_1&date=${date}`),
  { params: Promise.resolve({ appointmentId: id }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.openings.mockResolvedValue({ timezone: "America/Toronto", openings: ["2026-10-14T10:00:00.000-04:00"] });
});

describe("operator appointment openings API", () => {
  it("lists the open times for the day", async () => {
    const response = await openings("2026-10-14");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ timezone: "America/Toronto", openings: ["2026-10-14T10:00:00.000-04:00"] });
    expect(fixture.openings).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", appointmentId, date: "2026-10-14" });
  });

  it("rejects a malformed id or day", async () => {
    expect((await openings("2026-10-14", "nope")).status).toBe(400);
    expect((await openings("Oct 14")).status).toBe(400);
    expect(fixture.openings).not.toHaveBeenCalled();
  });
});
