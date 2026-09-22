import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { runWithAdapter } from "@better-auth/core/context";
import Redis from "ioredis";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { assertDatabaseRole, enqueueOutbox, withBusinessTransaction } from "@lobbystack/db";
import { accounts, sessions, users, verifications } from "@lobbystack/db";

import { getDatabase } from "./databases";
import { hashReplacementPassword, isLegacyScryptHash, meetsPasswordRequirements, verifyLegacyPassword } from "./password";
import { trustedClientIp, trustedClientIpFromHeaders, trustedClientIpHeader } from "./trusted-client-ip";
import { verifyTurnstileForSignUp } from "./turnstile";

let instance: any;
let authRedis: Redis | undefined;
let databaseRolesReady: Promise<void> | undefined;

function assertAuthDatabaseRoles(): Promise<void> {
  // Share one in-flight assertion with concurrent callers, but clear it on
  // rejection so a transient role mismatch is re-checked on the next request
  // instead of caching the failure for the life of the process.
  databaseRolesReady ??= Promise.all([
    assertDatabaseRole(getAuthDatabase()),
    assertDatabaseRole(getEmailDatabase()),
  ]).then(
    () => undefined,
    (error: unknown) => {
      databaseRolesReady = undefined;
      throw error;
    },
  );
  return databaseRolesReady;
}

const enabledEmailOtpPaths = new Set([
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/email-otp/verify-email",
]);

export function isDisabledAuthEmailEndpoint(path?: string): boolean {
  if (!path) return false;
  if (path === "/send-verification-email") return true;
  return (path.startsWith("/email-otp/") || path.endsWith("/email-otp")) && !enabledEmailOtpPaths.has(path);
}

export function getAuthDatabase() {
  return getDatabase("lobbystack_auth");
}

function getEmailDatabase() {
  return getDatabase("lobbystack_app");
}

function getAuthSecondaryStorage() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return undefined;
  }
  if (!authRedis) {
    authRedis = new Redis(redisUrl, {
      connectionName: `${process.env.REDIS_PREFIX ?? "lobbystack"}:better-auth`,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    authRedis.on("error", () => undefined);
  }
  const prefix = `${process.env.REDIS_PREFIX ?? "lobbystack"}:better-auth:`;
  return {
    get: async (key: string) => {
      await waitForAuthRedis(authRedis!);
      return await authRedis!.get(`${prefix}${key}`);
    },
    set: async (key: string, value: string, ttl?: number) => {
      await waitForAuthRedis(authRedis!);
      if (ttl !== undefined && ttl > 0) {
        await authRedis!.setex(`${prefix}${key}`, ttl, value);
        return;
      }
      await authRedis!.set(`${prefix}${key}`, value);
    },
    delete: async (key: string) => {
      await waitForAuthRedis(authRedis!);
      await authRedis!.del(`${prefix}${key}`);
    },
    getAndDelete: async (key: string) => {
      await waitForAuthRedis(authRedis!);
      return await authRedis!.getdel(`${prefix}${key}`);
    },
    increment: async (key: string, ttl: number) => {
      await waitForAuthRedis(authRedis!);
      const result = await authRedis!.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        1,
        `${prefix}${key}`,
        Math.max(1, Math.ceil(ttl)),
      );
      return Number(result);
    },
  };
}

async function waitForAuthRedis(store: Redis): Promise<void> {
  if (store.status === "ready") return;
  if (store.status === "wait") {
    await store.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      store.off("ready", onReady);
      store.off("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    store.once("ready", onReady);
    store.once("error", onError);
  });
}

