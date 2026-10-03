import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withBusinessTransaction: vi.fn(),
  enqueueOutbox: vi.fn(),
  requireBusinessMembership: vi.fn(),
  resolveOperatorSmsSender: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
  enqueueOutbox: mocks.enqueueOutbox,
}));
vi.mock("../authz", () => ({ requireBusinessMembership: mocks.requireBusinessMembership }));
vi.mock("./notifications", () => ({ resolveOperatorSmsSender: mocks.resolveOperatorSmsSender }));

import {
  PHONE_VERIFICATION_CODE_TTL_MS,
  PHONE_VERIFICATION_MAX_CHECKS,
  checkOperatorPhoneVerificationCode,
  evaluatePhoneVerificationCode,
  getOperatorPhoneVerification,
  hashPhoneVerificationCode,
  issueOperatorPhoneVerificationCode,
  phoneVerificationCodeMatches,
  startOperatorPhoneVerification,
} from "./phoneVerification";

const secret = "unit-test-otp-secret";
const now = new Date("2026-10-03T12:00:00.000Z");
const context = { db: {} as never };
const scope = { userId: "user-1", businessId: "business-1" };

function chain(resolve: () => unknown[], onSet?: (values: Record<string, unknown>) => void) {
  const node: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "orderBy", "returning", "for"]) node[method] = () => node;
  node.set = (values: Record<string, unknown>) => { onSet?.(values); return node; };
  node.then = (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).then(onFulfilled, onRejected);
  return node;
}

function setup(config: { selects?: unknown[][]; updates?: unknown[][]; execute?: (query: unknown) => unknown } = {}) {
  const selects = [...(config.selects ?? [])];
  const updates = [...(config.updates ?? [])];
  const sets: Array<Record<string, unknown>> = [];
  const executed: string[] = [];
  const tx = {
    select: () => chain(() => selects.shift() ?? []),
    update: () => chain(() => updates.shift() ?? [], (values) => sets.push(values)),
    execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
      executed.push(JSON.stringify(query.queryChunks ?? []));
      return config.execute ? await config.execute(query) : { rows: [] };
    }),
  };
  mocks.withBusinessTransaction.mockImplementation(async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => await callback(tx));
  return { tx, sets, executed };
}

