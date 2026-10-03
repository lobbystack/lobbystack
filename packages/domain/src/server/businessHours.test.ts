import { beforeEach, describe, expect, it, vi } from "vitest";

import { businesses, businessHours } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ withBusinessTransaction: vi.fn(), enqueueOutbox: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.withBusinessTransaction, enqueueOutbox: mocks.enqueueOutbox }));

import { enqueueKnowledgeDerivedRefresh, hoursSignalScore, markBusinessHoursChecked, saveGeneratedBusinessHours, selectHoursPassages } from "./businessHours";
import { replaceBusinessHoursInTransaction } from "./catalog";

type Recorded = { updates: Array<{ table: unknown; values: Record<string, unknown> }>; inserts: unknown[][]; deletes: unknown[] };

function useBusiness(state: { hoursSource: string; hours?: unknown[] }) {
  const recorded: Recorded = { updates: [], inserts: [], deletes: [] };
  const query = (rows: unknown[]) => {
    const node: Record<string, unknown> = {};
    for (const method of ["where", "limit", "orderBy", "for"]) node[method] = () => node;
    node.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
    return node;
  };
  const tx = {
    select: () => ({ from: (table: unknown) => query(table === businesses ? [{ hoursSource: state.hoursSource }] : table === businessHours ? state.hours ?? [] : []) }),
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => { recorded.updates.push({ table, values }); return query([]); } }),
    delete: (table: unknown) => { recorded.deletes.push(table); return query([]); },
    insert: () => ({ values: (rows: unknown[]) => { recorded.inserts.push(rows); return query([]); } }),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (value: unknown) => unknown) => callback(tx));
  return { recorded, tx };
}

const context = { db: {} as never };
const businessId = "biz-1";
const weekdays = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 9 * 60, closeMinutes: 20 * 60 }));

beforeEach(() => { vi.clearAllMocks(); });

describe("hours passages", () => {
  it("scores passages that state hours in Serbian, French or English", () => {
    expect(hoursSignalScore("Radno vreme: Pon-Pet 09-20h, Sub 09-15h, Ned neradni dan")).toBeGreaterThan(5);
    expect(hoursSignalScore("Horaires : lundi au vendredi de 9 h 00 à 17 h 30")).toBeGreaterThan(5);
    expect(hoursSignalScore("We're open Monday to Friday, 9am to 5pm.")).toBeGreaterThan(5);
  });

  it("ignores passages with no time, and price lists with times but no hours or days", () => {
    expect(hoursSignalScore("Opening hours vary. Call us.")).toBe(0);
    expect(hoursSignalScore("Šišanje 12.50, farbanje 45.00, feniranje 15.00")).toBe(0);
  });

  it("keeps the strongest passages first, within the token budget", () => {
    const passages = [
      { title: "Usluge", text: "Šišanje i farbanje kose za žene i muškarce." },
      { title: "Kontakt", text: "Radno vreme: Pon-Pet 09-20h, Sub 09-15h. Telefon 011 123 4567." },
      { title: "Blog", text: "Open late on Fridays until 21:00." },
    ];
    expect(selectHoursPassages(passages).map((source) => source.title)).toEqual(["Kontakt", "Blog"]);
    expect(selectHoursPassages(passages, 30).map((source) => source.title)).toEqual(["Kontakt"]);
  });
});

