import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { runWithAdapter } from "@better-auth/core/context";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { assertDatabaseRole, enqueueOutbox, withBusinessTransaction } from "@lobbystack/db";
import { accounts, sessions, users, verifications } from "@lobbystack/db";
import { partnerFeatures } from "@lobbystack/shared";

import { configuredAppOrigins } from "./app-origins";
import { loadRequestEmailBrand } from "./branding";
import { getDatabase } from "./databases";
import { SUPPORTED_LOCALES, resolveLocale } from "./locale";
import { ensureMcpResource, isDisabledOAuthEndpoint, mcpOAuthPlugins, needsMcpResource, oauthProviderSchema, registrationWithApplicationType } from "./oauth-provider";
import { hashReplacementPassword, isLegacyScryptHash, meetsPasswordRequirements, verifyLegacyPassword } from "./password";
import { readyRedis } from "./redis";
import { partnerRequestOrigin, readResolvedBrand } from "./request-brand";
import { trustedClientIp, trustedClientIpFromHeaders, trustedClientIpHeader } from "./trusted-client-ip";
import { verifyTurnstile } from "./turnstile";

let instance: any;
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

// Password resets go by emailed code only. Better Auth's link reset would
// email a token for any account to whatever host asked for it, which on a
// partner's own domain is a host the partner controls.
const disabledResetLinkPaths = new Set(["/request-password-reset", "/forget-password", "/reset-password"]);

export function isDisabledAuthEmailEndpoint(path?: string): boolean {
  if (!path) return false;
  if (path === "/send-verification-email") return true;
  if (disabledResetLinkPaths.has(path) || path.startsWith("/reset-password/")) return true;
  return (path.startsWith("/email-otp/") || path.endsWith("/email-otp")) && !enabledEmailOtpPaths.has(path);
}

/** Google sign-in reuses the Google Calendar OAuth client, so it is on wherever that client is configured. */
function googleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleSignInEnabled(): boolean {
  return googleOAuthClient() !== null;
}

/**
 * Whether a request may sign in with Google: only on the host's domain, as
 * the proxy resolved it. A partner's host offers email and password only,
 * since Google's consent screen would name the host's app.
 */
export function googleSignInAllowed(headers: Headers): boolean {
  return googleSignInEnabled() && readResolvedBrand(headers)?.kind === "host";
}

// Better Auth's paths that start or finish a sign-in with Google, or link a Google account.
const socialSignInPaths = new Set(["/sign-in/social", "/link-social", "/callback/:id"]);

const DEFAULT_APP_ORIGIN = "http://localhost:3000";

/**
 * Where Better Auth builds its links: APP_BASE_URL, whatever hostname of the
 * host's domain the request came in on, as it always has. With a partner base
 * domain, a request on one of its subdomains gets them on that subdomain
 * instead, with APP_BASE_URL's scheme, so a partner's reset and email change
 * links lead back to the partner's host. A partner's own domain joins these
 * hosts while requests reach it, as admitPartnerHost describes.
 */
export function authBaseURL(env: Readonly<Record<string, string | undefined>> = process.env): NonNullable<BetterAuthOptions["baseURL"]> {
  const fallback = env.APP_BASE_URL ?? DEFAULT_APP_ORIGIN;
  const { baseDomain, customDomains } = partnerFeatures(env);
  if (!baseDomain && !customDomains) return fallback;
  let protocol: "http" | "https" = "http";
  let fallbackHost = "localhost";
  try {
    const url = new URL(fallback);
    protocol = url.protocol === "https:" ? "https" : "http";
    fallbackHost = url.host;
  } catch {
    // Better Auth refuses an unreadable APP_BASE_URL itself.
  }
  // The Host header keeps a port, as acme.partners.localhost:13000 does in
  // development. Better Auth needs one host at least: without a base domain,
  // APP_BASE_URL's, which builds the same links as the fallback.
  return { allowedHosts: baseDomain ? [`*.${baseDomain}`, `*.${baseDomain}:*`] : [fallbackHost], fallback, protocol };
}

// How long a partner's own domain stays among Better Auth's hosts after a
// request on it: the brand cache's window, so a domain the partner removed
// leaves once no process answers it any more.
const ADMITTED_HOST_MS = 30_000;
const MAX_ADMITTED_HOSTS = 1_000;
/** For each list of Better Auth's hosts, the partners' own domains admitted to it, each with when it leaves. */
const admittedHostsByList = new WeakMap<string[], Map<string, number>>();

