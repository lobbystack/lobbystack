import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ listTimeOffBetween: fixture.list, saveTimeOff: fixture.save, deleteTimeOff: fixture.remove, MAX_APPOINTMENT_RANGE_DAYS: 45 }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, PUT } from "./[timeOffId]/route";
import { GET, POST } from "./route";

const id = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const staffId = "7a2d3c0f-2e3b-4d4c-8f9a-1b2c3d4e5f60";
const saved = { id, staffId: null, staffName: null, startsAt: new Date("2026-12-25T05:00:00Z"), endsAt: new Date("2026-12-26T05:00:00Z"), name: "Christmas Day", note: null };
const url = (path: string) => `http://localhost:3010/api/time-off${path}`;
const body = (fields: Record<string, unknown>) => ({ method: "POST", body: JSON.stringify(fields) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.save.mockResolvedValue(saved);
  fixture.remove.mockResolvedValue(true);
  fixture.list.mockResolvedValue([saved]);
});

describe("time off API", () => {
  it("lists the time off in a range as ISO times", async () => {
    const response = await GET(new Request(url("?businessId=business_1&from=2026-12-20T00:00:00.000Z&to=2026-12-27T00:00:00.000Z")));
    await expect(response.json()).resolves.toEqual({ timeOff: [{ ...saved, startsAt: "2026-12-25T05:00:00.000Z", endsAt: "2026-12-26T05:00:00.000Z" }] });
    expect((await GET(new Request(url("?businessId=business_1&from=2026-12-20T00:00:00.000Z")))).status).toBe(400);
  });

  it("adds a closure of the whole business or an employee's time off in local times", async () => {
    expect((await POST(new Request(url("?businessId=business_1"), body({ staffId: null, startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", name: "Christmas Day" })))).status).toBe(201);
    expect(fixture.save).toHaveBeenLastCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", staffId: null, startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", name: "Christmas Day", note: null });
    expect((await POST(new Request(url("?businessId=business_1"), body({ staffId, startsAt: "2026-12-24T13:00", endsAt: "2026-12-24T17:00", name: "Half day", note: "Dentist" })))).status).toBe(201);
    expect(fixture.save).toHaveBeenLastCalledWith({ db: "app" }, expect.objectContaining({ staffId, note: "Dentist" }));
  });

  it("rejects a bad employee id or times that aren't local", async () => {
    expect((await POST(new Request(url("?businessId=business_1"), body({ staffId: "nope", startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", name: "X" })))).status).toBe(400);
    expect((await POST(new Request(url("?businessId=business_1"), body({ startsAt: "2026-12-25T00:00:00Z", endsAt: "2026-12-26T00:00", name: "X" })))).status).toBe(400);
    expect(fixture.save).not.toHaveBeenCalled();
  });

  it("passes the domain's refusal through, such as an overlap or a role below admin", async () => {
    fixture.save.mockRejectedValue(Object.assign(new Error("This time off overlaps other time off."), { status: 400, code: "time_off_overlap" }));
    const response = await POST(new Request(url("?businessId=business_1"), body({ startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", name: "X" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "time_off_overlap" });
  });

  it("changes and deletes one by id", async () => {
    const params = { params: Promise.resolve({ timeOffId: id }) };
    expect((await PUT(new Request(url(`/${id}?businessId=business_1`), { method: "PUT", body: JSON.stringify({ startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", name: "Closed" }) }), params)).status).toBe(200);
    expect(fixture.save).toHaveBeenLastCalledWith({ db: "app" }, expect.objectContaining({ id, name: "Closed" }));
    expect((await DELETE(new Request(url(`/${id}?businessId=business_1`), { method: "DELETE" }), params)).status).toBe(200);
    fixture.remove.mockResolvedValue(false);
    expect((await DELETE(new Request(url(`/${id}?businessId=business_1`), { method: "DELETE" }), params)).status).toBe(404);
  });
});
