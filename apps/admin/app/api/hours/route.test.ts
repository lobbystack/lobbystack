import { beforeEach, describe, expect, it, vi } from "vitest";

import { businesses, businessHours, receptionistProfiles } from "@lobbystack/db";

const fixture = vi.hoisted(() => ({ denied: false, transaction: vi.fn(), replace: vi.fn(), hours: [] as unknown[], hoursSource: "generated" }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  withOperatorTransaction: async (_request: Request, callback: (input: unknown) => unknown, options: unknown) => {
    fixture.transaction(options);
    if (fixture.denied) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const rows = (table: unknown) => table === businesses ? [{ timezone: "Europe/Belgrade", hoursSource: fixture.hoursSource }] : table === businessHours ? fixture.hours : table === receptionistProfiles ? [{ bookingMode: "instant" }] : [];
    const query = (table: unknown) => {
      const node: Record<string, unknown> = {};
      for (const method of ["where", "limit", "orderBy"]) node[method] = () => node;
      node.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows(table)).then(resolve);
      return node;
    };
    return callback({ businessId: "business", tx: { select: () => ({ from: query }) } });
  },
}));
vi.mock("@lobbystack/domain", () => ({
  replaceBusinessHoursInTransaction: async (_tx: unknown, input: { hours: unknown[] }) => {
    fixture.replace(input);
    if (input.hours.some((window) => (window as { closeMinutes: number; openMinutes: number }).closeMinutes <= (window as { openMinutes: number }).openMinutes)) throw new Error("Closing time must be after opening time.");
    fixture.hours = input.hours;
    fixture.hoursSource = "operator";
  },
}));

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new Request("http://localhost:3000/api/hours?businessId=business", { method: "PUT", body: JSON.stringify(body) }));
const split = [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, { dayOfWeek: 1, openMinutes: 780, closeMinutes: 1020 }];

beforeEach(() => { vi.clearAllMocks(); fixture.denied = false; fixture.hours = []; fixture.hoursSource = "generated"; });

describe("opening hours API", () => {
  it("returns the hours, who set them and the booking mode", async () => {
    fixture.hours = split;
    const response = await GET(new Request("http://localhost:3000/api/hours?businessId=business"));
    await expect(response.json()).resolves.toEqual({ timezone: "Europe/Belgrade", hoursSource: "generated", bookingMode: "instant", hours: split });
  });

  it("saves split days as the operator's hours", async () => {
    const response = await put({ hours: split });
    expect(response.status).toBe(200);
    expect(fixture.replace).toHaveBeenCalledWith({ businessId: "business", hours: split });
    await expect(response.json()).resolves.toMatchObject({ hoursSource: "operator", hours: split });
    expect(fixture.transaction).toHaveBeenCalledWith({ minimumRole: "business_admin" });
  });

  it.each([{}, { hours: "9-5" }, { hours: [{ dayOfWeek: 1 }] }, { hours: Array.from({ length: 29 }, () => split[0]) }])("rejects a malformed body %j before writing", async (body) => {
    expect((await put(body)).status).toBe(400);
    expect(fixture.replace).not.toHaveBeenCalled();
  });

  it("returns the domain's validation message", async () => {
    const response = await put({ hours: [{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 540 }] });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Closing time must be after opening time." });
  });

  it("requires administrator access to save", async () => {
    fixture.denied = true;
    expect((await put({ hours: split })).status).toBe(403);
    expect(fixture.replace).not.toHaveBeenCalled();
  });
});