function withoutHost(allowedHosts: string[], host: string): void {
  const index = allowedHosts.indexOf(host);
  if (index >= 0) allowedHosts.splice(index, 1);
}

/**
 * Lets Better Auth build links on a partner's own domain once the proxy
 * resolved the request to it. The partner base domain's pattern covers every
 * partner's subdomain, but partners' own domains come and go while the
 * process runs, so each joins the hosts Better Auth checks a request's Host
 * header against for a while after each request on it, and leaves after.
 * Better Auth reads that list on every request, so changing it in place
 * reaches the running instance. Exported for its test.
 */
export function admitPartnerHost(allowedHosts: string[], headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env, now = Date.now()): void {
  let admittedHosts = admittedHostsByList.get(allowedHosts);
  if (!admittedHosts) admittedHostsByList.set(allowedHosts, admittedHosts = new Map());
  for (const [host, leavesAt] of admittedHosts) {
    if (leavesAt > now) continue;
    admittedHosts.delete(host);
    withoutHost(allowedHosts, host);
  }
  const resolved = readResolvedBrand(headers);
  if (resolved?.kind !== "partner") return;
  const origin = new URL(resolved.origin);
  const { baseDomain } = partnerFeatures(env);
  if (baseDomain && origin.hostname.endsWith(`.${baseDomain}`)) return;
  if (!admittedHosts.delete(origin.host)) allowedHosts.push(origin.host);
  admittedHosts.set(origin.host, now + ADMITTED_HOST_MS);
  for (const oldest of admittedHosts.keys()) {
    if (admittedHosts.size <= MAX_ADMITTED_HOSTS) break;
    admittedHosts.delete(oldest);
    withoutHost(allowedHosts, oldest);
  }
}

/**
 * The origins Better Auth trusts for a request, as the proxy resolved it: the
 * host's configured origins on the host's domain, only the partner's own
 * origin on a partner's host, and none for a request the proxy resolved no
 * brand for. Better Auth asks without a request when it starts, and gets the
 * host's.
 */
export function authTrustedOrigins(request?: Request, env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const resolved = request ? readResolvedBrand(request.headers) : { kind: "host" as const };
  if (!resolved) return [];
  if (resolved.kind === "partner") return [resolved.origin];
  const origins = configuredAppOrigins(env, [], true);
  return origins.length > 0 ? origins : [DEFAULT_APP_ORIGIN];
}

/**
 * Better Auth trusts every host its baseURL can resolve to, so with a partner
 * base domain it would trust every partner's subdomain on every request.
 * Before it checks a request's Origin and callback URLs, this narrows what the
 * request trusts back to what the proxy resolved, so one partner's host never
 * trusts another's.
 */
function resolvedOriginsOnly(): BetterAuthPlugin {
  return {
    id: "lobbystack-resolved-origins",
    onRequest: async (request, ctx) => {
      ctx.trustedOrigins = authTrustedOrigins(request);
    },
  };
}

/**
 * The origin of the links an auth email carries: the partner's host the proxy
 * resolved the request to, or APP_BASE_URL on the host's domain and outside a
 * request.
 */
function authLinkOrigin(request?: Request): string {
  return (request ? partnerRequestOrigin(request.headers) : null) ?? process.env.APP_BASE_URL ?? DEFAULT_APP_ORIGIN;
}

export function getAuthDatabase() {
  return getDatabase("lobbystack_auth");
}

function getEmailDatabase() {
  return getDatabase("lobbystack_app");
}

function getAuthSecondaryStorage() {
  if (!process.env.REDIS_URL) {
    return undefined;
  }
  const prefix = `${process.env.REDIS_PREFIX ?? "lobbystack"}:better-auth:`;
  const redis = async () => (await readyRedis())!;
  return {
    get: async (key: string) => await (await redis()).get(`${prefix}${key}`),
    set: async (key: string, value: string, ttl?: number) => {
      const store = await redis();
      if (ttl !== undefined && ttl > 0) {
        await store.setex(`${prefix}${key}`, ttl, value);
        return;
      }
      await store.set(`${prefix}${key}`, value);
    },
    delete: async (key: string) => {
      await (await redis()).del(`${prefix}${key}`);
    },
    getAndDelete: async (key: string) => await (await redis()).getdel(`${prefix}${key}`),
    increment: async (key: string, ttl: number) => {
      const result = await (await redis()).eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        1,
        `${prefix}${key}`,
        Math.max(1, Math.ceil(ttl)),
      );
      return Number(result);
    },
  };
}

