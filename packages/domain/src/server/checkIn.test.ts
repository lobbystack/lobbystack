import { randomUUID } from "node:crypto";

import { CHECK_IN_ANSWERS, checkInTokenVariable } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordProductEventInTransaction: vi.fn(), tx: undefined as unknown }));
vi.mock("./productEvents", () => ({ recordProductEventInTransaction: mocks.recordProductEventInTransaction }));
vi.mock("@lobbystack/db", async (original) => ({
  ...await original<typeof import("@lobbystack/db")>(),
  withBusinessTransaction: async (_db: unknown, _input: unknown, run: (tx: unknown) => Promise<unknown>) => await run(mocks.tx),
}));

import { CHECK_IN_LINK_LIFETIME_MS, checkInTokenVariables, readCheckInToken, recordCheckInAnswer } from "./checkIn";
import { signPayload } from "@lobbystack/providers/crypto/signedPayload";

const businessId = randomUUID();
const token = (answer: (typeof CHECK_IN_ANSWERS)[number] = "connect_number", now = Date.now()) => checkInTokenVariables(businessId, now)[checkInTokenVariable(answer)]!;

function fakeTx(input: { business?: boolean; claimed?: boolean; owner?: string | null }) {
  const chain = { from: () => chain, where: () => chain, limit: async () => input.business === false ? [] : [{ id: businessId }] };
  return { select: () => chain, insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => input.claimed === false ? [] : [{ businessId }] }) }) }), execute: async () => ({ rows: [{ owner_user_id: input.owner === undefined ? "owner_1" : input.owner }] }) };
}

describe("check-in links", () => {
  it("gives each answer its own link, which reads back as that answer", () => {
    const tokens = checkInTokenVariables(businessId);
    expect(new Set(Object.values(tokens)).size).toBe(CHECK_IN_ANSWERS.length);
    for (const answer of CHECK_IN_ANSWERS) expect(readCheckInToken(tokens[checkInTokenVariable(answer)]!)).toEqual({ businessId, answer });
  });

  it("refuses a link that was changed", () => {
    const [version, payload, signature] = token().split(".");
    const other = token("not_a_fit").split(".")[1];
    expect(readCheckInToken(`${version}.${other}.${signature}`)).toBeNull();
    expect(readCheckInToken(`${version}.${payload}.${signature!.slice(0, -1)}${signature!.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(readCheckInToken("")).toBeNull();
    expect(readCheckInToken("nonsense")).toBeNull();
  });

  it("refuses a token signed under another domain, or with another secret", () => {
    const payload = { b: businessId, a: "connect_number", e: Date.now() + 60_000 };
    expect(readCheckInToken(signPayload("development-only-check-in-key", "google-calendar:state", payload))).toBeNull();
    expect(readCheckInToken(signPayload("another-secret", "check-in:answer", payload))).toBeNull();
  });

  it("refuses a link past its lifetime", () => {
    const issuedAt = Date.now();
    expect(readCheckInToken(token("connect_number", issuedAt), issuedAt + CHECK_IN_LINK_LIFETIME_MS - 1)).not.toBeNull();
    expect(readCheckInToken(token("connect_number", issuedAt), issuedAt + CHECK_IN_LINK_LIFETIME_MS)).toBeNull();
  });
});

describe("recordCheckInAnswer", () => {
  const context = { db: {} as never };
  beforeEach(() => mocks.recordProductEventInTransaction.mockReset());

  it("reports the answer once, for the owner's person", async () => {
    mocks.tx = fakeTx({});
    await expect(recordCheckInAnswer(context, { token: token() })).resolves.toEqual({ answer: "connect_number" });
    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ name: "onboarding.check_in_answered", businessId, distinctId: expect.stringContaining("owner_1"), properties: { answer: "connect_number" } }));
  });

  it("answers a repeat confirmation the same way and reports nothing", async () => {
    mocks.tx = fakeTx({ claimed: false });
    await expect(recordCheckInAnswer(context, { token: token() })).resolves.toEqual({ answer: "connect_number" });
    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });

  it("records nothing for a bad link or a deleted business", async () => {
    mocks.tx = fakeTx({});
    await expect(recordCheckInAnswer(context, { token: `${token()}x` })).resolves.toBeNull();
    mocks.tx = fakeTx({ business: false });
    await expect(recordCheckInAnswer(context, { token: token() })).resolves.toBeNull();
    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });
});
