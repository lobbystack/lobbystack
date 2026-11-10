import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn(), tx: undefined as unknown }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), enqueueOutbox: mocks.enqueueOutbox, withBusinessTransaction: async (_db: unknown, _context: unknown, callback: (tx: unknown) => unknown) => await callback(mocks.tx) }));
vi.mock("../authz", async (original) => ({ ...(await original<typeof import("../authz")>()), requireBusinessAdmin: vi.fn() }));

import { updateContactDetails } from "./contacts";

beforeEach(() => { vi.clearAllMocks(); });

function useTransaction(result: Array<{ id: string; name: string | null; email: string | null }>, current: Array<{ id: string; name: string | null; email: string | null }> = [{ id: "contact-1", name: null, email: null }]) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updates: Array<Record<string, unknown>> = [];
  mocks.tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => current }) }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ returning: async () => result }) }; } }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { inserted.push({ table, values }); } }),
  };
  return { inserted, updates };
}

const context = { db: undefined as never };
const input = { userId: "user-1", businessId: "biz-1", contactId: "contact-1" };

describe("a dashboard contact edit", () => {
  it("records who changed which fields", async () => {
    const { inserted } = useTransaction([{ id: "contact-1", name: "Milan", email: "milan@example.com" }]);

    await expect(updateContactDetails(context, { ...input, name: "Milan", email: "milan@example.com" })).resolves.toEqual({ contactId: "contact-1", name: "Milan", email: "milan@example.com" });
    expect(inserted).toEqual([{ table: auditLogs, values: { businessId: "biz-1", actorUserId: "user-1", eventType: "contact.updated", entityType: "contact", entityId: "contact-1", payload: { fields: ["name", "email"] } } }]);
  });

  it("records nothing when the contact isn't the business's", async () => {
    const { inserted } = useTransaction([], []);

    await expect(updateContactDetails(context, { ...input, name: "Milan" })).resolves.toBeNull();
    expect(inserted).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("writes nothing, and records nothing, when every field already holds the sent value", async () => {
    const { inserted, updates } = useTransaction([{ id: "contact-1", name: "Milan", email: "milan@example.com" }], [{ id: "contact-1", name: "Milan", email: "milan@example.com" }]);

    await expect(updateContactDetails(context, { ...input, name: "Milan", email: "milan@example.com" })).resolves.toEqual({ contactId: "contact-1", name: "Milan", email: "milan@example.com" });
    expect(updates).toEqual([]);
    expect(inserted).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });
});