async function enqueueAuthEmail(input: {
  purpose: "verification" | "password_reset" | "email_change";
  userId: string;
  email: string;
  url: string;
}): Promise<void> {
  const urlHash = createHash("sha256").update(input.url).digest("hex");
  const subject = input.purpose === "verification"
    ? "Verify your LobbyStack email"
    : input.purpose === "password_reset"
      ? "Reset your LobbyStack password"
      : "Confirm your LobbyStack email change";
  await withBusinessTransaction(getEmailDatabase().db, { actorType: "system" }, async (tx) => {
    await enqueueOutbox(tx, {
      topic: "email.send",
      aggregateType: "auth_email",
      aggregateId: input.userId,
      dedupeKey: `auth-email:${input.purpose}:${input.userId}:${urlHash}`,
      payload: {
        template: input.purpose === "verification" ? "verify_email" : input.purpose === "password_reset" ? "password_reset" : "verify_email",
        to: input.email,
        subject,
        variables: { url: input.url },
      },
    });
  });
}

async function enqueueEmailVerificationCode(input: { userId: string; email: string; otp: string; issuanceId: string }): Promise<boolean> {
  await withBusinessTransaction(getEmailDatabase().db, { actorType: "system" }, async (tx) => {
    await enqueueOutbox(tx, {
      topic: "email.send",
      aggregateType: "auth_email",
      aggregateId: input.userId,
      dedupeKey: `auth-email:verification-code:${input.userId}:${input.issuanceId}`,
      payload: {
        template: "verify_email",
        to: input.email,
        subject: "Your LobbyStack verification code",
        variables: { code: input.otp },
      },
    });
  });
  return true;
}

