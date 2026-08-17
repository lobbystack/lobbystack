import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { getOrCreateWidgetConversation, loadWidgetChatHistory, registerWidgetVisitor } from "./conversations";

const businessId = "00000000-0000-4000-8000-000000000001";
const visitorId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const context = { db: {} as never };

type Row = Record<string, unknown>;

function tableName(table: unknown): string {
  if (table && typeof table === "object") {
    const symbolic = (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")];
    if (typeof symbolic === "string") return symbolic;
  }
  return String(table);
}

function makeTx(overrides: { visitor?: Row | null; conversations?: Row[]; messages?: Row[]; contacts?: Row[] } = {}) {
  const state = {
    visitor: overrides.visitor === undefined ? { id: visitorId } : overrides.visitor,
    conversations: overrides.conversations ?? [],
    messages: overrides.messages ?? [],
    contacts: overrides.contacts ?? [],
    insertedConversation: null as Row | null,
    insertedVisitor: null as Row | null,
    insertedContact: null as Row | null,
  };

  const resultsFor = (name: string): Row[] => {
    if (name === "widget_visitors") return state.visitor ? [state.visitor as Row] : [];
    if (name === "conversations") return state.conversations;
    if (name === "contacts") return state.contacts;
    if (name === "messages") return state.messages;
    return [];
  };

  function nodeResolving(value: unknown) {
    const thenable = Promise.resolve(value);
    return Object.assign(thenable, nodeMethods());
  }
  function nodeMethods() {
    return {
      from: () => nodeResolving(undefined),
      where: () => nodeResolving(undefined),
      limit: () => nodeResolving(undefined),
      orderBy: () => nodeResolving(undefined),
      select: () => nodeResolving(undefined),
      innerJoin: () => nodeResolving(undefined),
      values: () => nodeResolving(undefined),
      returning: () => nodeResolving([{ id: conversationId }]),
      onConflictDoNothing: () => nodeResolving([] as Row[]),
      onConflictDoUpdate: () => nodeResolving(undefined),
      set: () => nodeResolving(undefined),
      update: () => nodeResolving(undefined),
      insert: () => nodeResolving(undefined),
      run: () => nodeResolving(undefined),
      then: thenableThen as unknown,
    };
  }
  const thenableThen = null;

  const tx = {
    select: vi.fn(() => ({
      from: (table: unknown) => {
        const name = tableName(table);
        const rows = resultsFor(name);
        const hasOrderByLimit = name === "conversations" || name === "messages";
        const terminal = Object.assign(Promise.resolve(rows), {
          limit: () => Promise.resolve(rows),
          orderBy: () => (hasOrderByLimit ? Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) }) : Promise.resolve(rows)),
          innerJoin: (joinTable: unknown) => ({
            where: () => {
              if (tableName(joinTable) === "knowledgeDocuments") return Promise.resolve([]);
              return Promise.resolve(rows);
            },
          }),
        });
        return {
          where: () => terminal,
        };
      },
    })),
    insert: vi.fn((table: unknown) => ({
      values: (values: Row) => {
        const name = tableName(table);
        if (name === "conversations") state.insertedConversation = values;
        if (name === "widget_visitors") state.insertedVisitor = values;
        if (name === "contacts") state.insertedContact = values;
        const base = {
          onConflictDoUpdate: () => ({ run: () => Promise.resolve() }),
          onConflictDoNothing: () => Object.assign(Promise.resolve([] as Row[]), { returning: () => Promise.resolve([{ id: conversationId }]) }),
          returning: () => Promise.resolve([{ id: conversationId }]),
        };
        return Object.assign(Promise.resolve([{ id: conversationId }]), base);
      },
    })),
    update: vi.fn(() => ({
      set: () => ({ where: () => Promise.resolve() }),
    })),
  };

  return { tx, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueOutbox.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registerWidgetVisitor", () => {
  it("upserts a visitor without forcing a contact when no identity is supplied", async () => {
    const { tx, state } = makeTx({ visitor: null });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    const result = await registerWidgetVisitor(context, { businessId, visitorId, metadata: { userAgent: "Mozilla" } });

    expect(result).toEqual({ visitorId, contactId: null });
    expect(state.insertedVisitor).not.toBeNull();
    expect((state.insertedVisitor?.metadata as { userAgent?: string })?.userAgent).toBe("Mozilla");
  });

  it("creates a contact and binds it to the visitor when a lead is submitted", async () => {
    const { tx, state } = makeTx({ visitor: null, contacts: [] });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    const result = await registerWidgetVisitor(context, { businessId, visitorId, name: "Ada", email: "ada@example.com", phone: "+15145550000" });

    expect(result.contactId).not.toBeNull();
    expect(state.insertedContact).not.toBeNull();
    expect((state.insertedContact as Row).email).toBe("ada@example.com");
    expect(state.insertedVisitor?.contactId).toBe(result.contactId);
  });
});

describe("getOrCreateWidgetConversation", () => {
  it("reuses an open web_chat conversation keyed on the widget visitor", async () => {
    const { tx, state } = makeTx({ conversations: [{ id: conversationId }] });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    const result = await getOrCreateWidgetConversation(context, { businessId, widgetVisitorId: visitorId });

    expect(result).toEqual({ conversationId });
    expect(state.insertedConversation).toBeNull();
  });

  it("creates a new open web_chat conversation when none exists", async () => {
    const { tx, state } = makeTx({ conversations: [] });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    const result = await getOrCreateWidgetConversation(context, { businessId, widgetVisitorId: visitorId });

    expect(typeof result.conversationId).toBe("string");
    expect(state.insertedConversation).toMatchObject({ businessId, widgetVisitorId: visitorId, channel: "web_chat", status: "open", automationState: "ai_active" });
  });

  it("throws when the visitor has not been registered", async () => {
    const { tx } = makeTx({ visitor: null, conversations: [] });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    await expect(getOrCreateWidgetConversation(context, { businessId, widgetVisitorId: visitorId })).rejects.toThrow(/not found/i);
  });
});

describe("loadWidgetChatHistory", () => {
  it("returns the transcript ordered oldest first", async () => {
    const { tx } = makeTx({
      messages: [
        { id: "id-1", direction: "inbound", body: "Hi", createdAt: new Date("2026-01-01T00:00:00Z") },
        { id: "id-2", direction: "outbound", body: "Hello", createdAt: new Date("2026-01-01T00:00:01Z") },
      ],
    });
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(tx));

    const rows = await loadWidgetChatHistory(context, { businessId, conversationId });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ direction: "inbound", body: "Hi" });
    expect(rows[1]).toMatchObject({ direction: "outbound", body: "Hello" });
  });
});
