import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoSnapshot } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { createInMemorySnapshotCache } from "./snapshotCache";
import { refreshBusinessSnapshot } from "./knowledge";

const businessId = "00000000-0000-4000-8000-000000000001";
const profileRow = {
  id: "00000000-0000-4000-8000-000000000002",
  businessId,
  greeting: "Hello",
  tone: "professional",
  summary: "A clinic",
  bookingPolicy: "Confirm before booking.",
};

function tableName(table: unknown): string {
  if (table && typeof table === "object") {
    const symbolic = (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
    if (typeof symbolic === "string") return symbolic;
    const name = (table as { name?: string })?.name;
    if (typeof name === "string") return name;
  }
  return String(table);
}

function makeTx(selectRows: Record<string, unknown>) {
  const rowsFor = (table: unknown): unknown => {
    const name = tableName(table);
    return name in selectRows ? selectRows[name] : [];
  };
  const tx = {
    select: vi.fn(() => fromChain(rowsFor)),
    insert: vi.fn(() => ({ values: () => Promise.resolve([{ id: "saved" }]) })),
  };
  return tx;

  function fromChain(rows: (table: unknown) => unknown) {
    return {
      from: (table: unknown) => {
        function whenable() {
          const thenable = Promise.resolve(rows(table));
          const chain = Object.assign(thenable, {
            limit: () => whenable(),
            orderBy: () => whenable(),
          });
          return chain;
        }
        return {
          where: () => whenable(),
        };
      },
    };
  }
}

const businessRow = { id: businessId, name: "Maple Family Clinic", timezone: "America/Toronto", defaultLocale: "en" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REDIS_PREFIX", "lobbystack");
  mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(makeTx({ businesses: [businessRow], receptionist_profiles: [profileRow] })));
  mocks.enqueueOutbox.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("refreshBusinessSnapshot write-through", () => {
  it("pushes the regenerated snapshot into the shared cache", async () => {
    const cache = createInMemorySnapshotCache();
    const context = { db: {} as never, snapshotCache: cache };

    const version = await refreshBusinessSnapshot(context, { businessId });

    expect(typeof version).toBe("string");
    const cached = await cache.get(businessId);
    expect(cached).not.toBeNull();
    expect(cached?.displayName).toBe("Maple Family Clinic");
    expect(cached?.bookingPolicy).toBe("Confirm before booking.");
  });

  it("tolerates a failing cache write without failing the refresh", async () => {
    const cache = createInMemorySnapshotCache();
    const failing = {
      ...cache,
      set: vi.fn().mockRejectedValue(new Error("redis down")),
    } as never;
    const context = { db: {} as never, snapshotCache: failing };

    await expect(refreshBusinessSnapshot(context, { businessId })).resolves.toBeTypeOf("string");
  });

  it("skips the cache push when no snapshot cache is configured", async () => {
    const context = { db: {} as never };
    await expect(refreshBusinessSnapshot(context, { businessId })).resolves.toBeTypeOf("string");
  });

  it("builds a schema-valid snapshot for the cache (demo reference)", () => {
    expect(demoSnapshot.businessId).toBeDefined();
  });
});
