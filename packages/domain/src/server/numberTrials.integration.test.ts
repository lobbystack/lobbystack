import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, businesses, createDatabaseClient, numberTrials, numberWaitlist, onboardingPhoneVerifications, outboxMessages, phoneNumbers, receptionistProfiles, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { getNumberTrialState, isNumberTrialEnded, joinNumberWaitlist, keepBusinessNumbersInTransaction, loadNumberTrialEmail, markNumberTrialMinutesExhausted, numberStepRedirect, resolveNumberFallback, sweepNumberTrial } from "./numberTrials";
import { claimNumberProvisioning, completeNumberProvisioning, reserveOnboardingNumberClaim, searchBusinessNumberInventory } from "./phoneNumbers";
import { checkOnboardingPhoneVerificationCode, startOnboardingPhoneVerification } from "./phoneVerification";
import { createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Reliability integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

const claimTokenSecret = "number-trial-test-secret";
const ownerPhone = "+14165550111";
const trialNumber = "+14165550123";
const verify = { lookupLineType: async () => "mobile", sendCode: async () => ({ sid: "VE-test" }), checkCode: async () => "approved" };
const inventory = { listAvailablePhoneNumbers: async () => [{ phoneE164: trialNumber, countryCode: "CA", capabilities: { sms: false, voice: true } }] };

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

// Security-definer functions trust session_user, so switch it rather than the current role.
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

describe.skipIf(!testUrl)("free trial numbers against dedicated PostgreSQL roles", () => {
  it("runs a trial from the verified phone to the end of day 14, then keeps the number when the owner pays", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Trial clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "verify_phone", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      const owner = { userId, businessId };

      // Without a verified mobile, the number step sends the owner to verify one first.
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: false }))).toBe("/onboarding/verify-phone");

      // The owner verifies a mobile, and onboarding moves on to the number step.
      const { attemptId } = await as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { ...owner, phoneE164: ownerPhone, countryCode: "CA" }, verify));
      expect(await as(tx, "lobbystack_app", db => checkOnboardingPhoneVerificationCode({ db }, { ...owner, attemptId, code: "123456" }, verify))).toMatchObject({ approved: true });
      expect((await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage).toBe("phone_number");
      expect(await as(tx, "lobbystack_app", db => getNumberTrialState({ db }, owner))).toEqual({ status: "available" });
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: false }))).toBeNull();

      // The number they pick is a trial, and the worker buys it.
      const claimId = await as(tx, "lobbystack_app", async (db) => {
        const search = await searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret }, inventory);
        expect(search.trial).toBe(true);
        return await reserveOnboardingNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: "network-1" });
      });
      const phoneNumberId = await as(tx, "lobbystack_worker", async (db) => {
        expect(await claimNumberProvisioning({ db }, { businessId, claimId })).toBeTruthy();
        return await completeNumberProvisioning({ db }, { businessId, claimId, e164: trialNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test", smsUrl: "https://example.invalid/sms" });
      });
      const [trial] = await tx.select({ id: numberTrials.id, status: numberTrials.status, endsAt: numberTrials.endsAt }).from(numberTrials).where(eq(numberTrials.businessId, businessId));
      expect(trial?.status).toBe("active");
      expect((await tx.select({ reason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0]?.reason).toBe("trial");
      expect((await tx.select({ transferNumber: receptionistProfiles.transferNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)))[0]?.transferNumber).toBe(ownerPhone);
      expect(await as(tx, "lobbystack_app", db => getNumberTrialState({ db }, owner))).toMatchObject({ status: "active", e164: trialNumber, minutesExhausted: false });
      // Once onboarding is done, a workspace with a number has nothing to do on the number step.
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: true }))).toBe("/");
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: false }))).toBeNull();

      // A second workspace for the same owner doesn't offer another free number.
      await tx.execute(sql`set local role lobbystack_app`);
      const second = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Second clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, second.businessId));
      expect(await as(tx, "lobbystack_app", db => getNumberTrialState({ db }, { userId, businessId: second.businessId }))).toEqual({ status: "none" });

      // Out of minutes: calls ring the owner, who gets one email about it.
      expect(await as(tx, "lobbystack_worker", db => markNumberTrialMinutesExhausted({ db }, { businessId }))).toBe(true);
      expect(await as(tx, "lobbystack_worker", db => resolveNumberFallback({ db }, { businessId, e164: trialNumber }))).toEqual({ action: "forward", to: ownerPhone });
      expect(await as(tx, "lobbystack_worker", db => loadNumberTrialEmail({ db }, { businessId, trialId: trial!.id, email: "minutes_out" }))).toMatchObject({ to: `${userId}@example.invalid`, firstName: "Sam", trialNumber, forwardTo: ownerPhone, callsAnswered: 0 });

      // The day after the trial ends, the number stops answering and the day-15 email goes out.
      const dayAfter = new Date(trial!.endsAt!.getTime() + 26 * 3_600_000);
      expect(await as(tx, "lobbystack_worker", db => sweepNumberTrial({ db }, { businessId, now: dayAfter }))).toEqual({ ended: true, emails: ["ended"] });
      expect(await as(tx, "lobbystack_worker", db => isNumberTrialEnded({ db }, { businessId }))).toBe(true);
      expect(await as(tx, "lobbystack_worker", db => resolveNumberFallback({ db }, { businessId, e164: trialNumber }))).toEqual({ action: "reject" });
      expect(await as(tx, "lobbystack_app", db => getNumberTrialState({ db }, { ...owner, now: dayAfter }))).toEqual({ status: "ended", e164: trialNumber });
      const topics = (await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId))).map(row => row.topic);
      expect(topics.filter(topic => topic === "numberTrial.sendEmail")).toHaveLength(2);
      expect(topics.filter(topic => topic === "phoneNumber.route")).toHaveLength(2);

      // Paying keeps the number and clears its release.
      await as(tx, "lobbystack_worker", db => withBusinessTransaction(db, { businessId, actorType: "worker" }, inner => keepBusinessNumbersInTransaction(inner, { businessId })));
      expect((await tx.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.id, trial!.id)))[0]?.status).toBe("converted");
      expect((await tx.select({ reason: phoneNumbers.reclaimReason, at: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0]).toEqual({ reason: null, at: null });
    });
  });

  it("forwards a paid business's refused calls to its transfer number, then the owner's verified phone, and rejects with neither", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", phone: ownerPhone });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Capped clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      const number = "+14165550124";
      await tx.insert(phoneNumbers).values({ businessId, e164: number, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}` });
      const fallback = () => as(tx, "lobbystack_worker", db => resolveNumberFallback({ db }, { businessId, e164: number }));
      const setTransfer = (transferNumber: string | null) => tx.update(receptionistProfiles).set({ transferNumber }).where(eq(receptionistProfiles.businessId, businessId));

      // An owner phone nobody verified is never a forward.
      await setTransfer(null);
      expect(await fallback()).toEqual({ action: "reject" });

      await tx.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.id, userId));
      expect(await fallback()).toEqual({ action: "forward", to: ownerPhone });

      await setTransfer("+14165550199");
      expect(await fallback()).toEqual({ action: "forward", to: "+14165550199" });

      // A transfer number that is the dialled number itself would loop, so the owner's phone takes it.
      await setTransfer(number);
      expect(await fallback()).toEqual({ action: "forward", to: ownerPhone });

      // The worker reads the owner's phone only for the business its transaction is bound to.
      const other = await as(tx, "lobbystack_worker", db => withBusinessTransaction(db, { businessId: randomUUID(), actorType: "worker" }, async inner => (await inner.execute<{ phone: string | null }>(sql`select app.resolve_business_owner_verified_phone(${businessId}::uuid) as phone`)).rows[0]?.phone));
      expect(other).toBeNull();
    });
  });

  it("converts a trial whose number finishes buying after the owner paid", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Paying clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "verify_phone", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      const owner = { userId, businessId };
      const { attemptId } = await as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { ...owner, phoneE164: ownerPhone, countryCode: "CA" }, verify));
      await as(tx, "lobbystack_app", db => checkOnboardingPhoneVerificationCode({ db }, { ...owner, attemptId, code: "123456" }, verify));
      const claimId = await as(tx, "lobbystack_app", async (db) => {
        const search = await searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret }, inventory);
        return await reserveOnboardingNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: "network-2" });
      });
      // The payment lands while the number is still being bought, so it finds no trial to convert.
      await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan: "starter", subscriptionState: "active" }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan: "starter", subscriptionState: "active" } });
      const phoneNumberId = await as(tx, "lobbystack_worker", async (db) => {
        expect(await claimNumberProvisioning({ db }, { businessId, claimId })).toBeTruthy();
        return await completeNumberProvisioning({ db }, { businessId, claimId, e164: trialNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test", smsUrl: "https://example.invalid/sms" });
      });
      expect((await tx.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, businessId)))[0]?.status).toBe("converted");
      expect((await tx.select({ reason: phoneNumbers.reclaimReason, at: phoneNumbers.reclaimScheduledAt }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0]).toEqual({ reason: null, at: null });
    });
  });

  it("counts a refused internet number against the rate limit, and looks a number up only within it", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "VoIP clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      const lookups: string[] = [];
      const voip = { ...verify, lookupLineType: async (phone: string) => { lookups.push(phone); return "nonFixedVoip"; } };
      const start = (phoneE164: string) => as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { userId, businessId, phoneE164, countryCode: "CA" }, voip));
      // A country without numbers gets no text, whatever the client sends.
      await expect(as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { userId, businessId, phoneE164: "+33612345678", countryCode: "FR" }, voip))).rejects.toMatchObject({ code: "phone_country_unsupported" });
      for (let index = 0; index < 5; index += 1) await expect(start(`+1416555020${index}`)).rejects.toMatchObject({ code: "phone_voip_refused" });
      // The sixth attempt this hour is refused before any paid lookup.
      await expect(start("+14165550209")).rejects.toMatchObject({ code: "verification_rate_limited" });
      expect(lookups).toHaveLength(5);
    });
  });

  it("keeps a sent code when a later number is refused, and doesn't count a lookup that errors", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Retry clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      const start = (phoneE164: string, provider: typeof verify) => as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { userId, businessId, phoneE164, countryCode: "CA" }, provider));
      const { attemptId } = await start(ownerPhone, verify);
      await expect(start("+14165550301", { ...verify, lookupLineType: async () => "nonFixedVoip" })).rejects.toMatchObject({ code: "phone_voip_refused" });
      // Without dropping the errored attempts, the second retry would hit the 30-second cooldown.
      const outage = { ...verify, lookupLineType: async () => { throw new Error("Lookup unavailable"); } };
      for (let index = 0; index < 4; index += 1) await expect(start("+14165550302", outage)).rejects.toThrow("Lookup unavailable");
      const rows = await tx.select({ id: onboardingPhoneVerifications.id, status: onboardingPhoneVerifications.status }).from(onboardingPhoneVerifications).where(eq(onboardingPhoneVerifications.userId, userId));
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.id === attemptId)?.status).toBe("pending");
    });
  });

  it("puts an owner in a country without numbers on the waitlist once", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Ana" });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Lisbon clinic", timezone: "Europe/Lisbon", businessType: "test" });
      await tx.execute(sql`reset role`);
      await as(tx, "lobbystack_app", async (db) => {
        await joinNumberWaitlist({ db }, { userId, businessId, countryCode: "pt" });
        await joinNumberWaitlist({ db }, { userId, businessId, countryCode: "PT" });
      });
      expect(await tx.select({ countryCode: numberWaitlist.countryCode }).from(numberWaitlist).where(eq(numberWaitlist.businessId, businessId))).toEqual([{ countryCode: "PT" }]);
    });
  });
});
