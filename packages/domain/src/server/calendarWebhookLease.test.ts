import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), withBusinessTransaction: mocks.transaction }));

import { registerCalendarWebhookOnce } from "./calendar";

// One connection row, with the two conditional updates the lease relies on.
type Row = { status: string; externalWebhookId: string | null; until: Date | null };
let row: Row;
let transactions = 0;
let openTransactions = 0;

function fakeDatabase(now: () => Date) {
  const tx = {
    update: () => ({ set: (values: { webhookRegistrationUntil?: Date | null; externalWebhookId?: string }) => ({ where: () => {
      const apply = () => {
        if (values.externalWebhookId !== undefined) {
          // The save: only while this sync holds the lease and the connection is live.
          if (row.until?.getTime() !== lease?.getTime() || row.status === "disconnected") return [];
          Object.assign(row, { externalWebhookId: values.externalWebhookId, until: null });
          return [{ id: "cal" }];
        }
        if (values.webhookRegistrationUntil === null) { if (row.until?.getTime() === lease?.getTime()) row.until = null; return []; }
        // The claim: no webhook yet, and no lease another sync still holds.
        if (row.status === "disconnected" || row.externalWebhookId || (row.until && row.until >= now())) return [];
        row.until = values.webhookRegistrationUntil!;
        lease = row.until;
        return [{ id: "cal" }];
      };
      // Applied once, whether the caller awaits the update or asks for the rows it returned.
      let result: Array<{ id: string }> | undefined;
      const once = () => (result ??= apply());
      return { returning: async () => once(), then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve().then(once).then(resolve, reject) };
    } }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ status: row.status, externalWebhookId: row.externalWebhookId }] }) }) }),
  };
  mocks.transaction.mockImplementation(async (_db, _scope, callback) => {
    transactions++;
    openTransactions++;
    try { return await callback(tx); } finally { openTransactions--; }
  });
}
let lease: Date | null;
const clock = () => new Date("2026-11-01T12:00:00Z");

beforeEach(() => {
  row = { status: "connected", externalWebhookId: null, until: null };
  lease = null;
  transactions = 0;
  openTransactions = 0;
});

it("calls Cal.com outside any transaction and saves the webhook it registered", async () => {
  fakeDatabase(clock);
  const register = vi.fn(async () => { expect(openTransactions).toBe(0); return { externalWebhookId: "11", encryptedWebhookSecret: "enc:secret" }; });
  await expect(registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register, discard: vi.fn() })).resolves.toBe("registered");
  expect(row).toEqual({ status: "connected", externalWebhookId: "11", until: null });
  expect(transactions).toBe(2);
});

it("lets only one of two syncs register while the lease holds", async () => {
  fakeDatabase(clock);
  let release!: () => void;
  const first = vi.fn(() => new Promise<{ externalWebhookId: string; encryptedWebhookSecret: string }>((resolve) => { release = () => resolve({ externalWebhookId: "11", encryptedWebhookSecret: "enc" }); }));
  const second = vi.fn(async () => ({ externalWebhookId: "12", encryptedWebhookSecret: "enc" }));
  const running = registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register: first, discard: vi.fn() });
  await vi.waitFor(() => expect(first).toHaveBeenCalled());
  await expect(registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register: second, discard: vi.fn() })).resolves.toBe("busy");
  release();
  await expect(running).resolves.toBe("registered");
  await expect(registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register: second, discard: vi.fn() })).resolves.toBe("exists");
  expect(second).not.toHaveBeenCalled();
});

it("removes the webhook it registered when the connection was disconnected meanwhile", async () => {
  fakeDatabase(clock);
  const discard = vi.fn(async () => undefined);
  const register = vi.fn(async () => { row.status = "disconnected"; return { externalWebhookId: "11", encryptedWebhookSecret: "enc" }; });
  await expect(registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register, discard })).resolves.toBe("disconnected");
  expect(discard).toHaveBeenCalledWith("11");
  expect(row.externalWebhookId).toBeNull();
});

it("gives the lease up when Cal.com refuses, so the next sync can try", async () => {
  fakeDatabase(clock);
  await expect(registerCalendarWebhookOnce({ db: {} as never }, { businessId: "business", connectionId: "cal", now: clock, register: async () => { throw new Error("status 403"); }, discard: vi.fn() })).rejects.toThrow("403");
  expect(row.until).toBeNull();
});