/**
 * Queues one auth email through the transactional outbox, under the brand of
 * the request that asked for it. The worker writes its subject, text and
 * links under that brand when it sends, with the brand's Reply-To.
 */
async function enqueueAuthEmailOutbox(input: { userId: string; dedupeKey: string; payload: Record<string, unknown> }): Promise<void> {
  const payload = { ...input.payload, brand: await loadRequestEmailBrand(), replyTo: null };
  await withBusinessTransaction(getEmailDatabase().db, { actorType: "system" }, async (tx) => {
    await enqueueOutbox(tx, { topic: "email.send", aggregateType: "auth_email", aggregateId: input.userId, dedupeKey: input.dedupeKey, payload });
  });
}

async function enqueueAuthEmail(input: {
  purpose: "verification" | "email_change";
  userId: string;
  email: string;
  url: string;
}): Promise<void> {
  const urlHash = createHash("sha256").update(input.url).digest("hex");
  await enqueueAuthEmailOutbox({
    userId: input.userId,
    dedupeKey: `auth-email:${input.purpose}:${input.userId}:${urlHash}`,
    payload: {
      template: "verify_email",
      to: input.email,
      // An email change shares the verification template; its subject says what it confirms.
      variables: input.purpose === "email_change" ? { url: input.url, purpose: "email_change" } : { url: input.url },
    },
  });
}

