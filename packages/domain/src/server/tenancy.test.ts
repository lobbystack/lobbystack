import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import { businesses, closures, staff } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn(), tx: undefined as unknown }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), enqueueOutbox: mocks.enqueueOutbox, withBusinessTransaction: async (_db: unknown, _context: unknown, callback: (tx: unknown) => unknown) => await callback(mocks.tx) }));
vi.mock("../authz", async (original) => ({ ...(await original<typeof import("../authz")>()), requireBusinessAdmin: vi.fn() }));

import { createBusiness, ianaTimeZone, inviteMember, updateBusiness, updateBusinessInTransaction } from "./tenancy";

beforeEach(() => { vi.clearAllMocks(); });

it.each(["", " ", "!!!", "a", "a".repeat(121)])("rejects invalid normalized explicit slug %j as a client error", async slug => {
  await expect(createBusiness({ db: undefined as never }, { userId: "unused", name: "Test", slug, timezone: "UTC", businessType: "test" })).rejects.toMatchObject({ status: 400 });
});

it.each(["a@x.com, b@y.com", "a@x.com;b@y.com", "Ann <a@x.com>", "g:a@x.com", "a@x", "not-an-email"])("rejects invite email %j that is not exactly one address", async email => {
  await expect(inviteMember({ db: undefined as never }, { userId: "unused", businessId: "unused", email, role: "viewer" })).rejects.toMatchObject({ status: 400 });
});

describe("business timezone", () => {
  function useTransaction(currentZone = "America/Los_Angeles") {
    const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    mocks.tx = {
      select: () => ({ from: () => ({ where: () => ({ for: async () => [{ timezone: currentZone }] }) }) }),
      update: (table: unknown) => ({ set: (values: Record<string, unknown>) => { updates.push({ table, values }); return { where: () => ({ returning: async () => [{ id: "biz-1" }] }) }; } }),
    };
    return { updates, tx: mocks.tx as never };
  }

  it.each(["America/Vancouver", "Asia/Kolkata", "America/Argentina/Buenos_Aires", "America/Port-au-Prince", "UTC"])("accepts the IANA zone %s", zone => {
    expect(ianaTimeZone(zone)).toBe(zone);
  });

  it.each([[" UTC ", "UTC"], ["europe/london", "Europe/London"]])("names %j by its canonical zone", (zone, canonical) => {
    expect(ianaTimeZone(zone)).toBe(canonical);
  });

  it.each(["", "Mars/Olympus_Mons", "Etc/Unknown", "+05:00", "GMT+5:30", "America/Vancouver; drop", "x".repeat(81), 5, null])("rejects %j", zone => {
    expect(ianaTimeZone(zone)).toBeUndefined();
  });

  it("refuses to create a business in a zone that isn't an IANA zone", async () => {
    await expect(createBusiness({ db: undefined as never }, { userId: "unused", name: "Test", timezone: "Eastern", businessType: "test" })).rejects.toMatchObject({ status: 400, code: "invalid_timezone" });
  });

  it("saves the canonical zone for the business and its default staff member, and refreshes the snapshot", async () => {
    const { tx, updates } = useTransaction();
    await updateBusinessInTransaction(tx, { businessId: "biz-1", timezone: " europe/belgrade " });
    expect(updates).toEqual([
      { table: businesses, values: expect.objectContaining({ timezone: "Europe/Belgrade" }) },
      { table: staff, values: expect.objectContaining({ timezone: "Europe/Belgrade" }) },
      { table: closures, values: expect.objectContaining({ startsAt: expect.anything(), endsAt: expect.anything() }) },
    ]);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({ topic: "snapshot.refresh", businessId: "biz-1" }));
  });

  // Los Angeles Dec 25 00:00 is read as that wall time and saved as Dec 25 00:00 in Belgrade.
  it("keeps future closures at the local times they were entered when the zone changes", async () => {
    const { tx, updates } = useTransaction("America/Los_Angeles");
    await updateBusinessInTransaction(tx, { businessId: "biz-1", timezone: "Europe/Belgrade" });
    const { values } = updates.find((update) => update.table === closures)!;
    expect(new PgDialect().sqlToQuery(values.startsAt as SQL)).toMatchObject({ sql: `("closures"."starts_at" at time zone $1) at time zone $2`, params: ["America/Los_Angeles", "Europe/Belgrade"] });
    expect(new PgDialect().sqlToQuery(values.endsAt as SQL)).toMatchObject({ sql: `("closures"."ends_at" at time zone $1) at time zone $2`, params: ["America/Los_Angeles", "Europe/Belgrade"] });
  });

  it("leaves closures alone when the zone stays the same", async () => {
    const { tx, updates } = useTransaction("Europe/Belgrade");
    await updateBusinessInTransaction(tx, { businessId: "biz-1", timezone: "Europe/Belgrade" });
    expect(updates.map((update) => update.table)).toEqual([businesses, staff]);
  });

  it.each(["Eastern", 5])("refuses the zone %j without saving anything", async (zone) => {
    const { tx, updates } = useTransaction();
    await expect(updateBusinessInTransaction(tx, { businessId: "biz-1", timezone: zone as string })).rejects.toMatchObject({ status: 400, code: "invalid_timezone" });
    expect(updates).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("refreshes the receptionist's snapshot when the dashboard updates the business", async () => {
    const { tx } = useTransaction();
    await updateBusiness({ db: undefined as never }, { userId: "operator", businessId: "biz-1", timezone: "Europe/Belgrade" });
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({ topic: "snapshot.refresh", businessId: "biz-1", payload: { businessId: "biz-1", reason: "business_updated" } }));
  });
});

describe("business summary", () => {
  const tx = { update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: "biz-1" }] }) }) }) } as never;
  const summaryJobs = () => mocks.enqueueOutbox.mock.calls.filter(([, job]) => job.topic === "business.generateSummary");

  it.each([[{ name: "Oak Clinic" }], [{ defaultLocale: "fr" }]])("refreshes the generated summary after %j", async (fields) => {
    await updateBusinessInTransaction(tx, { businessId: "biz-1", ...fields });
    expect(summaryJobs()).toEqual([[tx, expect.objectContaining({ businessId: "biz-1", payload: { businessId: "biz-1", reason: "business_updated" } })]]);
  });

  it("keeps the summary when neither the name nor the locale changes", async () => {
    await updateBusinessInTransaction(tx, { businessId: "biz-1", websiteUrl: "https://oak.example" });
    expect(summaryJobs()).toEqual([]);
  });
});
