import { beforeEach, describe, expect, it, vi } from "vitest";

import { appointments, businesses, businessHours, calendarConnections, closures, contacts, notifications, services, staff, staffServiceAssignments } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { bookAppointment } from "./booking";

type TransactionConfig = {
  staffRows?: unknown[];
  assignments?: unknown[];
  assignmentsAfterLock?: unknown[];
  connections?: unknown[];
  hours?: unknown[];
};

function createRecordingTransaction(config: TransactionConfig = {}) {
  const fromCounts = new Map<unknown, number>();
  const insertCounts = new Map<unknown, number>();
  let selectCount = 0;
  let notificationSeq = 0;
  const executeCalls: unknown[] = [];

  const rowsFor = (table: unknown): unknown[] => {
    if (table === services) return [{ id: "svc-1", name: "General Checkup", durationMinutes: 30 }];
    if (table === businesses) return [{ timezone: "UTC" }];
    if (table === staff) return config.staffRows ?? [{ id: "staff-1" }, { id: "staff-2" }, { id: "staff-3" }];
    if (table === staffServiceAssignments) return executeCalls.length && config.assignmentsAfterLock
      ? config.assignmentsAfterLock
      : config.assignments ?? [];
    if (table === calendarConnections) return config.connections ?? [];
    if (table === businessHours) return config.hours ?? [{ dayOfWeek: 1, openMinutes: 0, closeMinutes: 1440 }];
    return [];
  };

  const thenable = (resolve: () => unknown[]) => {
    const node: Record<string, unknown> = {};
    const self = () => node;
    node.from = (table: unknown) => {
      fromCounts.set(table, (fromCounts.get(table) ?? 0) + 1);
      return thenable(() => rowsFor(table));
    };
    for (const method of ["where", "limit", "orderBy", "set", "values", "returning", "onConflictDoNothing", "innerJoin", "leftJoin", "for"]) node[method] = self;
    node.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
    return node;
  };

  const tx = {
    select: () => { selectCount += 1; return thenable(() => []); },
    insert: (table: unknown) => {
      insertCounts.set(table, (insertCounts.get(table) ?? 0) + 1);
      if (table === contacts) return thenable(() => [{ id: "contact-1" }]);
      if (table === appointments) return thenable(() => [{ id: "apt-1", revision: 1 }]);
      if (table === notifications) { notificationSeq += 1; return thenable(() => [{ id: `notif-${notificationSeq}` }]); }
      return thenable(() => [{ id: "row-1" }]);
    },
    update: () => thenable(() => [{ id: "row-1" }]),
    delete: () => thenable(() => [{ id: "row-1" }]),
    execute: (query: unknown) => { executeCalls.push(query); return Promise.resolve([{ pg_advisory_xact_lock: null }]); },
  };

  return { tx, fromCounts, insertCounts, selectCount: () => selectCount, executeCalls };
}

const context = { db: {} as never };
const input = {
  businessId: "biz-1",
  serviceId: "svc-1",
  startsAt: "2027-06-07T15:00:00.000Z",
  timezone: "UTC",
  contactPhone: "+14165550100",
  sourceChannel: "voice",
};

function useTransaction(config: TransactionConfig) {
  const recording = createRecordingTransaction(config);
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback(recording.tx));
  return recording;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueOutbox.mockResolvedValue(undefined);
});

describe("booking availability reference locking", () => {
  it("reloads reference data while rechecking every candidate under the advisory lock", async () => {
    const recording = useTransaction({ hours: [] });

    await expect(bookAppointment(context, input)).rejects.toThrow("No staff member is available for this service.");

    // The advisory lock is still taken for each candidate that is evaluated.
    expect(recording.executeCalls).toHaveLength(3);
    expect(recording.fromCounts.get(services)).toBe(4);
    expect(recording.fromCounts.get(businesses)).toBe(4);
    expect(recording.fromCounts.get(staff)).toBe(4);
    expect(recording.fromCounts.get(staffServiceAssignments)).toBe(4);
    expect(recording.fromCounts.get(calendarConnections)).toBe(4);
    expect(recording.fromCounts.get(businessHours)).toBe(4);
    expect(recording.fromCounts.get(closures)).toBe(4);
    expect(recording.fromCounts.get(appointments)).toBe(3);
    expect(recording.selectCount()).toBe(31);
  });

  it("rechecks conflicts after the lock and stops at the first available candidate", async () => {
    const recording = useTransaction({});

    const result = await bookAppointment(context, input);

    expect(result).toEqual({ appointmentId: "apt-1", contactId: "contact-1", staffId: "staff-1" });
    expect(recording.executeCalls).toHaveLength(1);
    expect(recording.fromCounts.get(services)).toBe(2);
    expect(recording.fromCounts.get(staff)).toBe(2);
    // One availability read plus the post-lock conflict recheck for the winner.
    expect(recording.fromCounts.get(appointments)).toBe(2);
    expect(recording.fromCounts.get(contacts)).toBe(1);
    expect(recording.insertCounts.get(notifications)).toBe(2);
  });

  it("keeps unassigned services available to every active staff member", async () => {
    const recording = useTransaction({ hours: [], assignments: [] });

    await expect(bookAppointment(context, input)).rejects.toThrow("No staff member is available for this service.");
    expect(recording.executeCalls).toHaveLength(3);
  });

  it("skips the availability read for staff that are not assigned to the service", async () => {
    const recording = useTransaction({ hours: [], assignments: [{ staffId: "staff-2" }] });

    await expect(bookAppointment(context, input)).rejects.toThrow("No staff member is available for this service.");
    // The lock set is unchanged: every active candidate is still locked.
    expect(recording.executeCalls).toHaveLength(3);
    // Only the assigned candidate reaches the staff-specific conflict read.
    expect(recording.fromCounts.get(appointments)).toBe(1);
  });

  it("honors assignment changes committed while waiting for the staff lock", async () => {
    const recording = useTransaction({ assignments: [], assignmentsAfterLock: [{ staffId: "staff-2" }] });

    const result = await bookAppointment(context, input);

    expect(result.staffId).toBe("staff-2");
    expect(recording.executeCalls).toHaveLength(2);
    expect(recording.fromCounts.get(staffServiceAssignments)).toBe(3);
  });
});
