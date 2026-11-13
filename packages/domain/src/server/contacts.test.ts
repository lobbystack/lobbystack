import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditLogs } from "@lobbystack/db";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn(), tx: undefined as unknown }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), enqueueOutbox: mocks.enqueueOutbox, withBusinessTransaction: async (_db: unknown, _context: unknown, callback: (tx: unknown) => unknown) => await callback(mocks.tx) }));
vi.mock("../authz", async (original) => ({ ...(await original<typeof import("../authz")>()), requireBusinessAdmin: vi.fn() }));

import { ContactPhoneTakenError, updateContactDetails } from "./contacts";

beforeEach(() => { vi.clearAllMocks(); });

type Row = { id: string; name: string | null; phone: string | null; email: string | null };

function useTransaction(result: Row[], current: Row[] = [{ id: "contact-1", name: null, phone: null, email: null }], taken: Array<{ id: string }> = []) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updates: Array<Record<string, unknown>> = [];
  mocks.tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Object.assign(Promise.resolve(taken), { for: async () => current }) }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => ({ returning: async () => result }) }; } }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { inserted.push({ table, values }); } }),
  };
  return { inserted, updates };
}

const context = { db: undefined as never };
const input = { userId: "user-1", businessId: "biz-1", contactId: "contact-1" };

describe("a dashboard contact edit", () => {
  it("records who changed which fields", async () => {
    const { inserted } = useTransaction([{ id: "contact-1", name: "Milan", phone: null, email: "milan@example.com" }]);

    await expect(updateContactDetails(context, { ...input, name: "Milan", email: "milan@example.com" })).resolves.toEqual({ contactId: "contact-1", name: "Milan", phone: null, email: "milan@example.com" });
    expect(inserted).toEqual([{ table: auditLogs, values: { businessId: "biz-1", actorUserId: "user-1", eventType: "contact.updated", entityType: "contact", entityId: "contact-1", payload: { fields: ["name", "email"] } } }]);
  });

  it("records nothing when the contact isn't the business's", async () => {
    const { inserted } = useTransaction([], []);

    await expect(updateContactDetails(context, { ...input, name: "Milan" })).resolves.toBeNull();
    expect(inserted).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("writes nothing, and records nothing, when every field already holds the sent value", async () => {
    const { inserted, updates } = useTransaction([{ id: "contact-1", name: "Milan", phone: null, email: "milan@example.com" }], [{ id: "contact-1", name: "Milan", phone: null, email: "milan@example.com" }]);

    await expect(updateContactDetails(context, { ...input, name: "Milan", email: "milan@example.com" })).resolves.toEqual({ contactId: "contact-1", name: "Milan", phone: null, email: "milan@example.com" });
    expect(updates).toEqual([]);
    expect(inserted).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("changes the phone, starts it without the old number's consent, and records the field", async () => {
    const { inserted, updates } = useTransaction([{ id: "contact-1", name: "Milan", phone: "+14165550101", email: null }], [{ id: "contact-1", name: "Milan", phone: "+14165550100", email: null }]);

    await expect(updateContactDetails(context, { ...input, phone: "+14165550101" })).resolves.toEqual({ contactId: "contact-1", name: "Milan", phone: "+14165550101", email: null });
    expect(updates[0]).toMatchObject({ phone: "+14165550101" });
    expect(Object.keys(updates[0]!)).toEqual(expect.arrayContaining(["smsConsentStatus", "smsConsentUpdatedAt", "smsOptInConfirmedAt"]));
    expect(inserted[0]?.values).toMatchObject({ payload: { fields: ["phone"] } });
  });

  it("refuses a phone another contact has", async () => {
    const { updates } = useTransaction([], [{ id: "contact-1", name: "Milan", phone: "+14165550100", email: null }], [{ id: "contact-2" }]);

    await expect(updateContactDetails(context, { ...input, phone: "+14165550101" })).rejects.toBeInstanceOf(ContactPhoneTakenError);
    expect(updates).toEqual([]);
  });

  it("leaves consent alone when only the name changes", async () => {
    const { updates } = useTransaction([{ id: "contact-1", name: "Mila", phone: "+14165550100", email: null }], [{ id: "contact-1", name: "Milan", phone: "+14165550100", email: null }]);

    await updateContactDetails(context, { ...input, name: "Mila" });
    expect(Object.keys(updates[0]!)).not.toContain("smsConsentStatus");
  });
});
