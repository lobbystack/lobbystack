import { describe, expect, it } from "vitest";

import { PARTNER_MAX_SIMULTANEOUS_CALLS, partnerMaxSimultaneousCalls, poolChangeFor, poolLeft, poolOverageFor, poolSpendCents, type PoolMonth, type PoolState, type PoolTerms } from "./partnerPool";
import { poolAlertsDue } from "./partnerPoolAlerts";

// Growth: 78,000 seconds and 5,000 chats, then 15 cents a minute and 1.5 cents a chat.
const growth: PoolTerms = { partnerId: "partner", tier: "growth", source: "tier", voiceSeconds: 78_000, chats: 5_000, overage: { enabled: true, capCents: null, rates: { voiceMinute: 15, chat: 1.5 } } };
const empty: PoolMonth = { voiceSecondsUsed: 0, voiceSecondsFinal: 0, chatsUsed: 0, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0, alertsSent: {} };

function pool(terms: Partial<PoolTerms> & { capCents?: number | null; enabled?: boolean } = {}, month: Partial<PoolMonth> = {}): PoolState {
  const { capCents, enabled, ...rest } = terms;
  return {
    partnerId: "partner",
    periodKey: "2026-10",
    terms: { ...growth, ...rest, overage: { ...growth.overage, ...(capCents !== undefined ? { capCents } : {}), ...(enabled !== undefined ? { enabled } : {}) } },
    month: { ...empty, ...month },
  };
}

describe("what a pool has left", () => {
  it("has no limit without tier billing, or with overage and no cap", () => {
    expect(poolLeft(pool({ voiceSeconds: null, chats: null }, { voiceSecondsUsed: 1e9 }), "voice_seconds")).toBe(Number.POSITIVE_INFINITY);
    expect(poolLeft(pool({}, { voiceSecondsUsed: 100_000, voiceSecondsFinal: 100_000 }), "voice_seconds")).toBe(Number.POSITIVE_INFINITY);
  });

  it("stops at what it includes with overage off", () => {
    expect(poolLeft(pool({ enabled: false }, { voiceSecondsUsed: 77_000 }), "voice_seconds")).toBe(1_000);
    expect(poolLeft(pool({ enabled: false }, { chatsUsed: 5_000 }), "chat_ai_tokens")).toBe(0);
  });

  it("adds what the cap still pays for, at the tier's rate, and counts open calls past the pool against it", () => {
    // $3 buys 1,200 seconds at 15 cents a minute, and 200 chats at 1.5 cents.
    expect(poolLeft(pool({ capCents: 300 }, { voiceSecondsUsed: 77_000, voiceSecondsFinal: 77_000 }), "voice_seconds")).toBe(1_000 + 1_200);
    expect(poolLeft(pool({ capCents: 300 }, { chatsUsed: 5_000 }), "chat_ai_tokens")).toBe(200);
    // A call holding 600 seconds past the pool will cost $1.50 if it runs that long.
    const open = pool({ capCents: 300 }, { voiceSecondsUsed: 78_600, voiceSecondsFinal: 78_000, chatsUsed: 5_000 });
    expect(poolSpendCents(open)).toBe(150);
    expect(poolLeft(open, "voice_seconds")).toBe(600);
    expect(poolLeft(open, "chat_ai_tokens")).toBe(100);
  });

  it("stops at a pool the host set, with no overage, and leaves a kind it didn't set with no limit", () => {
    const host = pool({ source: "host", tier: "free", voiceSeconds: 600, chats: null, enabled: false, capCents: null }, { voiceSecondsUsed: 500, chatsUsed: 1e6 });
    expect(poolLeft(host, "voice_seconds")).toBe(100);
    expect(poolLeft(host, "chat_ai_tokens")).toBe(Number.POSITIVE_INFINITY);
    expect(poolLeft({ ...host, month: { ...host.month, voiceSecondsUsed: 700 } }, "voice_seconds")).toBe(0);
  });

  it("has nothing left at the cap or past it", () => {
    expect(poolLeft(pool({ capCents: 150 }, { voiceSecondsUsed: 78_600, voiceSecondsFinal: 78_600, overageSpendCents: 150 }), "voice_seconds")).toBe(0);
    // An owner lowered the cap below what overage already cost.
    expect(poolLeft(pool({ capCents: 100, voiceSeconds: 100_000 }, { voiceSecondsUsed: 78_600, voiceSecondsFinal: 78_600, overageSpendCents: 150 }), "voice_seconds")).toBe(0);
  });
});

