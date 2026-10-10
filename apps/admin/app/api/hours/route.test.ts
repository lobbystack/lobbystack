import { beforeEach, describe, expect, it, vi } from "vitest";

import { businesses, businessHours, closures, receptionistProfiles } from "@lobbystack/db";

const fixture = vi.hoisted(() => ({ replace: vi.fn(), failure: undefined as Error | undefined, hours: [] as unknown[], closures: [] as unknown[], hoursSource: "generated" }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({
  replaceBusinessHoursInTransaction: async (_tx: unknown, input: { hours: unknown[] }) => {
    fixture.replace(input);
    if (fixture.failure) throw fixture.failure;
    if (input.hours.some((window) => (window as { closeMinutes: number; openMinutes: number }).closeMinutes <= (window as { openMinutes: number }).openMinutes)) throw Object.assign(new Error("Closing time must be after opening time."), { status: 400 });
    fixture.hours = input.hours;
    fixture.hoursSource = "operator";
  },
}));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, PUT } from "./route";

const rows = (table: unknown) => table === businesses ? [{ timezone: "Europe/Belgrade", hoursSource: fixture.hoursSource }] : table === businessHours ? fixture.hours : table === receptionistProfiles ? [{ bookingMode: "instant" }] : table === closures ? fixture.closures : [];
const query = (table: unknown) => {
  const node: Record<string, unknown> = {};
  for (const method of ["where", "limit", "orderBy"]) node[method] = () => node;
  node.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows(table)).then(resolve);
  return node;
};

const put = (body: unknown) => PUT(new Request("http://localhost:3000/api/hours?businessId=business", { method: "PUT", body: JSON.stringify(body) }));
const split = [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, { dayOfWeek: 1, openMinutes: 780, closeMinutes: 1020 }];

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fakeOperator.tx = { select: () => ({ from: query }) };
  fixture.failure = undefined;
  fixture.hours = [];
  fixture.closures = [];
  fixture.hoursSource = "generated";
});

describe("opening hours API", () => {
  it("returns the hours, who set them and the booking mode", async () => {
    fixture.hours = split;
    const response = await GET(new Request("http://localhost:3000/api/hours?businessId=business"));
    await expect(response.json()).resolves.toEqual({ timezone: "Europe/Belgrade", hoursSource: "generated", bookingMode: "instant", hours: split, closures: [] });
  });

  it("lists closures as local times in the business's timezone", async () => {
    fixture.closures = [{ startsAt: new Date("2026-12-24T23:00:00Z"), endsAt: new Date("2026-12-25T23:00:00Z"), reason: "Christmas Day" }];
    const response = await GET(new Request("http://localhost:3000/api/hours?businessId=business"));
    await expect(response.json()).resolves.toMatchObject({ closures: [{ startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: "Christmas Day" }] });
  });

  it("passes closures to the domain with the hours", async () => {
    const christmas = { startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: "Christmas Day" };
    expect((await put({ hours: split, closures: [christmas, { startsAt: "2026-12-31T13:00", endsAt: "2027-01-01T00:00" }] })).status).toBe(200);
    expect(fixture.replace).toHaveBeenCalledWith({ businessId: "business", hours: split, closures: [christmas, { startsAt: "2026-12-31T13:00", endsAt: "2027-01-01T00:00", reason: undefined }] });
  });

  it("saves split days as the operator's hours", async () => {
    const response = await put({ hours: split });
    expect(response.status).toBe(200);
    expect(fixture.replace).toHaveBeenCalledWith({ businessId: "business", hours: split });
    await expect(response.json()).resolves.toMatchObject({ hoursSource: "operator", hours: split });
    expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
  });

  it.each([{}, { hours: "9-5" }, { hours: [{ dayOfWeek: 1 }] }, { hours: Array.from({ length: 29 }, () => split[0]) }, { hours: split, closures: "Christmas" }, { hours: split, closures: [{ startsAt: "2026-12-25T00:00" }] }, { hours: split, closures: [{ startsAt: "2026-12-25T00:00", endsAt: "2026-12-26T00:00", reason: 1 }] }])("rejects a malformed body %j before writing", async (body) => {
    expect((await put(body)).status).toBe(400);
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it("returns the domain's validation message", async () => {
    const response = await put({ hours: [{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 540 }] });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Closing time must be after opening time." });
  });

  it("reports a database failure as a 500, not as invalid hours", async () => {
    fixture.failure = new Error("deadlock detected");
    const response = await put({ hours: split });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "Request failed." });
  });

  it("requires administrator access to save", async () => {
    fakeOperator.denied = Object.assign(new Error("Forbidden"), { status: 403 });
    expect((await put({ hours: split })).status).toBe(403);
    expect(fixture.replace).not.toHaveBeenCalled();
  });
});