beforeEach(() => {
  vi.stubEnv("OTP_HASH_SECRET", secret);
  mocks.requireBusinessMembership.mockResolvedValue({ role: "viewer" });
  mocks.resolveOperatorSmsSender.mockResolvedValue("+14165550100");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("phone verification code hashing", () => {
  it("stores a keyed hash that never contains the code", () => {
    const hash = hashPhoneVerificationCode("attempt-1", "123456", secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(hashPhoneVerificationCode("attempt-1", "123456", secret)).toBe(hash);
  });

  it("matches only the same code, attempt, and secret", () => {
    const hash = hashPhoneVerificationCode("attempt-1", "123456", secret);
    expect(phoneVerificationCodeMatches(hash, "attempt-1", "123456", secret)).toBe(true);
    expect(phoneVerificationCodeMatches(hash, "attempt-1", "654321", secret)).toBe(false);
    expect(phoneVerificationCodeMatches(hash, "attempt-2", "123456", secret)).toBe(false);
    expect(phoneVerificationCodeMatches(hash, "attempt-1", "123456", "another-secret")).toBe(false);
    expect(phoneVerificationCodeMatches("not-a-hash", "attempt-1", "123456", secret)).toBe(false);
  });
});

describe("evaluatePhoneVerificationCode", () => {
  const pending = { id: "attempt-1", status: "pending", expiresAt: new Date(now.getTime() + 60_000), attemptCount: 0, codeHash: hashPhoneVerificationCode("attempt-1", "123456", secret) };

  it("approves the correct code", () => {
    expect(evaluatePhoneVerificationCode(pending, "123456", now, secret)).toEqual({ status: "approved" });
  });

  it("rejects a wrong code and counts down the remaining checks", () => {
    expect(evaluatePhoneVerificationCode(pending, "000000", now, secret)).toEqual({ status: "invalid", remainingAttempts: PHONE_VERIFICATION_MAX_CHECKS - 1 });
  });

  it("locks the attempt when a wrong code uses the last check", () => {
    expect(evaluatePhoneVerificationCode({ ...pending, attemptCount: PHONE_VERIFICATION_MAX_CHECKS - 1 }, "000000", now, secret)).toEqual({ status: "locked" });
    expect(evaluatePhoneVerificationCode({ ...pending, attemptCount: PHONE_VERIFICATION_MAX_CHECKS }, "123456", now, secret)).toEqual({ status: "locked" });
    expect(evaluatePhoneVerificationCode({ ...pending, status: "failed", codeHash: null, attemptCount: PHONE_VERIFICATION_MAX_CHECKS }, "123456", now, secret)).toEqual({ status: "locked" });
  });

  it("refuses an expired code even when it is correct", () => {
    expect(evaluatePhoneVerificationCode({ ...pending, expiresAt: now }, "123456", now, secret)).toEqual({ status: "expired" });
    expect(evaluatePhoneVerificationCode({ ...pending, status: "expired", codeHash: null }, "123456", now, secret)).toEqual({ status: "expired" });
  });

  it.each(["queued", "processing", "canceled", "approved"])("treats a %s attempt as unavailable", (status) => {
    expect(evaluatePhoneVerificationCode({ ...pending, status }, "123456", now, secret)).toEqual({ status: "unavailable" });
  });
});

describe("startOperatorPhoneVerification", () => {
  const input = { ...scope, phoneE164: "+14165550123", countryCode: "ca" };

  it("replaces open attempts, reserves a rate-limited attempt, and queues only its id", async () => {
    const { sets, executed } = setup({ execute: async () => ({ rows: [{ id: "attempt-9" }] }) });
    await expect(startOperatorPhoneVerification(context, input)).resolves.toEqual({ attemptId: "attempt-9" });
    expect(mocks.requireBusinessMembership).toHaveBeenCalled();
    expect(sets[0]).toMatchObject({ status: "canceled", codeHash: null });
    expect(executed[0]).toContain("reserve_phone_verification_attempt");
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "phoneVerification.sendCode", businessId: "business-1", payload: { attemptId: "attempt-9" } }));
  });

  it("rejects a number that is not E.164", async () => {
    setup();
    await expect(startOperatorPhoneVerification(context, { ...input, phoneE164: "4165550123" })).rejects.toMatchObject({ status: 422, code: "phone_number_invalid" });
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });

  it("needs an alert SMS sender", async () => {
    const { executed } = setup();
    mocks.resolveOperatorSmsSender.mockResolvedValue(null);
    await expect(startOperatorPhoneVerification(context, input)).rejects.toMatchObject({ status: 409, code: "sms_sender_missing" });
    expect(executed).toEqual([]);
  });

  it("refuses numbers a toll-free sender can't text", async () => {
    const { executed } = setup();
    mocks.resolveOperatorSmsSender.mockResolvedValue("+18885550100");
    await expect(startOperatorPhoneVerification(context, { ...input, phoneE164: "+447700900123", countryCode: "GB" })).rejects.toMatchObject({ status: 422, code: "phone_unreachable" });
    expect(executed).toEqual([]);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it.each([
    ["verification_cooldown", "verification_cooldown"],
    ["verification_user_rate_limited", "verification_rate_limited"],
    ["verification_phone_rate_limited", "verification_rate_limited"],
  ])("maps the %s database limit without echoing the phone", async (reason, code) => {
    setup({ execute: async () => { throw Object.assign(new Error(`Failed query: SELECT app.reserve_phone_verification_attempt params: ${input.phoneE164}`), { cause: Object.assign(new Error(reason), { code: "P0001" }) }); } });
    const error = await startOperatorPhoneVerification(context, input).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 429, code });
    expect(String((error as Error).message)).not.toContain(input.phoneE164);
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });
});

