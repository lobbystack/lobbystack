import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCurrentAdapter, runWithAdapter } from "@better-auth/core/context";

const mocks = vi.hoisted(() => ({
  config: undefined as any,
  createOtp: vi.fn(), enqueue: vi.fn(), allowed: vi.fn(), role: vi.fn(), challenge: vi.fn(),
  select: vi.fn(), acquired: true, lockHeld: false, adapter: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({ betterAuth: (config: unknown) => {
  mocks.config = config;
  return { $context: Promise.resolve({ adapter: (config as any).database }), api: { createVerificationOTP: mocks.createOtp } };
} }));
vi.mock("better-auth/api", async importOriginal => ({ ...await importOriginal<typeof import("better-auth/api")>(), createAuthMiddleware: (handler: unknown) => handler }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: mocks.adapter }));
vi.mock("./turnstile", () => ({ verifyTurnstileForSignUp: mocks.challenge }));
vi.mock("./email-verification-policy", async importOriginal => ({ ...await importOriginal<typeof import("./email-verification-policy")>(), assertEmailVerificationSendAllowed: mocks.allowed }));
vi.mock("./databases", () => {
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.select }) }) }),
    transaction: async (callback: (tx: unknown) => unknown) => {
      let owned = false;
      const tx = { ...db, execute: async () => {
        owned = mocks.acquired && !mocks.lockHeld;
        if (owned) mocks.lockHeld = true;
        return { rows: [{ acquired: owned }] };
      } };
      try { return await callback(tx); }
      finally { if (owned) mocks.lockHeld = false; }
    },
  };
  return { getDatabase: (role: string) => ({ db, role }) };
});
vi.mock("@lobbystack/db", async importOriginal => ({
  ...await importOriginal<typeof import("@lobbystack/db")>(),
  assertDatabaseRole: mocks.role,
  enqueueOutbox: mocks.enqueue,
  withBusinessTransaction: async (_db: unknown, _scope: unknown, callback: (tx: unknown) => unknown) => callback({}),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  mocks.acquired = true;
  mocks.lockHeld = false;
  mocks.adapter.mockReturnValue({});
  mocks.role.mockResolvedValue(undefined);
  mocks.allowed.mockResolvedValue(undefined);
  mocks.challenge.mockResolvedValue(undefined);
  mocks.createOtp.mockResolvedValue("123456");
  mocks.select.mockResolvedValue([{ id: "user-1", email: "owner@example.invalid", emailVerified: false }]);
});
afterEach(() => vi.unstubAllEnvs());

it("sends a localized sign-in reminder for a verified duplicate signup", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  mocks.select.mockResolvedValue([{ preferredLocale: "fr" }]);
  await mocks.config.emailAndPassword.onExistingUserSignUp({ user: { id: "user-1", email: "owner@example.invalid", emailVerified: true } });
  expect(mocks.createOtp).not.toHaveBeenCalled();
  expect(mocks.allowed).toHaveBeenCalledOnce();
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ template: "existing_account", variables: expect.objectContaining({ locale: "fr", signInUrl: expect.stringContaining("/fr/login") }) }) }));
});

it("sends a verification code for an unverified duplicate signup", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  await mocks.config.emailAndPassword.onExistingUserSignUp({ user: { id: "user-1", email: "owner@example.invalid", emailVerified: false } });
  expect(mocks.createOtp).toHaveBeenCalledOnce();
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ payload: expect.objectContaining({ template: "verify_email" }) }));
});

it("deduplicates by issuance identity rather than repeated OTP digits", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  await issueEmailVerificationCode("Owner@example.invalid");
  await issueEmailVerificationCode("owner@example.invalid");
  const deliveries = mocks.enqueue.mock.calls.map(call => call[1]);
  expect(deliveries).toHaveLength(2);
  expect(deliveries[0].payload.variables.code).toBe("123456");
  expect(deliveries[1].payload.variables.code).toBe("123456");
  expect(deliveries[0].dedupeKey).not.toBe(deliveries[1].dedupeKey);
  expect(deliveries[0].dedupeKey).not.toContain("123456");
  expect(mocks.allowed).toHaveBeenCalledTimes(2);
  expect(mocks.role.mock.calls.map(call => call[0].role)).toEqual(["lobbystack_auth", "lobbystack_app"]);
});

it("uses the shared issuance policy in signup/signin callbacks and forwards request IP", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  expect(mocks.config.emailVerification.sendOnSignUp).toBe(true);
  expect(mocks.config.emailVerification.sendOnSignIn).toBe(true);
  await mocks.config.emailVerification.sendVerificationEmail(
    { user: { id: "user-1", email: "owner@example.invalid" }, url: "https://app.example.test/verify" },
    new Request("https://app.example.test", { headers: { "x-real-ip": "203.0.113.10", "cf-connecting-ip": "198.51.100.20" } }),
  );
  expect(mocks.allowed).toHaveBeenCalledExactlyOnceWith({ email: "owner@example.invalid", remoteIp: "203.0.113.10" });
  expect(mocks.createOtp).toHaveBeenCalledTimes(1);
});

it("rejects overlapping requests while an earlier OTP generation is still running", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  let release!: (otp: string) => void;
  mocks.createOtp.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve; }));
  const first = issueEmailVerificationCode("owner@example.invalid");
  await vi.waitFor(() => expect(mocks.createOtp).toHaveBeenCalledTimes(1));
  await expect(issueEmailVerificationCode("owner@example.invalid")).rejects.toThrow("Please wait");
  release("123456");
  await expect(first).resolves.toBe(true);
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.allowed).toHaveBeenCalledTimes(1);
  expect(mocks.adapter.mock.calls[0]![0]).toHaveProperty("execute");
});