describe("the overage an event records", () => {
  it("goes to the usage that ends past the pool, priced by the event's recorded terms", () => {
    // 77,900 final seconds, then a call ends at 300: 200 past the pool, at Growth's 15 cents a minute.
    const state = pool({}, { voiceSecondsUsed: 78_200, voiceSecondsFinal: 77_900 });
    expect(poolOverageFor(state, growth, { kind: "voice_seconds", quantity: 300, previous: null })).toEqual({ quantity: 200, cents: 50 });
    // Recorded on Scale, it costs Scale's 12 cents a minute.
    const scale = { ...growth, tier: "scale" as const, overage: { ...growth.overage, rates: { voiceMinute: 12, chat: 1 } } };
    expect(poolOverageFor(state, scale, { kind: "voice_seconds", quantity: 300, previous: null })).toEqual({ quantity: 200, cents: 40 });
    // Recorded while the partner paid for no overage, it costs nothing.
    expect(poolOverageFor(state, { ...growth, overage: { ...growth.overage, enabled: false } }, { kind: "voice_seconds", quantity: 300, previous: null })).toEqual({ quantity: 0, cents: 0 });
    // A chat past the pool costs a cent and a half.
    expect(poolOverageFor(pool({}, { chatsUsed: 5_000 }), growth, { kind: "chat_ai_tokens", quantity: 1, previous: null })).toEqual({ quantity: 1, cents: 1.5 });
  });

  it("moves a final event's overage only by its own change", () => {
    // The call ended at 300 with 200 past the pool; a later count says 240.
    const state = pool({}, { voiceSecondsUsed: 78_200, voiceSecondsFinal: 78_200, overageVoiceSeconds: 200, overageSpendCents: 50 });
    const { change, overage } = poolChangeFor(state, growth, { kind: "voice_seconds", before: { quantity: 300, isFinal: true, overageQuantity: 200, overageCents: 50 }, after: { quantity: 240, isFinal: true } });
    expect(overage).toEqual({ quantity: 140, cents: 35 });
    expect(change).toEqual({ voiceSeconds: -60, voiceSecondsFinal: -60, chats: 0, overageVoiceSeconds: -60, overageChats: 0, overageSpendCents: -15 });
  });

  it("records none while a call is open, and gives back what an ended call didn't use", () => {
    const open = pool({}, { voiceSecondsUsed: 78_000, voiceSecondsFinal: 77_700 });
    expect(poolChangeFor(open, growth, { kind: "voice_seconds", before: { quantity: 300, isFinal: false, overageQuantity: 0, overageCents: 0 }, after: { quantity: 600, isFinal: false } })).toEqual({
      change: { voiceSeconds: 300, voiceSecondsFinal: 0, chats: 0, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 },
      overage: { quantity: 0, cents: 0 },
    });
    // The call reserved 600 and ended at 420: 120 past the pool.
    const ending = pool({}, { voiceSecondsUsed: 78_300, voiceSecondsFinal: 77_700 });
    expect(poolChangeFor(ending, growth, { kind: "voice_seconds", before: { quantity: 600, isFinal: false, overageQuantity: 0, overageCents: 0 }, after: { quantity: 420, isFinal: true } })).toEqual({
      change: { voiceSeconds: -180, voiceSecondsFinal: 420, chats: 0, overageVoiceSeconds: 120, overageChats: 0, overageSpendCents: 30 },
      overage: { quantity: 120, cents: 30 },
    });
  });
});

