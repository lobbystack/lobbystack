import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agents, billingAccounts, businesses, businessNotifications, createDatabaseClient, numberTrials, numberWaitlist, onboardingNumberClaimEvents, onboardingPhoneVerifications, outboxMessages, phoneNumbers, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { convertNumberTrialInTransaction, enqueueRefusedCallForwardRefresh, getNumberTrialState, postNumberReleasedInTransaction, sweepNumberReleases, isNumberTrialEnded, joinNumberWaitlist, keepBusinessNumbersInTransaction, loadNumberTrialEmail, markNumberTrialMinutesExhausted, numberStepRedirect, refreshStaleRefusedCallForwards, resolveNumberFallback, resolveRefusedCallForward, sweepNumberTrial } from "./numberTrials";
import { claimNumberProvisioning, completeNumberProvisioning, failNumberProvisioning, reserveOnboardingNumberClaim, searchBusinessNumberInventory } from "./phoneNumbers";
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
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", emailVerified: true });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Trial clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "verify_phone", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      const owner = { userId, businessId };

      // A direct owner has no phone step, so the number step never sends them to one.
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: false }))).toBeNull();

      // An owner who verified a mobile before the phone step left still claims with it.
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
      // The attribution question follows the number; the plans come after Meet your agent.
      expect((await tx.select({ stage: businesses.onboardingStage }).from(businesses).where(eq(businesses.id, businessId)))[0]?.stage).toBe("attribution");
      expect((await tx.select({ reason: phoneNumbers.reclaimReason }).from(phoneNumbers).where(eq(phoneNumbers.id, phoneNumberId)))[0]?.reason).toBe("trial");
      expect((await tx.select({ transferNumber: agents.transferNumber }).from(agents).where(eq(agents.businessId, businessId)))[0]?.transferNumber).toBe(ownerPhone);
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

  it("starts a trial without a text when the email is verified and the network is clean", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      const network = "network-without-sms";
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", emailVerified: true });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "No-text clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "verify_phone", deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
      const owner = { userId, businessId };

      // The phone step has nothing to do: a verified email and a known network
      // are enough, so the number step opens directly.
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...owner, finished: false, ipHash: network, ipCountry: "CA" }))).toBeNull();
      expect(await as(tx, "lobbystack_app", db => getNumberTrialState({ db }, owner))).toEqual({ status: "available" });
      // The phone step passes on to the number step, as the dashboard does.
      await tx.update(businesses).set({ onboardingStage: "phone_number" }).where(eq(businesses.id, businessId));

      // The offer takes its country from the search, not from a phone.
      const search = await as(tx, "lobbystack_app", db => searchBusinessNumberInventory({ db }, { ...owner, claimTokenSecret, ipHash: network, ipCountry: "CA" }, inventory));
      expect(search).toMatchObject({ trial: true, countryFixed: false, market: { countryCode: "CA" } });

      const claimId = await as(tx, "lobbystack_app", db => reserveOnboardingNumberClaim({ db }, { ...owner, claimToken: search.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: network }));
      const [trial] = await tx.select({ id: numberTrials.id, verifiedPhone: numberTrials.verifiedPhone, ipHash: numberTrials.ipHash, status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.businessId, businessId));
      expect(trial).toMatchObject({ verifiedPhone: null, ipHash: network, status: "reserved" });

      // The worker buys it, and the agent keeps no transfer number to lock.
      await as(tx, "lobbystack_worker", async (db) => {
        expect(await claimNumberProvisioning({ db }, { businessId, claimId })).toBeTruthy();
        await completeNumberProvisioning({ db }, { businessId, claimId, e164: trialNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test", smsUrl: "https://example.invalid/sms" });
      });
      expect((await tx.select({ status: numberTrials.status }).from(numberTrials).where(eq(numberTrials.id, trial!.id)))[0]?.status).toBe("active");
      expect((await tx.select({ transferNumber: agents.transferNumber }).from(agents).where(eq(agents.businessId, businessId)))[0]?.transferNumber).toBeNull();
      expect(await as(tx, "lobbystack_worker", db => resolveNumberFallback({ db }, { businessId, e164: trialNumber }))).toEqual({ action: "reject" });

      // Out of minutes with nobody verified, calls stay unanswered and the email has no forward to name.
      expect(await as(tx, "lobbystack_worker", db => markNumberTrialMinutesExhausted({ db }, { businessId }))).toBe(true);
      expect(await as(tx, "lobbystack_worker", db => loadNumberTrialEmail({ db }, { businessId, trialId: trial!.id, email: "minutes_out" }))).toMatchObject({ trialNumber, forwardTo: null });
    });
  });

  it("asks for a mobile on a network that already started a trial, then lets the verified phone claim", async () => {
    await rollbackTest(async (tx) => {
      const network = "network-used-twice";
      const first = randomUUID();
      await tx.insert(users).values({ id: first, email: `${first}@example.invalid`, normalizedEmail: `${first}@example.invalid`, name: "First Owner", emailVerified: true });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId: firstBusiness } = await createBusiness({ db: tx as unknown as Database }, { userId: first, name: "First clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "phone_number", deploymentMode: "cloud" }).where(eq(businesses.id, firstBusiness));
      const firstOwner = { userId: first, businessId: firstBusiness };
      const firstSearch = await as(tx, "lobbystack_app", db => searchBusinessNumberInventory({ db }, { ...firstOwner, claimTokenSecret, ipHash: network, ipCountry: "CA" }, inventory));
      await as(tx, "lobbystack_app", db => reserveOnboardingNumberClaim({ db }, { ...firstOwner, claimToken: firstSearch.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: network }));

      const second = randomUUID();
      await tx.insert(users).values({ id: second, email: `${second}@example.invalid`, normalizedEmail: `${second}@example.invalid`, name: "Second Owner", emailVerified: true });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId: secondBusiness } = await createBusiness({ db: tx as unknown as Database }, { userId: second, name: "Second clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      await tx.update(businesses).set({ onboardingStage: "verify_phone", deploymentMode: "cloud" }).where(eq(businesses.id, secondBusiness));
      const secondOwner = { userId: second, businessId: secondBusiness };

      // A direct owner has no phone step, so the same network gets the plans.
      expect(await as(tx, "lobbystack_app", db => numberStepRedirect({ db }, { ...secondOwner, finished: false, ipHash: network, ipCountry: "CA" }))).toBeNull();
      await tx.update(businesses).set({ onboardingStage: "phone_number" }).where(eq(businesses.id, secondBusiness));
      await expect(as(tx, "lobbystack_app", db => searchBusinessNumberInventory({ db }, { ...secondOwner, claimTokenSecret, ipHash: network, ipCountry: "CA" }, inventory))).rejects.toMatchObject({ status: 429, code: "trial_ip_limited" });

      // A mobile verified before the phone step left is still the proof, and the trial records it.
      const { attemptId } = await as(tx, "lobbystack_app", db => startOnboardingPhoneVerification({ db }, { ...secondOwner, phoneE164: ownerPhone, countryCode: "CA" }, verify));
      await as(tx, "lobbystack_app", db => checkOnboardingPhoneVerificationCode({ db }, { ...secondOwner, attemptId, code: "123456" }, verify));
      const verifiedSearch = await as(tx, "lobbystack_app", db => searchBusinessNumberInventory({ db }, { ...secondOwner, claimTokenSecret, ipHash: network, ipCountry: "CA" }, inventory));
      expect(verifiedSearch.trial).toBe(true);
      const claimId = await as(tx, "lobbystack_app", db => reserveOnboardingNumberClaim({ db }, { ...secondOwner, claimToken: verifiedSearch.numbers[0]!.claimToken, claimTokenSecret, idempotencyKey: randomUUID(), ipHash: network }));
      expect(claimId).toBeTruthy();
      expect((await tx.select({ verifiedPhone: numberTrials.verifiedPhone, ipHash: numberTrials.ipHash }).from(numberTrials).where(eq(numberTrials.businessId, secondBusiness)))[0]).toEqual({ verifiedPhone: ownerPhone, ipHash: null });
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
      const setTransfer = (transferNumber: string | null) => tx.update(agents).set({ transferNumber }).where(eq(agents.businessId, businessId));

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

  it("re-routes only numbers on carriers that store the refused-call forward, when that forward goes stale", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", phone: ownerPhone, phoneVerifiedAt: new Date() });
      await tx.execute(sql`set local role lobbystack_app`);
      const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Two carrier clinic", timezone: "America/Toronto", businessType: "test" });
      await tx.execute(sql`reset role`);
      const telnyxNumber = "+14165550125";
      const [telnyx] = await tx.insert(phoneNumbers).values({ businessId, e164: telnyxNumber, providerPhoneId: `tx-${randomUUID()}`, carrier: "telnyx" }).returning({ id: phoneNumbers.id });
      await tx.insert(phoneNumbers).values({ businessId, e164: "+14165550126", providerPhoneId: `PN${randomUUID().replaceAll("-", "")}` });
      const routeJobs = async () => (await tx.select({ aggregateId: outboxMessages.aggregateId }).from(outboxMessages).where(sql`${outboxMessages.businessId} = ${businessId} and ${outboxMessages.topic} = 'phoneNumber.route'`)).map((row) => row.aggregateId);
      const refresh = () => as(tx, "lobbystack_worker", db => refreshStaleRefusedCallForwards({ db }, { businessId }));

      // A line that forwarded the call here is never the forward either.
      expect(await as(tx, "lobbystack_worker", db => resolveRefusedCallForward({ db }, { businessId, e164: telnyxNumber }))).toBe(ownerPhone);
      expect(await as(tx, "lobbystack_worker", db => resolveRefusedCallForward({ db }, { businessId, e164: telnyxNumber, forwardedFrom: ownerPhone }))).toBeNull();

      // Telnyx hasn't been told the owner's phone yet; Twilio asks the webhook on each call, so its number is left alone.
      expect(await refresh()).toBe(1);
      expect(await routeJobs()).toEqual([telnyx!.id]);

      await tx.update(phoneNumbers).set({ refusedCallsForwardTo: ownerPhone }).where(eq(phoneNumbers.id, telnyx!.id));
      expect(await refresh()).toBe(0);

      // A new owner phone makes the stored forward stale again.
      await tx.update(users).set({ phone: "+14165550112" }).where(eq(users.id, userId));
      expect(await refresh()).toBe(1);

      await tx.delete(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      await enqueueRefusedCallForwardRefresh(tx, businessId);
      expect(await routeJobs()).toEqual([telnyx!.id]);
    });
  });

  it("converts a trial whose number finishes buying after the owner paid", async () => {
    await rollbackTest(async (tx) => {
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", emailVerified: true });
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

/** The bell's rows for a business, oldest first. */
async function bell(tx: DatabaseTransaction, businessId: string) {
  return await tx.select({ kind: businessNotifications.kind, key: businessNotifications.dedupeKey, params: businessNotifications.params, resolved: businessNotifications.resolvedAt }).from(businessNotifications).where(eq(businessNotifications.businessId, businessId)).orderBy(asc(businessNotifications.createdAt), asc(businessNotifications.dedupeKey));
}
const open = (rows: Awaited<ReturnType<typeof bell>>) => rows.filter((row) => !row.resolved).map((row) => row.key);

/** A direct cloud business with an active trial number that ends at `endsAt`. */
async function activeTrial(tx: DatabaseTransaction, endsAt: Date) {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee", emailVerified: true });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Bell clinic", timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ deploymentMode: "cloud", onboardingStage: "complete" }).where(eq(businesses.id, businessId));
  const [number] = await tx.insert(phoneNumbers).values({ businessId, e164: trialNumber, providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, status: "active", reclaimScheduledAt: new Date(endsAt.getTime() + 14 * 86_400_000), reclaimReason: "trial" }).returning({ id: phoneNumbers.id });
  const [trial] = await tx.insert(numberTrials).values({ businessId, userId, phoneNumberId: number!.id, verifiedPhone: ownerPhone, status: "active", startedAt: new Date(endsAt.getTime() - 14 * 86_400_000), endsAt }).returning({ id: numberTrials.id });
  return { userId, businessId, phoneNumberId: number!.id, trialId: trial!.id };
}

describe.skipIf(!testUrl)("the bell's trial and number notifications", () => {
  it("posts the 4-day and 1-day reminders, then the ended trial, and a paid plan clears them", async () => {
    await rollbackTest(async (tx) => {
      const endsAt = new Date("2030-01-15T05:00:00.000Z");
      const { businessId, trialId } = await activeTrial(tx, endsAt);
      const sweep = (now: Date) => as(tx, "lobbystack_worker", (db) => sweepNumberTrial({ db }, { businessId, now }));

      expect((await sweep(new Date(endsAt.getTime() - 4 * 86_400_000))).emails).toEqual(["day10"]);
      expect(await bell(tx, businessId)).toEqual([{ kind: "trial_ending", key: `trial_ending:${trialId}:4`, params: { days: 4 }, resolved: null }]);
      // Running again the same hour posts nothing new.
      expect((await sweep(new Date(endsAt.getTime() - 4 * 86_400_000 + 3_600_000))).emails).toEqual([]);

      expect((await sweep(new Date(endsAt.getTime() - 86_400_000))).emails).toEqual(["day13"]);
      let rows = await bell(tx, businessId);
      expect(open(rows)).toEqual([`trial_ending:${trialId}:1`]);
      expect(rows.find((row) => row.key === `trial_ending:${trialId}:1`)?.params).toEqual({ days: 1 });

      expect(await sweep(new Date(endsAt.getTime() + 26 * 3_600_000))).toEqual({ ended: true, emails: ["ended"] });
      rows = await bell(tx, businessId);
      expect(open(rows)).toEqual([`trial_ended:${trialId}`]);
      expect(rows.filter((row) => row.kind === "trial_ending").every((row) => row.resolved)).toBe(true);

      await as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => keepBusinessNumbersInTransaction(inner, { businessId })));
      expect(open(await bell(tx, businessId))).toEqual([]);
    });
  });

  it("posts used-up trial minutes once, and converting the trial clears it", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, trialId } = await activeTrial(tx, new Date(Date.now() + 5 * 86_400_000));
      expect(await as(tx, "lobbystack_worker", (db) => markNumberTrialMinutesExhausted({ db }, { businessId }))).toBe(true);
      expect(await as(tx, "lobbystack_worker", (db) => markNumberTrialMinutesExhausted({ db }, { businessId }))).toBe(false);
      expect(open(await bell(tx, businessId))).toEqual([`trial_minutes_used_up:${trialId}`]);
      await as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => convertNumberTrialInTransaction(inner, { businessId })));
      expect(open(await bell(tx, businessId))).toEqual([]);
    });
  });

  it("warns before releasing a number whose plan ended, and a paid plan clears the warning", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, phoneNumberId } = await activeTrial(tx, new Date(Date.now() + 5 * 86_400_000));
      const releaseAt = new Date("2030-02-01T12:00:00.000Z");
      await tx.update(numberTrials).set({ status: "converted" }).where(eq(numberTrials.businessId, businessId));
      await tx.update(phoneNumbers).set({ reclaimScheduledAt: releaseAt, reclaimReason: "subscription_ended" }).where(eq(phoneNumbers.id, phoneNumberId));
      const sweep = () => as(tx, "lobbystack_worker", (db) => sweepNumberReleases({ db }, { businessId, now: new Date(releaseAt.getTime() - 2 * 86_400_000) }));
      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(1);
      expect(await bell(tx, businessId)).toEqual([{ kind: "number_release_soon", key: `number_release_soon:${phoneNumberId}:2030-02-01`, params: { number: trialNumber, releaseAt: releaseAt.toISOString() }, resolved: null }]);
      await as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => keepBusinessNumbersInTransaction(inner, { businessId })));
      expect(open(await bell(tx, businessId))).toEqual([]);
    });
  });

  it("posts a released number in place of the trial's items, a failed purchase, and clears both once a number is bought", async () => {
    await rollbackTest(async (tx) => {
      const { userId, businessId, phoneNumberId, trialId } = await activeTrial(tx, new Date(Date.now() - 86_400_000));
      await as(tx, "lobbystack_worker", (db) => sweepNumberTrial({ db }, { businessId }));
      expect(open(await bell(tx, businessId))).toEqual([`trial_ended:${trialId}`]);

      await as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => postNumberReleasedInTransaction(inner, { businessId, phoneNumberId, e164: trialNumber, trial: true })));
      let rows = await bell(tx, businessId);
      expect(open(rows)).toEqual([`number_released:${phoneNumberId}`]);
      expect(rows.find((row) => row.kind === "number_released")?.params).toEqual({ number: trialNumber, trial: true });

      const claim = async (requestedE164: string) => (await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId, requestedE164, selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning" }).returning({ id: onboardingNumberClaimEvents.id }))[0]!.id;
      const failed = await claim("+14165550177");
      await as(tx, "lobbystack_worker", (db) => failNumberProvisioning({ db }, { businessId, claimId: failed, unavailable: true }));
      rows = await bell(tx, businessId);
      expect(rows.find((row) => row.kind === "number_purchase_failed")).toEqual({ kind: "number_purchase_failed", key: `number_purchase_failed:${failed}`, params: { number: "+14165550177", unavailable: true }, resolved: null });

      const bought = await claim("+14165550188");
      await as(tx, "lobbystack_worker", (db) => completeNumberProvisioning({ db }, { businessId, claimId: bought, e164: "+14165550188", providerPhoneId: `PN${randomUUID().replaceAll("-", "")}`, voiceUrl: "sip-trunk:TK-test" }));
      expect(open(await bell(tx, businessId))).toEqual([]);
    });
  });
});