describe("saveGeneratedBusinessHours", () => {
  it("fills empty hours, marks them generated and refreshes the snapshot", async () => {
    const { recorded } = useBusiness({ hoursSource: "none" });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: weekdays, fingerprint: "fp" })).resolves.toBe(true);
    expect(recorded.updates).toContainEqual({ table: businesses, values: expect.objectContaining({ hoursSource: "generated", hoursFingerprint: "fp" }) });
    expect(recorded.inserts[0]).toHaveLength(5);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", payload: { businessId, reason: "hours_generated" } }));
  });

  it("replaces earlier generated hours", async () => {
    const { recorded } = useBusiness({ hoursSource: "generated", hours: [{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 900 }] });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: weekdays, fingerprint: "fp2" })).resolves.toBe(true);
    expect(recorded.deletes).toEqual([businessHours]);
    expect(recorded.inserts[0]).toHaveLength(5);
  });

  it("skips the rewrite and the snapshot refresh when generated hours didn't change", async () => {
    const { recorded } = useBusiness({ hoursSource: "generated", hours: weekdays });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: weekdays, fingerprint: "fp3" })).resolves.toBe(true);
    expect(recorded.deletes).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("never replaces hours a person set", async () => {
    const { recorded } = useBusiness({ hoursSource: "operator", hours: [{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 900 }] });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: weekdays, fingerprint: "fp" })).resolves.toBe(false);
    expect(recorded.updates).toEqual([]);
    expect(recorded.deletes).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("treats hours saved outside the dashboard and the API as a person's", async () => {
    const { recorded } = useBusiness({ hoursSource: "none", hours: [{ dayOfWeek: 1, openMinutes: 600, closeMinutes: 900 }] });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: weekdays, fingerprint: "fp" })).resolves.toBe(false);
    expect(recorded.deletes).toEqual([]);
  });

  it("rejects invalid windows before opening a transaction", async () => {
    useBusiness({ hoursSource: "none" });
    await expect(saveGeneratedBusinessHours(context, { businessId, hours: [{ dayOfWeek: 1, openMinutes: 900, closeMinutes: 600 }], fingerprint: "fp" })).rejects.toThrow("Closing time must be after opening time.");
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });

  it("records a read that found no hours without touching operator hours", async () => {
    const { recorded } = useBusiness({ hoursSource: "none" });
    await markBusinessHoursChecked(context, { businessId, fingerprint: "fp" });
    expect(recorded.updates).toEqual([{ table: businesses, values: { hoursFingerprint: "fp" } }]);
  });
});

describe("operator hours", () => {
  it("marks hours saved from the dashboard or the API as the operator's", async () => {
    const { recorded, tx } = useBusiness({ hoursSource: "generated" });
    await replaceBusinessHoursInTransaction(tx as never, { businessId, hours: [{ dayOfWeek: 1, openMinutes: 13 * 60, closeMinutes: 17 * 60 }, { dayOfWeek: 1, openMinutes: 9 * 60, closeMinutes: 12 * 60 }] });
    expect(recorded.updates[0]).toEqual({ table: businesses, values: expect.objectContaining({ hoursSource: "operator" }) });
    expect(recorded.inserts[0]).toEqual([{ businessId, dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, { businessId, dayOfWeek: 1, openMinutes: 780, closeMinutes: 1020 }]);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", payload: { businessId, reason: "hours_updated" } }));
  });

  it("rejects overlapping windows without writing", async () => {
    const { recorded, tx } = useBusiness({ hoursSource: "none" });
    await expect(replaceBusinessHoursInTransaction(tx as never, { businessId, hours: [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 780 }, { dayOfWeek: 1, openMinutes: 720, closeMinutes: 1020 }] })).rejects.toThrow("can't overlap");
    expect(recorded.updates).toEqual([]);
  });
});

describe("enqueueKnowledgeDerivedRefresh", () => {
  it("schedules the summary and the hours in the same five-minute window", async () => {
    const now = Date.UTC(2026, 9, 3, 12, 1);
    await enqueueKnowledgeDerivedRefresh({} as never, { businessId, reason: "document_indexed", now });
    const topics = mocks.enqueueOutbox.mock.calls.map(([, message]) => message as { topic: string; dedupeKey: string; availableAt: Date });
    expect(topics.map((message) => message.topic)).toEqual(["business.generateSummary", "business.extractHours"]);
    expect(topics[1]).toMatchObject({ dedupeKey: `business-hours:${businessId}:${Math.floor(now / 300_000)}`, availableAt: new Date(Date.UTC(2026, 9, 3, 12, 7)) });
  });
});