export async function issueEmailVerificationCode(email: string, remoteIp?: string | null): Promise<boolean> {
  const { assertEmailVerificationSendAllowed, EmailVerificationRateLimitError } = await import("./email-verification-policy");
  await assertAuthDatabaseRoles();
  const normalizedEmail = email.trim().toLowerCase();
  // Serialize generation and delivery across processes, including slow requests
  // that outlive the Redis cooldown. Bind the OTP adapter to this transaction
  // so concurrent issuances cannot exhaust the pool waiting for a second slot.
  return await getAuthDatabase().db.transaction(async (tx) => {
    const lock = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${`email-verification:${normalizedEmail}`}, 0)) as acquired`);
    if (!lock.rows[0]?.acquired) throw new EmailVerificationRateLimitError();
    await assertEmailVerificationSendAllowed({ email: normalizedEmail, ...(remoteIp ? { remoteIp } : {}) });
    const user = (await tx.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, normalizedEmail)).limit(1))[0];
    if (!user || user.emailVerified) return false;
    const issuanceId = randomUUID();
    const issuer = createAuth(tx);
    const { adapter } = await issuer.$context;
    // Signup runs inside Better Auth's adapter AsyncLocalStorage. A nested
    // instance alone does not replace that adapter for internal writes.
    const otp = await runWithAdapter(adapter, () => issuer.api.createVerificationOTP({ body: { email: normalizedEmail, type: "email-verification" } }));
    return await enqueueEmailVerificationCode({ userId: user.id, email: normalizedEmail, otp, issuanceId });
  });
}

async function rehashLegacyPassword(userId: string, password: string): Promise<void> {
  const database = getAuthDatabase();
  const account = (await database.db.select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), isNotNull(accounts.password)))
    .limit(1))[0];
  const legacyHash = account?.password;
  if (!account || !legacyHash || !isLegacyScryptHash(legacyHash) || !(await verifyLegacyPassword(legacyHash, password))) {
    return;
  }

  const replacementHash = await hashReplacementPassword(password);
  await database.db.transaction(async (tx) => {
    const updated = await tx.update(accounts)
      .set({ password: replacementHash, updatedAt: new Date() })
      .where(and(eq(accounts.id, account.id), eq(accounts.password, legacyHash)))
      .returning({ id: accounts.id });
    if (!updated[0]) {
      return;
    }
    await tx.update(users)
      .set({ passwordHash: replacementHash, passwordAlgorithm: "lobbystack-scrypt-v1", updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}

export function getAuth() {
  return instance ??= createAuth();
}

function createAuth(adapterDatabase?: Parameters<typeof drizzleAdapter>[0]) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Better Auth.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }
  const secureCookies = process.env.BETTER_AUTH_USE_SECURE_COOKIES === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.BETTER_AUTH_USE_SECURE_COOKIES === "true";
  const trustedIpHeader = trustedClientIpHeader();
  const database = getAuthDatabase();
  const secondaryStorage = getAuthSecondaryStorage();
  return betterAuth({
    database: drizzleAdapter(adapterDatabase ?? database.db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    trustedOrigins: (process.env.AUTH_TRUSTED_ORIGINS ?? process.env.APP_BASE_URL ?? "http://localhost:3000").split(",").map((value) => value.trim()).filter(Boolean),
    secret: process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_ENCRYPTION_KEY ?? "development-only-change-me",
    ...(secondaryStorage ? { secondaryStorage } : {}),
    advanced: {
      useSecureCookies: secureCookies,
      database: { generateId: () => randomUUID() },
      // Only an explicitly configured, ingress-controlled single-value header
      // is trusted. Without the opt-in Better Auth keeps its default
      // `x-forwarded-for`, which rejects a multi-hop chain and fails closed to
      // the shared per-path bucket rather than trusting a spoofable value.
      ...(trustedIpHeader ? { ipAddress: { ipAddressHeaders: [trustedIpHeader] } } : {}),
    },
    plugins: [emailOTP({
      disableSignUp: true,
      storeOTP: "hashed",
      expiresIn: 600,
      allowedAttempts: 3,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "forget-password") throw new Error("Only password recovery codes use the public OTP sender.");
        const user = (await database.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
        if (!user) return;
        await withBusinessTransaction(getEmailDatabase().db, { actorType: "system" }, async (tx) => {
          await enqueueOutbox(tx, {
            topic: "email.send",
            aggregateType: "auth_email",
            aggregateId: user.id,
            dedupeKey: `auth-reset-code:${user.id}:${randomUUID()}`,
            payload: { template: "password_reset", to: email, subject: "Reset your LobbyStack password", variables: { code: otp } },
          });
        });
      },
    })],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      password: {
        hash: hashReplacementPassword,
        verify: async ({ hash, password }: { hash: string; password: string }) => await verifyLegacyPassword(hash, password),
      },
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }: { user: { id: string } }) => {
        const account = (await database.db.select({ password: accounts.password }).from(accounts)
          .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential"))).limit(1))[0];
        if (account?.password) await database.db.update(users).set({ passwordHash: account.password, passwordAlgorithm: "lobbystack-scrypt-v1", updatedAt: new Date() }).where(eq(users.id, user.id));
      },
      sendResetPassword: async ({ user, url }: { user: { id: string; email: string }; url: string }) => {
        await enqueueAuthEmail({ purpose: "password_reset", userId: user.id, email: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      afterEmailVerification: async (user: { id: string; email: string }) => {
        await database.db.update(users).set({ normalizedEmail: user.email.trim().toLowerCase(), updatedAt: new Date() }).where(eq(users.id, user.id));
      },
      sendVerificationEmail: async ({ user, url }: { user: { id: string; email: string }; url: string }, request?: Request) => {
        const storedUser = (await database.db.select({ email: users.email, preferredLocale: users.preferredLocale }).from(users).where(eq(users.id, user.id)).limit(1))[0];
        if (!storedUser) return;
        if (storedUser.email === user.email) {
          try {
            await issueEmailVerificationCode(user.email, request ? trustedClientIp(request) : undefined);
          } catch (error) {
            const { EmailVerificationRateLimitError } = await import("./email-verification-policy");
            // Sign-up/sign-in keep their normal response when a prior issuance
            // already covers this recipient. Other failures remain fail-closed.
            if (!(error instanceof EmailVerificationRateLimitError)) throw error;
          }
          return;
        }
        // Keep the link callback for the existing two-address email-change flow.
        const verificationUrl = new URL(url);
        const recipientLocale = storedUser.preferredLocale === "fr" ? "fr" : "en";
        const confirmationUrl = new URL(`/${recipientLocale}/confirm-email-change`, process.env.APP_BASE_URL ?? "http://localhost:3000");
        confirmationUrl.searchParams.set("token", verificationUrl.searchParams.get("token") ?? "");
        confirmationUrl.searchParams.set("email", user.email);
        await enqueueAuthEmail({ purpose: "verification", userId: user.id, email: user.email, url: confirmationUrl.toString() });
      },
    },
    user: {
      additionalFields: {
        // The database trigger replaces this placeholder with lower(email) on
        // insert and update. Declaring it keeps Better Auth's schema validator
        // aware that every user insert satisfies the required column.
        normalizedEmail: { type: "string", required: false, defaultValue: "", input: false, returned: false },
        preferredLocale: { type: "string", required: false, defaultValue: "en", input: true, validator: { input: z.enum(["en", "fr"]) } },
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, url }: { user: { id: string; email: string }; newEmail: string; url: string }) => {
          await enqueueAuthEmail({ purpose: "email_change", userId: user.id, email: user.email, url });
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      storeSessionInDatabase: true,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: secondaryStorage ? "secondary-storage" : "memory",
      // Explicit per-path rules for the account-recovery endpoints, matching
      // the email-OTP plugin's own window/max so the plugin semantics are
      // preserved. Better Auth keys each path separately, so a recovery attempt
      // never consumes the verification recipient cooldown (or vice versa) and
      // one purpose cannot lock out another.
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 5 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 3 },
        "/email-otp/verify-email": { window: 60, max: 3 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await assertAuthDatabaseRoles();
        // Enable verification and recovery only; the OTP plugin must not
        // introduce passwordless sign-in or email-change endpoints.
        // Server-only plugin methods, including createVerificationOTP, do not
        // have a route path. They remain callable from trusted application
        // code while every unapproved public OTP route is rejected.
        if (isDisabledAuthEmailEndpoint(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Endpoint not enabled." });
        }
        const recoveryPaths = ["/email-otp/request-password-reset", "/email-otp/reset-password"];
        if (recoveryPaths.includes(ctx.path) && !z.string().email().safeParse(ctx.body?.email).success) {
          throw new APIError("BAD_REQUEST", { message: "Invalid email address." });
        }
        if (["/sign-up/email", "/email-otp/reset-password", "/reset-password", "/change-password"].includes(ctx.path)) {
          const password = ctx.body?.newPassword ?? ctx.body?.password;
          if (typeof password !== "string" || !meetsPasswordRequirements(password)) {
            throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" });
          }
        }
        if (ctx.path !== "/sign-up/email") {
          return;
        }
        const token = typeof ctx.body?.turnstileToken === "string"
          ? ctx.body.turnstileToken
          : ctx.body?.["cf-turnstile-response"];
        const remoteIp = ctx.headers ? trustedClientIpFromHeaders(ctx.headers) : undefined;
        try {
          await verifyTurnstileForSignUp({
            token,
            ...(remoteIp ? { remoteIp } : {}),
          });
        } catch (error) {
          throw new APIError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Turnstile verification failed." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") {
          return;
        }
        const userId = ctx.context.newSession?.user.id;
        const password = typeof ctx.body?.password === "string" ? ctx.body.password : undefined;
        if (!userId || !password) {
          return;
        }
        try {
          await rehashLegacyPassword(userId, password);
        } catch {
          // A failed upgrade must not turn a successful login into an outage.
        }
      }),
    },
  });
}

export type Session = { user: { id: string; name?: string | null; email?: string | null }; session: { id: string; userId: string; expiresAt: Date } } | null;

export async function getSession(headers: Headers): Promise<Session> {
  return (await getAuth().api.getSession({ headers })) as Session;
}

export async function requireSession(headers: Headers): Promise<NonNullable<Session>> {
  const session = await getSession(headers);
  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}
