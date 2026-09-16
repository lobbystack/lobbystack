import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { accounts, createDatabaseClient, outboxMessages, users } from "@lobbystack/db";
import { getAuth, getAuthDatabase } from "../apps/admin/src/lib/auth";
import { hashReplacementPassword } from "../apps/admin/src/lib/password";

assert(process.env.PASSWORD_RECOVERY_CERTIFICATION === "1", "Disposable database certification must be enabled.");
assert(new URL(process.env.DATABASE_URL!).pathname.startsWith("/parity_cert_"), "A disposable parity database is required.");
const database = createDatabaseClient("lobbystack_migrator");
const id = randomUUID();
const otherId = randomUUID();
const email = `${id}@email-change.invalid`;
const newEmail = `new-${id}@email-change.invalid`;
const otherEmail = `${otherId}@email-change.invalid`;
const password = "Email-Change-Password-123!";
const origin = process.env.APP_BASE_URL ?? "http://localhost:3000";
async function post(path: string, body: Record<string, string>, cookie = "") {
  return getAuth().handler(new Request(`${origin}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify(body) })) as Promise<Response>;
}
async function login(address: string) {
  const response = await post("/sign-in/email", { email: address, password });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.match(/((?:__Secure-)?better-auth\.session_token=[^;]+)/)?.[1];
  assert(cookie, "Fixture cookie missing"); return cookie;
}
async function queuedEmail() {
  const row = (await database.db.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, id)).orderBy(desc(outboxMessages.createdAt)).limit(1))[0];
  assert(row, "Verification email not queued");
  const url = (row.payload.variables as { url?: string })?.url;
  assert(url, "Verification URL missing");
  return { to: row.payload.to, url: new URL(url) };
}
try {
  const hash = await hashReplacementPassword(password);
  for (const [userId, address] of [[id, email], [otherId, otherEmail]] as const) {
    await database.db.insert(users).values({ id: userId, email: address, normalizedEmail: address, emailVerified: true, passwordHash: hash });
    await database.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password: hash });
  }
  const cookie = await login(email);
  const otherCookie = await login(otherEmail);
  assert.equal((await post("/change-email", { newEmail, callbackURL: "/settings/account" }, cookie)).status, 200);
  const approval = await queuedEmail();
  assert.equal(approval.to, email, "Current address must approve the change first");
  assert.equal((await database.db.select().from(users).where(eq(users.id, id)))[0]?.email, email);
  const approved = await getAuth().handler(new Request(approval.url, { headers: { cookie } }));
  assert([200, 302].includes(approved.status), "Current-address approval failed");
  const verification = await queuedEmail();
  assert.equal(verification.to, newEmail, "New address must receive its own verification");
  assert.equal(verification.url.pathname, "/confirm-email-change", "Final verification must open the original confirmation UI");
  assert.equal(verification.url.searchParams.get("email"), newEmail);
  assert.equal((await database.db.select().from(users).where(eq(users.id, id)))[0]?.email, email, "Approval alone must not change the email");
  const token = verification.url.searchParams.get("token");
  assert(token);
  const verifyUrl = `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  assert.equal((await getAuth().handler(new Request(verifyUrl, { headers: { cookie: otherCookie } }))).status, 401, "Another signed-in account cannot consume this token");
  const confirmed = await getAuth().handler(new Request(verifyUrl, { headers: { cookie } }));
  assert.equal(confirmed.status, 200, "Final verification failed");
  assert.equal((await confirmed.json()).user.email, newEmail);
  const stored = (await database.db.select().from(users).where(eq(users.id, id)))[0];
  assert.equal(stored?.email, newEmail);
  assert.equal(stored?.normalizedEmail, newEmail, "Normalized identity must follow verified email changes");
  assert.equal((await getAuth().handler(new Request(verifyUrl, { headers: { cookie } }))).status, 401, "A consumed email-change token must not replay");
  assert.equal((await post("/sign-in/email", { email, password })).status, 401);
  assert.equal((await post("/sign-in/email", { email: newEmail, password })).status, 200);
  console.log(JSON.stringify({ currentAddressApproval: true, newAddressVerification: true, originalConfirmationRoute: true, otherAccountRejected: true, replayRejected: true, normalizedIdentityUpdated: true, newEmailLogin: true }));
} finally {
  await database.db.delete(outboxMessages).where(inArray(outboxMessages.aggregateId, [id, otherId]));
  await database.db.delete(users).where(inArray(users.id, [id, otherId]));
  await database.pool.end();
  await getAuthDatabase().pool.end();
}
process.exit(0);
