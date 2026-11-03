import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), enqueue: vi.fn(), alert: vi.fn() }));
vi.mock("@lobbystack/db", async (original) => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.transaction, enqueueOutbox: mocks.enqueue }));
vi.mock("./notifications", () => ({ queueOperatorAlertInTransaction: mocks.alert }));
vi.mock("./publicApi/webhooks", () => ({ emitWebhookEventInTransaction: vi.fn() }));
vi.mock("../authz", () => ({ requireBusinessMembership: vi.fn(), requireBusinessAdmin: vi.fn() }));

import { appendMessage } from "./conversations";
import { receiveInboundSms, smsReplyBlockedReason, textReplyBlockedReason } from "./sms";
import { businessSmsNumber } from "./smsSender";

const context = { db: {} as never };
const businessId = "business-1";
/** Rows the fake transaction hands out, one list per `.limit()` call, in order. */
let selects: unknown[][];
let orderBys: SQL[][];
let wheres: SQL[];
/** Rows the fake transaction inserted, in order. */
let inserts: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.stubEnv("CONTENT_RETENTION_ENABLED", "false");
  vi.stubEnv("BRAND_APP_NAME", "");
  selects = []; orderBys = []; wheres = []; inserts = [];
  const chain = {
    from: () => chain, innerJoin: () => chain, where: (condition: SQL) => { wheres.push(condition); return chain; },
    orderBy: (...columns: SQL[]) => { orderBys.push(columns); return chain; },
    limit: async () => selects.shift() ?? [],
  };
  const tx = {
    select: () => chain,
    insert: () => ({ values: (row: Record<string, unknown>) => { inserts.push(row); const inserted = { onConflictDoNothing: () => inserted, returning: async () => [{ id: "created-1" }] }; return inserted; } }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  };
  mocks.transaction.mockImplementation(async (_db, _scope, run) => run(tx));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("new text alerts", () => {
  const receive = async (body: string, contact: { smsConsentStatus?: string | null; operatorBlockedAt?: Date | null } = {}) => {
    // The contact, the number's agent, then the open conversation and its session.
    selects = [[{ id: "contact-1", smsConsentStatus: null, operatorBlockedAt: null, ...contact }], [{ agentId: "agent-1" }], [{ id: "conversation-1", automationState: "ai_active" }], [{ id: "session-1" }]];
    await receiveInboundSms(context, { businessId, providerMessageId: `SM${Math.random()}`, from: "+14165550123", to: "+14165550100", body, payload: {} });
  };

  it("alerts on a text from a customer who opted out", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01T10:05:00Z"));
    await receive("I need to cancel tomorrow", { smsConsentStatus: "opted_out" });
    expect(mocks.alert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventKind: "pausedSms", eventKey: "pausedSms:conversation-1:2030-01-01T10" }));
  });

  it.each(["STOP", "START", "HELP"])("doesn't alert on %s", async (body) => {
    await receive(body, { smsConsentStatus: "subscribed" });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("doesn't alert on a contact the operator blocked", async () => {
    await receive("Are you open Saturday?", { operatorBlockedAt: new Date() });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("alerts once per conversation each hour", async () => {
    vi.useFakeTimers();
    for (const now of ["2030-01-01T10:05:00Z", "2030-01-01T10:55:00Z", "2030-01-01T11:01:00Z"]) {
      vi.setSystemTime(new Date(now));
      await receive("Are you open Saturday?");
    }
    // The alert's unique event key drops the second text's alert.
    expect(mocks.alert.mock.calls.map(([, alert]) => alert.eventKey)).toEqual(["pausedSms:conversation-1:2030-01-01T10", "pausedSms:conversation-1:2030-01-01T10", "pausedSms:conversation-1:2030-01-01T11"]);
  });
});

describe("HELP and START replies", () => {
  const reply = async (body: string, branding: unknown[]) => {
    // The contact, the number's agent, the open conversation and its session, the business, then the saved branding.
    selects = [[{ id: "contact-1", smsConsentStatus: "subscribed", operatorBlockedAt: null }], [{ agentId: "agent-1" }], [{ id: "conversation-1", automationState: "ai_active" }], [{ id: "session-1" }], [{ name: "Axum Barbershop" }], branding];
    await receiveInboundSms(context, { businessId, providerMessageId: `SM${Math.random()}`, from: "+14165550123", to: "+14165550100", body, payload: {} });
    return inserts.find((row) => row.providerStatus === "compliance_reply")?.body;
  };

  it("names LobbyStack and the business when the deployment has no name of its own", async () => {
    expect(await reply("HELP", [])).toBe("LobbyStack sends appointment texts for Axum Barbershop. For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.");
  });

  it("names the deployment its first owner chose", async () => {
    expect(await reply("HELP", [{ appName: "Acme Desk", logoVersion: null }])).toBe("Acme Desk sends appointment texts for Axum Barbershop. For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.");
  });

  it("prefers BRAND_APP_NAME without reading the database", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    expect(await reply("HELP", [{ appName: "Acme Desk", logoVersion: null }])).toBe("Front Desk sends appointment texts for Axum Barbershop. For help, contact hello@lobbystack.com or visit https://lobbystack.com. Reply STOP to opt out.");
    expect(selects).toEqual([[{ appName: "Acme Desk", logoVersion: null }]]);
  });

  it("confirms the opt-in on START, naming the business", async () => {
    expect(await reply("START", [])).toBe("LobbyStack: You can get appointment texts from Axum Barbershop again. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.");
  });
});

describe("SMS replies", () => {
  const reach = { phone: "+14165550123", operatorBlockedAt: null, smsConsentStatus: null, customerTexted: false, from: "+14165550100" };

  it("lets a reply go out to a customer who texted the conversation", () => {
    expect(smsReplyBlockedReason({ ...reach, customerTexted: true })).toBeNull();
    expect(smsReplyBlockedReason({ ...reach, customerTexted: true, smsConsentStatus: "declined" })).toBeNull();
    expect(smsReplyBlockedReason({ ...reach, smsConsentStatus: "subscribed" })).toBeNull();
    expect(smsReplyBlockedReason(reach, true)).toBeNull();
  });

  it("holds a reply back from a contact who opted out, is blocked, or never texted or agreed", () => {
    expect(smsReplyBlockedReason(reach)).toBe("sms_consent");
    expect(smsReplyBlockedReason({ ...reach, customerTexted: true, smsConsentStatus: "opted_out" })).toBe("sms_consent");
    expect(smsReplyBlockedReason({ ...reach, smsConsentStatus: "subscribed", operatorBlockedAt: new Date() }, true)).toBe("sms_blocked");
    expect(smsReplyBlockedReason({ ...reach, phone: null, smsConsentStatus: "subscribed" })).toBe("sms_unreachable");
    expect(smsReplyBlockedReason({ ...reach, from: null, smsConsentStatus: "subscribed" })).toBe("no_sms_sender");
  });

  const reply = { businessId, conversationId: "conversation-1", body: "We open at 9.", direction: "outbound", channel: "sms", userId: "user-1" } as const;

  it("refuses an operator's reply the contact can't receive with 409", async () => {
    // The contact, no inbound text in the conversation, the business number.
    selects = [[{ phone: "+14165550123", operatorBlockedAt: null, smsConsentStatus: null }], [], [{ e164: "+14165550100" }]];
    await expect(appendMessage(context, reply)).rejects.toMatchObject({ status: 409, code: "sms_consent" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("queues an operator's reply to a customer who texted in", async () => {
    selects = [[{ phone: "+14165550123", operatorBlockedAt: null, smsConsentStatus: null }], [{ id: "inbound-1" }], [{ e164: "+14165550100" }], [{ id: "session-1" }]];
    await expect(appendMessage(context, reply)).resolves.toBe("created-1");
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "sms.send", payload: { messageId: "created-1" } }));
  });

  it("counts only texts sent after the contact's number or consent last changed", async () => {
    const changedAt = new Date("2030-01-01T10:00:00Z");
    // The contact whose number an API call changed, no inbound text since then, the business number.
    selects = [[{ phone: "+14165550199", operatorBlockedAt: null, smsConsentStatus: null, smsConsentUpdatedAt: changedAt }], [], [{ e164: "+14165550100" }]];
    await expect(appendMessage(context, reply)).rejects.toMatchObject({ status: 409, code: "sms_consent" });
    const inbound = new PgDialect().sqlToQuery(wheres[1]!);
    expect(inbound.sql).toMatch(/"messages"\."created_at" > \$\d+\)$/);
    expect(inbound.params.at(-1)).toBe(changedAt.toISOString());
  });
});

describe("the business's SMS number", () => {
  it("prefers a number that isn't being retired, then the newest", async () => {
    selects = [[{ e164: "+14165550199" }]];
    const tx = { select: () => ({ from: () => ({ where: () => ({ orderBy: (...columns: SQL[]) => { orderBys.push(columns); return { limit: async () => selects.shift() }; } }) }) }) };
    await expect(businessSmsNumber(tx as never, businessId)).resolves.toBe("+14165550199");
    expect(new PgDialect().sqlToQuery(sql.join(orderBys[0]!, sql`, `)).sql).toBe('"phone_numbers"."reclaim_scheduled_at" is not null, "phone_numbers"."created_at" desc');
  });
});

describe("the receptionist's text replies", () => {
  const reach = { phone: "+14165550123", operatorBlockedAt: null, smsConsentStatus: null, customerTexted: true, from: "+14165550100", textRepliesEnabled: true, selfHosted: false };
  const usNumber = "+12125550123";

  it("answers a Canadian customer who texted, with nothing asked of the business", () => {
    expect(textReplyBlockedReason(reach)).toBeNull();
    expect(textReplyBlockedReason({ ...reach, from: "+12125550100" })).toBeNull();
  });

  it("stays off until the business turns it on", () => {
    expect(textReplyBlockedReason({ ...reach, textRepliesEnabled: false })).toBe("text_replies_off");
  });

  it("keeps the rule for any text", () => {
    expect(textReplyBlockedReason({ ...reach, smsConsentStatus: "opted_out" })).toBe("sms_consent");
    expect(textReplyBlockedReason({ ...reach, operatorBlockedAt: new Date() })).toBe("sms_blocked");
  });

  it("needs registration for a US recipient, US territories included, on a cloud business", () => {
    expect(textReplyBlockedReason({ ...reach, phone: usNumber })).toBe("sms_registration_required");
    expect(textReplyBlockedReason({ ...reach, phone: "+17875550123" })).toBe("sms_registration_required");
    expect(textReplyBlockedReason({ ...reach, phone: "+16715550123" })).toBe("sms_registration_required");
    expect(textReplyBlockedReason({ ...reach, phone: usNumber, from: "+15145550100" })).toBe("sms_registration_required");
  });

  it("blocks a cloud business's sender outside +1 from US recipients too, and lets it reach everyone else", () => {
    expect(textReplyBlockedReason({ ...reach, phone: usNumber, from: "+447700900100" })).toBe("sms_registration_required");
    expect(textReplyBlockedReason({ ...reach, phone: "+447700900123", from: "+447700900100" })).toBeNull();
  });

  it("leaves a self-hosted business, which registers its own number, alone", () => {
    expect(textReplyBlockedReason({ ...reach, phone: usNumber, selfHosted: true })).toBeNull();
  });

  it("never replies from the shared number", () => {
    vi.stubEnv("TELEPHONY_ALERT_SMS_FROM", "+18445550100");
    expect(textReplyBlockedReason({ ...reach, from: "+18445550100", selfHosted: true })).toBe("shared_sender");
    vi.unstubAllEnvs();
  });

  it("doesn't change the rule for a team member's reply", () => {
    expect(smsReplyBlockedReason({ ...reach, phone: usNumber })).toBeNull();
  });
});
