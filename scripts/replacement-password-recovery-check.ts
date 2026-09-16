import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, desc, eq, like } from "drizzle-orm";
import { accounts, createDatabaseClient, outboxMessages, users, verifications } from "@lobbystack/db";
import { getAuth, getAuthDatabase } from "../apps/admin/src/lib/auth";
import { hashReplacementPassword } from "../apps/admin/src/lib/password";

// Source-level HTTP handler certification against a disposable PostgreSQL database.
// No provider or running worker is involved; reset emails remain in the test outbox.
assert(process.env.PASSWORD_RECOVERY_CERTIFICATION === "1", "Explicit disposable-database certification flag required.");
assert(new URL(process.env.DATABASE_URL!).pathname.startsWith("/parity_cert_"), "Use a disposable parity certification database.");
const database = createDatabaseClient("lobbystack_migrator");
const userId = randomUUID();
const email = `${userId}@password-recovery.invalid`;
const missingEmail = `${randomUUID()}@password-recovery.invalid`;
const oldPassword = "Recovery-Old-Password-123!";
const newPassword = "Recovery-New-Password-456!";
const origin = process.env.APP_BASE_URL ?? "http://localhost:3000";
let requestNumber = 0;
async function post(path: string, body: Record<string, string>) {
  return getAuth().handler(new Request(`${origin}/api/auth${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": `192.0.2.${++requestNumber}` }, body: JSON.stringify(body),
  })) as Promise<Response>;
}
async function requestCode() {
  const response = await post("/email-otp/request-password-reset", { email });
  assert.equal(response.status, 200, "Reset request failed");
  const row = (await database.db.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, userId)).orderBy(desc(outboxMessages.createdAt)).limit(1))[0];
  const code = (row?.payload.variables as { code?: string })?.code;
  assert.match(code ?? "", /^\d{6}$/);
  const stored = (await database.db.select().from(verifications).where(eq(verifications.identifier, `forget-password-otp-${email}`)).limit(1))[0];
  assert(stored && !stored.value.includes(code!), "OTP must be hashed in verification storage");
  return code!;
}
try {
  const password = await hashReplacementPassword(oldPassword);
  await database.db.insert(users).values({ id: userId, email, normalizedEmail: email, emailVerified: true, passwordHash: password });
  await database.db.insert(accounts).values({ userId, providerId: "credential", accountId: userId, password });
  const login = await post("/sign-in/email", { email, password: oldPassword });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.match(/((?:__Secure-)?better-auth\.session_token=[^;]+)/)?.[1];
  assert(cookie, "Fixture login session missing");
  const unknown = await post("/email-otp/request-password-reset", { email: missingEmail });
  assert.deepEqual(await unknown.json(), { success: true }, "Unknown email must receive the same response");
  const code = await requestCode();
  assert.equal((await post("/email-otp/reset-password", { email, otp: code, password: "weakpassword" })).status, 400, "Original password policy must be enforced");
  const bad = await post("/email-otp/reset-password", { email, otp: "not-a-code", password: newPassword });
  assert.equal(bad.status, 400);
  const reset = await post("/email-otp/reset-password", { email, otp: code, password: newPassword });
  assert.equal(reset.status, 200, "Valid reset failed");
  assert.equal((await post("/email-otp/reset-password", { email, otp: code, password: oldPassword })).status, 400, "Code must be single-use");
  assert.equal((await post("/sign-in/email", { email, password: oldPassword })).status, 401, "Old password must stop working");
  assert.equal((await post("/sign-in/email", { email, password: newPassword })).status, 200, "New password must work");
  const session = await getAuth().handler(new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }));
  assert.equal(await session.json(), null, "Pre-reset session must be revoked");
  const synced = (await database.db.select({ password: accounts.password, legacy: users.passwordHash }).from(accounts).innerJoin(users, eq(users.id, accounts.userId)).where(eq(users.id, userId)))[0];
  assert.equal(synced?.password, synced?.legacy, "Password lineage must remain synchronized");
  const expiredCode = await requestCode();
  await database.db.update(verifications).set({ expiresAt: new Date(0) }).where(eq(verifications.identifier, `forget-password-otp-${email}`));
  assert.equal((await post("/email-otp/reset-password", { email, otp: expiredCode, password: oldPassword })).status, 400, "Expired code must fail");
  const limitedCode = await requestCode();
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await post("/email-otp/reset-password", { email, otp: "wrong", password: newPassword })).status, 400);
  assert.equal((await post("/email-otp/reset-password", { email, otp: limitedCode, password: oldPassword })).status, 403, "Attempt limit must invalidate the code");
  for (const path of ["/sign-in/email-otp", "/email-otp/send-verification-otp", "/forget-password/email-otp"]) {
    assert.equal((await post(path, { email, otp: limitedCode, type: "sign-in" })).status, 404, "Unrequested passwordless endpoints must remain disabled");
  }
  console.log(JSON.stringify({ resetCodes: true, hashedStorage: true, enumerationSafeResponse: true, singleUse: true, expiredCodesRejected: true, attemptLimit: true, oldSessionsRevoked: true, credentialSynced: true, passwordlessDisabled: true }));
} finally {
  await database.db.delete(outboxMessages).where(eq(outboxMessages.aggregateId, userId));
  await database.db.delete(verifications).where(and(like(verifications.identifier, "%password-recovery.invalid"), like(verifications.identifier, `%${userId}%`)));
  await database.db.delete(users).where(eq(users.id, userId));
  await database.pool.end();
  await getAuthDatabase().pool.end();
}
process.exit(0);