describe("the alerts a change makes due", () => {
  const none = { voiceSeconds: 0, voiceSecondsFinal: 0, chats: 0, overageVoiceSeconds: 0, overageChats: 0, overageSpendCents: 0 };

  it("counts the minutes of calls that ended, rounded as the Billing page shows them, and sends each share once", () => {
    // 1,040 of Growth's 1,300 minutes is 80%, and 1,039 minutes and a second rounds up to it.
    expect(poolAlertsDue(pool({}, { voiceSecondsFinal: 62_000 }), { ...none, voiceSecondsFinal: 341 })).toEqual([{ kind: "minutes", threshold: 80, key: "minutes:80:78000", covers: [] }]);
    expect(poolAlertsDue(pool({}, { voiceSecondsFinal: 62_000 }), { ...none, voiceSeconds: 400 })).toEqual([]);
    expect(poolAlertsDue(pool({}, { voiceSecondsFinal: 62_400, alertsSent: { "minutes:80:78000": "2026-10-20T00:00:00.000Z" } }), { ...none, voiceSecondsFinal: 60 })).toEqual([]);
  });

  it("sends only the higher share when a change reaches both, and covers the lower", () => {
    expect(poolAlertsDue(pool({}, { chatsUsed: 3_000 }), { ...none, chats: 2_000 })).toEqual([{ kind: "chats", threshold: 100, key: "chats:100:5000", covers: ["chats:80:5000"] }]);
  });

  it("measures the cap only while overage bills, keyed by the cap, so a new cap alerts again", () => {
    expect(poolAlertsDue(pool({ capCents: 1_000 }, { overageSpendCents: 700 }), { ...none, overageSpendCents: 100 })).toEqual([{ kind: "cap", threshold: 80, key: "cap:80:1000", covers: [] }]);
    expect(poolAlertsDue(pool({ capCents: 2_000 }, { overageSpendCents: 1_550, alertsSent: { "cap:80:1000": "x", "cap:100:1000": "x" } }), { ...none, overageSpendCents: 50 })).toEqual([{ kind: "cap", threshold: 80, key: "cap:80:2000", covers: [] }]);
    expect(poolAlertsDue(pool({ capCents: 1_000, enabled: false }, { overageSpendCents: 900 }), { ...none, overageSpendCents: 100 })).toEqual([]);
    expect(poolAlertsDue(pool({ capCents: null }, { overageSpendCents: 1e6 }), { ...none, overageSpendCents: 100 })).toEqual([]);
  });

  it("measures a pool the host set at its own size, with no cap to measure", () => {
    const host = pool({ source: "host", tier: "free", voiceSeconds: 600, chats: 5, enabled: false, capCents: null }, { voiceSecondsFinal: 420, overageSpendCents: 0 });
    expect(poolAlertsDue(host, { ...none, voiceSecondsFinal: 60 })).toEqual([{ kind: "minutes", threshold: 80, key: "minutes:80:600", covers: [] }]);
  });

  it("has nothing to measure while the deployment bills no tiers and the host set no pool", () => {
    expect(poolAlertsDue(pool({ voiceSeconds: null, chats: null }, { voiceSecondsFinal: 1e9, chatsUsed: 1e9 }), { ...none, voiceSecondsFinal: 60, chats: 1 })).toEqual([]);
  });
});

describe("the calls a partner's businesses may hold open at once", () => {
  it("is a constant the environment can raise or lower with a whole number", () => {
    expect(partnerMaxSimultaneousCalls({})).toBe(PARTNER_MAX_SIMULTANEOUS_CALLS);
    expect(partnerMaxSimultaneousCalls({ PARTNER_MAX_SIMULTANEOUS_CALLS: "45" })).toBe(45);
    for (const value of ["", "0", "-3", "2.5", "lots"]) expect(partnerMaxSimultaneousCalls({ PARTNER_MAX_SIMULTANEOUS_CALLS: value })).toBe(PARTNER_MAX_SIMULTANEOUS_CALLS);
  });
});