describe("checkOperatorPhoneVerificationCode", () => {
  const attempt = (overrides: Record<string, unknown> = {}) => ({ id: "attempt-1", status: "pending", expiresAt: new Date(now.getTime() + 60_000), attemptCount: 0, codeHash: hashPhoneVerificationCode("attempt-1", "123456", secret), ...overrides });
  const input = { ...scope, attemptId: "attempt-1", now };

  it("verifies the phone on the account when the code is correct", async () => {
    const { sets, executed } = setup({ selects: [[attempt()]], execute: async () => ({ rows: [{ approved: true }] }) });
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "123456" })).resolves.toEqual({ approved: true, status: "approved" });
    expect(sets[0]).toMatchObject({ attemptCount: 1, codeHash: null });
    expect(executed[0]).toContain("complete_phone_verification");
  });

  it("counts a wrong code without completing verification", async () => {
    const { sets, executed } = setup({ selects: [[attempt({ attemptCount: 1 })]] });
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "000000" })).resolves.toEqual({ approved: false, status: "invalid", remainingAttempts: PHONE_VERIFICATION_MAX_CHECKS - 2 });
    expect(sets[0]).toMatchObject({ attemptCount: 2 });
    expect(executed).toEqual([]);
  });

  it("fails the attempt and drops the hash after the last wrong code", async () => {
    const { sets } = setup({ selects: [[attempt({ attemptCount: PHONE_VERIFICATION_MAX_CHECKS - 1 })]] });
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "000000" })).resolves.toEqual({ approved: false, status: "locked" });
    expect(sets[0]).toMatchObject({ status: "failed", codeHash: null, attemptCount: PHONE_VERIFICATION_MAX_CHECKS });
  });

  it("expires a code after ten minutes", async () => {
    const { sets, executed } = setup({ selects: [[attempt({ expiresAt: new Date(now.getTime() - 1) })]] });
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "123456" })).resolves.toEqual({ approved: false, status: "expired" });
    expect(sets[0]).toMatchObject({ status: "expired", codeHash: null });
    expect(executed).toEqual([]);
  });

  it("does not reveal another user's attempt", async () => {
    setup({ selects: [[]] });
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "123456" })).resolves.toEqual({ approved: false, status: "unavailable" });
  });

  it("rejects codes that are not six digits before reading the attempt", async () => {
    setup();
    await expect(checkOperatorPhoneVerificationCode(context, { ...input, code: "12345" })).rejects.toMatchObject({ status: 400, code: "verification_code_invalid" });
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });
});

describe("getOperatorPhoneVerification", () => {
  it.each([
    ["queued", 60_000, "sending"],
    ["processing", 60_000, "sending"],
    ["pending", 60_000, "sent"],
    ["pending", -1, "expired"],
    ["failed", 60_000, "failed"],
    ["canceled", 60_000, "canceled"],
  ])("reports a %s attempt as %s", async (status, offset, expected) => {
    setup({ selects: [[{ id: "attempt-1", status, expiresAt: new Date(now.getTime() + Number(offset)) }]] });
    await expect(getOperatorPhoneVerification(context, { ...scope, attemptId: "attempt-1", now })).resolves.toMatchObject({ id: "attempt-1", status: expected });
  });
});

describe("issueOperatorPhoneVerificationCode", () => {
  it("generates a six-digit code and stores only its hash with a ten-minute expiry", async () => {
    const { sets } = setup({ updates: [[{ phoneE164: "+14165550123" }]] });
    const issued = await issueOperatorPhoneVerificationCode(context, { businessId: "business-1", attemptId: "attempt-1", now });
    expect(issued).toMatchObject({ to: "+14165550123", from: "+14165550100" });
    expect(issued?.code).toMatch(/^\d{6}$/);
    expect(sets[1]).toEqual(expect.objectContaining({ codeHash: hashPhoneVerificationCode("attempt-1", issued!.code, secret), expiresAt: new Date(now.getTime() + PHONE_VERIFICATION_CODE_TTL_MS), attemptCount: 0 }));
    expect(JSON.stringify(sets)).not.toContain(`"${issued!.code}"`);
  });

  it("skips an attempt that was replaced or already sent", async () => {
    setup({ updates: [[]] });
    await expect(issueOperatorPhoneVerificationCode(context, { businessId: "business-1", attemptId: "attempt-1", now })).resolves.toBeNull();
    expect(mocks.resolveOperatorSmsSender).not.toHaveBeenCalled();
  });

  it("fails the attempt when the sender can no longer reach the number", async () => {
    mocks.resolveOperatorSmsSender.mockResolvedValue("+18885550100");
    const { sets } = setup({ updates: [[{ phoneE164: "+447700900123" }]] });
    await expect(issueOperatorPhoneVerificationCode(context, { businessId: "business-1", attemptId: "attempt-1", now })).resolves.toBeNull();
    expect(sets[1]).toMatchObject({ status: "failed", codeHash: null });
  });
});