it("overrides an enclosing signup adapter while generating the OTP", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  const outerAdapter = { id: "signup" } as any;
  const issuanceAdapter = { id: "issuance" } as any;
  mocks.adapter.mockReturnValue(issuanceAdapter);
  mocks.createOtp.mockImplementationOnce(async () => {
    expect(await getCurrentAdapter(outerAdapter)).toBe(issuanceAdapter);
    return "123456";
  });
  await runWithAdapter(outerAdapter, async () => {
    await expect(issueEmailVerificationCode("owner@example.invalid")).resolves.toBe(true);
    expect(await getCurrentAdapter(issuanceAdapter)).toBe(outerAdapter);
  });
});

it("suppresses callback cooldowns but propagates protection outages", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  const { EmailVerificationRateLimitError } = await import("./email-verification-policy");
  const callback = mocks.config.emailVerification.sendVerificationEmail;
  const input = { user: { id: "user-1", email: "owner@example.invalid" }, url: "https://app.example.test/verify" };
  mocks.allowed.mockRejectedValueOnce(new EmailVerificationRateLimitError());
  await expect(callback(input)).resolves.toBeUndefined();
  mocks.allowed.mockRejectedValueOnce(new Error("offline"));
  await expect(callback(input)).rejects.toThrow("offline");
  expect(mocks.createOtp).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("blocks concurrent issuance and policy failures before generating or delivering", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  mocks.acquired = false;
  await expect(issueEmailVerificationCode("owner@example.invalid")).rejects.toThrow("Please wait");
  expect(mocks.allowed).not.toHaveBeenCalled();
  mocks.acquired = true;
  mocks.allowed.mockRejectedValueOnce(new Error("offline"));
  await expect(issueEmailVerificationCode("owner@example.invalid")).rejects.toThrow("offline");
  expect(mocks.createOtp).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});

it("does not issue for missing or already verified users", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  mocks.select.mockResolvedValueOnce([]).mockResolvedValueOnce([{ emailVerified: true }]);
  expect(await issueEmailVerificationCode("missing@example.invalid")).toBe(false);
  expect(await issueEmailVerificationCode("verified@example.invalid")).toBe(false);
  expect(mocks.createOtp).not.toHaveBeenCalled();
});

it("fails closed on an effective database role mismatch before auth or issuance", async () => {
  mocks.role.mockRejectedValue(new Error("Database role assertion failed"));
  const { getAuth, issueEmailVerificationCode } = await import("./auth"); getAuth();
  await expect(mocks.config.hooks.before({ path: "/sign-in/email" })).rejects.toThrow("Database role assertion failed");
  await expect(issueEmailVerificationCode("owner@example.invalid")).rejects.toThrow("Database role assertion failed");
  expect(mocks.createOtp).not.toHaveBeenCalled();
});

it("runs signup challenge at the boundary with the trusted IP and blocks disabled endpoints", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  await mocks.config.hooks.before({ path: "/sign-up/email", body: { password: "StrongPassword123!", turnstileToken: "challenge" }, headers: new Headers({ "x-real-ip": "203.0.113.10", "cf-connecting-ip": "198.51.100.20" }) });
  expect(mocks.challenge).toHaveBeenCalledWith({ token: "challenge", remoteIp: "203.0.113.10" });
  await expect(mocks.config.hooks.before({ path: "/email-otp/send-verification-otp" })).rejects.toThrow("Endpoint not enabled");
  expect(mocks.allowed).not.toHaveBeenCalled();
});

it("shares one in-flight database role assertion across concurrent requests", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mocks.role.mockImplementation(() => gate);
  const first = mocks.config.hooks.before({ path: "/sign-in/email" });
  const second = mocks.config.hooks.before({ path: "/sign-in/email" });
  await vi.waitFor(() => expect(mocks.role).toHaveBeenCalledTimes(2));
  release();
  await Promise.all([first, second]);
  expect(mocks.role).toHaveBeenCalledTimes(2);
});

it("re-checks the database role assertion after a transient failure instead of caching it", async () => {
  const { issueEmailVerificationCode } = await import("./auth");
  mocks.role.mockRejectedValueOnce(new Error("Database role assertion failed"));
  await expect(issueEmailVerificationCode("owner@example.invalid")).rejects.toThrow("Database role assertion failed");
  await expect(issueEmailVerificationCode("owner@example.invalid")).resolves.toBe(true);
  expect(mocks.role).toHaveBeenCalledTimes(4);
  expect(mocks.createOtp).toHaveBeenCalledTimes(1);
});

it("declares explicit per-path recovery rules that preserve plugin semantics", async () => {
  const { getAuth } = await import("./auth"); getAuth();
  expect(mocks.config.rateLimit.customRules).toMatchObject({
    "/request-password-reset": { window: 60, max: 5 },
    "/email-otp/request-password-reset": { window: 60, max: 3 },
    "/email-otp/reset-password": { window: 60, max: 3 },
    "/email-otp/verify-email": { window: 60, max: 3 },
  });
  expect(Object.keys(mocks.config.rateLimit.customRules)).not.toContain("/email-otp/send-verification-otp");
});