async function enqueueEmailVerificationCode(input: { userId: string; email: string; otp: string; issuanceId: string }): Promise<boolean> {
  await enqueueAuthEmailOutbox({
    userId: input.userId,
    dedupeKey: `auth-email:verification-code:${input.userId}:${input.issuanceId}`,
    payload: {
      template: "verify_email",
      to: input.email,
      variables: { code: input.otp },
    },
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
  await database.db.update(accounts)
    .set({ password: replacementHash, updatedAt: new Date() })
    .where(and(eq(accounts.id, account.id), eq(accounts.password, legacyHash)));
}

export function getAuth() {
  if (instance) return instance;
  const auth = createAuth();
  const baseURL: unknown = (auth as { options?: { baseURL?: unknown } }).options?.baseURL;
  // Every request reaches Better Auth through its handler, so that's where a partner's own domain joins its hosts.
  if (baseURL && typeof baseURL === "object" && "allowedHosts" in baseURL && Array.isArray(baseURL.allowedHosts)) {
    const allowedHosts = baseURL.allowedHosts as string[];
    const handler = auth.handler;
    auth.handler = async (request: Request) => {
      admitPartnerHost(allowedHosts, request.headers);
      return await handler(request);
    };
  }
  return instance = auth;
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
  const google = googleOAuthClient();
  return betterAuth({
    database: drizzleAdapter(adapterDatabase ?? database.db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications, ...oauthProviderSchema },
    }),
    baseURL: authBaseURL(),
    trustedOrigins: authTrustedOrigins,
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
    plugins: [resolvedOriginsOnly(), ...mcpOAuthPlugins(), emailOTP({
      disableSignUp: true,
      storeOTP: "hashed",
      expiresIn: 600,
      allowedAttempts: 3,
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "forget-password") throw new Error("Only password recovery codes use the public OTP sender.");
        const user = (await database.db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
        if (!user) return;
        await enqueueAuthEmailOutbox({
          userId: user.id,
          dedupeKey: `auth-reset-code:${user.id}:${randomUUID()}`,
          payload: { template: "password_reset", to: email, variables: { code: otp } },
        });
      },
    })],
    ...(google ? { socialProviders: { google: {
      ...google,
      // Better Auth asks Google for openid, email and profile only. This stops Google from adding
      // the Calendar scopes the shared client may already hold to the sign-in token.
      includeGrantedScopes: false,
      disableIdTokenSignIn: true,
      requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      // The sign-in page sends its language as additionalData; that is client input, so clamp it.
      mapProfileToUser: async () => {
        const locale = (await getOAuthState())?.preferredLocale;
        return { preferredLocale: resolveLocale(typeof locale === "string" ? locale : undefined) };
      },
    } } } : {}),
    // A Google sign-in joins the existing account with the same email only when Google verified
    // that email and the account verified it too (Better Auth's default): an unverified Google
    // identity can't take over an account, and a squatter's unverified signup can't capture one.
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
      onExistingUserSignUp: async ({ user }, request) => {
        const { assertEmailVerificationSendAllowed, EmailVerificationRateLimitError } = await import("./email-verification-policy");
        try {
          const remoteIp = request ? trustedClientIp(request) : undefined;
          if (!user.emailVerified) {
            await issueEmailVerificationCode(user.email, remoteIp);
            return;
          }
          await assertEmailVerificationSendAllowed({ email: user.email, ...(remoteIp ? { remoteIp } : {}) });
          const stored = (await database.db.select({ preferredLocale: users.preferredLocale }).from(users).where(eq(users.id, user.id)).limit(1))[0];
          const locale = resolveLocale(stored?.preferredLocale);
          const base = authLinkOrigin(request);
          await enqueueAuthEmailOutbox({
            userId: user.id,
            dedupeKey: `auth-existing-account:${user.id}:${randomUUID()}`,
            payload: { template: "existing_account", to: user.email,
              variables: { locale, signInUrl: new URL(`/${locale}/login`, base).href, resetUrl: new URL(`/${locale}/forgot-password`, base).href } },
          });
        } catch (error) {
          if (!(error instanceof EmailVerificationRateLimitError)) throw error;
        }
      },
      password: {
        hash: hashReplacementPassword,
        verify: async ({ hash, password }: { hash: string; password: string }) => await verifyLegacyPassword(hash, password),
      },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
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
        const recipientLocale = resolveLocale(storedUser.preferredLocale);
        const confirmationUrl = new URL(`/${recipientLocale}/confirm-email-change`, authLinkOrigin(request));
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
        preferredLocale: { type: "string", required: false, defaultValue: "en", input: true, validator: { input: z.enum(SUPPORTED_LOCALES) } },
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
        if (isDisabledAuthEmailEndpoint(ctx.path) || isDisabledOAuthEndpoint(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Endpoint not enabled." });
        }
        if (ctx.path && socialSignInPaths.has(ctx.path) && !(ctx.headers && readResolvedBrand(ctx.headers)?.kind === "host")) {
          throw new APIError("NOT_FOUND", { message: "Endpoint not enabled." });
        }
        if (needsMcpResource(ctx.path)) await ensureMcpResource(database.db);
        const registration = registrationWithApplicationType(ctx.path, ctx.body);
        if (registration) return { context: { body: registration } };
        const resetRequestPaths = ["/email-otp/request-password-reset"];
        const recoveryPaths = [...resetRequestPaths, "/email-otp/reset-password"];
        if (recoveryPaths.includes(ctx.path) && !z.email().safeParse(ctx.body?.email).success) {
          throw new APIError("BAD_REQUEST", { message: "Invalid email address." });
        }
        if (resetRequestPaths.includes(ctx.path)) {
          // Better Auth limits only per IP; each new code also resets the guess
          // budget, so cap sends per recipient as well.
          const { assertEmailVerificationSendAllowed, EmailVerificationRateLimitError } = await import("./email-verification-policy");
          const remoteIp = ctx.headers ? trustedClientIpFromHeaders(ctx.headers) : undefined;
          try {
            await assertEmailVerificationSendAllowed({ email: ctx.body.email, scope: "password-reset", ...(remoteIp ? { remoteIp } : {}) });
          } catch (error) {
            if (!(error instanceof EmailVerificationRateLimitError)) throw error;
            // Answer as if sent, matching the endpoint's own success body.
            return ctx.json({ success: true });
          }
        }
        if (["/sign-up/email", "/email-otp/reset-password", "/change-password"].includes(ctx.path)) {
          const password = ctx.body?.newPassword ?? ctx.body?.password;
          if (typeof password !== "string" || !meetsPasswordRequirements(password)) {
            throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" });
          }
        }
        // A new password ends every other session, whatever the client asked for.
        if (ctx.path === "/change-password") return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
        if (ctx.path !== "/sign-up/email") {
          return;
        }
        const token = typeof ctx.body?.turnstileToken === "string"
          ? ctx.body.turnstileToken
          : ctx.body?.["cf-turnstile-response"];
        const remoteIp = ctx.headers ? trustedClientIpFromHeaders(ctx.headers) : undefined;
        try {
          await verifyTurnstile({
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

export type Session = { user: { id: string; name?: string | null; email?: string | null; emailVerified?: boolean }; session: { id: string; userId: string; expiresAt: Date } } | null;

export async function getSession(headers: Headers): Promise<Session> {
  return (await getAuth().api.getSession({ headers })) as Session;
}
