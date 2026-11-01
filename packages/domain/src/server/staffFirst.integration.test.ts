import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { billingAccounts, billingUsageEvents, businessHours, businessMemberships, businesses, calls, contacts, createDatabaseClient, numberTrials, outboxMessages, phoneNumbers, receptionistProfiles, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { getAnalytics } from "./analytics";
import { refreshBusinessSnapshot } from "./knowledge";
import { desiredNumberRouting, loadNumberTrialEmail } from "./numberTrials";
import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
import { decideStaffFirstCall, recordStaffAnsweredCall } from "./staffFirst";
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

const staffPhone = "+14165550142";
const lobbyNumber = "+14165550123";

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
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_worker", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw(`set local session authorization ${role}`));
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

async function business(tx: DatabaseTransaction, input: { plan?: "free_cloud" | "starter"; carrier?: string } = {}): Promise<string> {
  const userId = randomUUID();
  await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Lee" });
  await tx.execute(sql`set local role lobbystack_app`);
  const { businessId } = await createBusiness({ db: tx as unknown as Database }, { userId, name: "Harbor dental", timezone: "America/Toronto", businessType: "test" });
  await tx.execute(sql`reset role`);
  await tx.update(businesses).set({ deploymentMode: "cloud" }).where(eq(businesses.id, businessId));
  const plan = input.plan ?? "starter";
  await tx.insert(billingAccounts).values({ businessId, billingKey: `business:${businessId}`, plan, subscriptionState: plan === "starter" ? "active" : null }).onConflictDoUpdate({ target: billingAccounts.businessId, set: { plan, subscriptionState: plan === "starter" ? "active" : null } });
  if (input.carrier) await tx.insert(phoneNumbers).values({ businessId, e164: lobbyNumber, status: "active", carrier: input.carrier, providerPhoneId: `PN${randomUUID()}` });
  return businessId;
}

const save = (tx: DatabaseTransaction, businessId: string, patch: Parameters<typeof saveReceptionistProfileInTransaction>[1]["patch"]) => saveReceptionistProfileInTransaction(tx, { businessId, businessName: "Harbor dental", patch });

describe.skipIf(!testUrl)("staff answers first against PostgreSQL", () => {
  it("saves the settings on a paid plan and queues a routing job for each Twilio number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      const profile = await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      expect(profile).toMatchObject({ staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      const jobs = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      expect(jobs.map((job) => job.topic)).toContain("phoneNumber.route");
    });
  });

  it("refuses a Free business", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "free_cloud", carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 402, code: "staff_first_plan_required" });
    });
  });

  it("refuses a business with only Telnyx numbers", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "telnyx" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 409, code: "staff_first_carrier_unsupported" });
    });
  });

  it("needs a staff phone, and refuses the business's own number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "business_hours" })).rejects.toMatchObject({ code: "staff_first_number_required" });
      await expect(save(tx, businessId, { staffFirstNumber: lobbyNumber })).rejects.toMatchObject({ code: "staff_first_number_own_line" });
    });
  });

  it("keeps a removed staff phone from leaving the setting on", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone });
      await expect(save(tx, businessId, { staffFirstNumber: null })).rejects.toMatchObject({ code: "staff_first_number_required" });
      expect((await tx.select({ number: receptionistProfiles.staffFirstNumber }).from(receptionistProfiles).where(eq(receptionistProfiles.businessId, businessId)))[0]?.number).toBe(staffPhone);
    });
  });

  it("routes a number to staff_first while the setting is on, and a trial's fallback wins", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      const [number] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
      const desired = () => desiredNumberRouting({ db: tx as unknown as Database }, { businessId, phoneNumberId: number!.id });
      expect((await desired())?.mode).toBe("receptionist");
      await save(tx, businessId, { staffFirstMode: "business_hours", staffFirstNumber: staffPhone });
      expect((await desired())?.mode).toBe("staff_first");
      await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "ended", phoneNumberId: number!.id, verifiedPhone: staffPhone });
      expect((await desired())?.mode).toBe("fallback");
    });
  });

  it("leaves a Telnyx number on the receptionist", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "telnyx" });
      const [number] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
      await tx.update(receptionistProfiles).set({ staffFirstMode: "always", staffFirstNumber: staffPhone }).where(eq(receptionistProfiles.businessId, businessId));
      expect((await desiredNumberRouting({ db: tx as unknown as Database }, { businessId, phoneNumberId: number!.id }))?.mode).toBe("receptionist");
    });
  });

  describe("decideStaffFirstCall", () => {
    // Monday 2026-11-02 at 10:00 and 20:00 in Toronto.
    const open = new Date("2026-11-02T15:00:00Z");
    const closed = new Date("2026-11-03T01:00:00Z");
    const context = (tx: DatabaseTransaction) => ({ db: tx as unknown as Database });

    async function configured(tx: DatabaseTransaction, mode: "business_hours" | "always", plan: "free_cloud" | "starter" = "starter") {
      const businessId = await business(tx, { carrier: "twilio" });
      await save(tx, businessId, { staffFirstMode: mode, staffFirstNumber: staffPhone, staffFirstMessage: "One moment." });
      if (plan === "free_cloud") await tx.update(billingAccounts).set({ plan, subscriptionState: null }).where(eq(billingAccounts.businessId, businessId));
      await tx.insert(businessHours).values({ businessId, dayOfWeek: 1, openMinutes: 540, closeMinutes: 1020 });
      await refreshBusinessSnapshot(context(tx), { businessId });
      return businessId;
    }

    it("rings during hours and goes to the receptionist outside them", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "business_hours");
        const decide = (now: Date) => decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: `CA${now.getTime()}`, from: "+14165550134", now });
        expect(await decide(open)).toEqual({ action: "ring", locale: "en", phone: staffPhone, ringSeconds: 15, message: "One moment." });
        expect(await decide(closed)).toEqual({ action: "receptionist", locale: "en" });
      });
    });

    it("uses one transfer attempt per ring, however often Twilio repeats the webhook", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open });
        await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open });
        await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA2", now: open });
        const attempts = await tx.select({ sourceKey: billingUsageEvents.sourceKey }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.usageKind, "outbound_call_attempts")));
        expect(attempts.map((attempt) => attempt.sourceKey).sort()).toEqual(["staff_ring:CA1", "staff_ring:CA2"]);
      });
    });

    it("skips the ring and spends no attempt outside the hours", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "business_hours");
        await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", now: closed });
        expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toEqual([]);
      });
    });

    it("rejects a blocked caller", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await tx.insert(contacts).values({ businessId, phone: "+14165550134", operatorBlockedAt: new Date() });
        expect(await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", from: "+14165550134", now: open })).toEqual({ action: "reject" });
      });
    });

    it("rejects a call on an ended trial", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "ended", verifiedPhone: staffPhone });
        expect(await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open })).toEqual({ action: "reject" });
      });
    });

    it("won't ring the line that forwarded the call here", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        expect(await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", forwardedFrom: staffPhone, now: open })).toEqual({ action: "receptionist", locale: "en" });
      });
    });

    it("stops ringing a business that fell back to Free", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always", "free_cloud");
        expect(await decideStaffFirstCall(context(tx), { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open })).toEqual({ action: "receptionist", locale: "en" });
      });
    });
  });

  describe("recordStaffAnsweredCall", () => {
    const context = (tx: DatabaseTransaction) => ({ db: tx as unknown as Database });
    const endedAt = new Date("2026-11-02T15:00:42Z");
    const answered = (tx: DatabaseTransaction, businessId: string, from?: string) => recordStaffAnsweredCall(context(tx), { businessId, providerCallId: "CA1", to: lobbyNumber, seconds: 42, endedAt, ...(from ? { from } : {}) });

    it("records the call once, against the caller's contact, with no minutes or conversation", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId, "+14165550134");
        await answered(tx, businessId, "+14165550134");
        const rows = await tx.select().from(calls).where(eq(calls.businessId, businessId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ provider: "staff_answered", providerCallId: "CA1", transport: "voice", carrier: "twilio", status: "completed", disposition: "answered_by_team", billingExcluded: true, conversationId: null, mediaStartedAt: null, providerDurationSeconds: 42, startedAt: new Date("2026-11-02T15:00:00Z"), endedAt });
        const [contact] = await tx.select({ phone: contacts.phone }).from(contacts).where(eq(contacts.id, rows[0]!.contactId!));
        expect(contact?.phone).toBe("+14165550134");
        expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toEqual([]);
        const jobs = await tx.select({ topic: outboxMessages.topic, payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "call.syncPrice")));
        expect(jobs).toEqual([{ topic: "call.syncPrice", payload: { providerCallId: "CA1", providerCallStatus: "completed" } }]);
      });
    });

    it("gives a withheld caller a contact of their own", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId);
        const [call] = await tx.select({ contactId: calls.contactId }).from(calls).where(eq(calls.businessId, businessId));
        expect(call?.contactId).toBeTruthy();
      });
    });

    it("stays out of analytics", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId, "+14165550134");
        await tx.insert(calls).values({ businessId, provider: "openai_live", providerCallId: "session_1", transport: "voice", status: "completed", startedAt: new Date("2026-11-02T14:00:00Z"), endedAt: new Date("2026-11-02T14:05:00Z") });
        const [member] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
        const analytics = await getAnalytics(context(tx), { userId: member!.userId, businessId, from: new Date("2026-11-01T00:00:00Z"), previousFrom: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-03T00:00:00Z"), granularity: "day" });
        expect(analytics.calls.current).toBe(1);
      });
    });

    it("stays out of the trial's answered call count", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        const [number] = await tx.select({ id: phoneNumbers.id }).from(phoneNumbers).where(eq(phoneNumbers.businessId, businessId));
        const [trial] = await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "active", phoneNumberId: number!.id, verifiedPhone: staffPhone, startedAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-15T00:00:00Z") }).returning({ id: numberTrials.id });
        await answered(tx, businessId, "+14165550134");
        await tx.insert(calls).values({ businessId, provider: "openai_live", providerCallId: "session_1", transport: "voice", status: "completed", startedAt: new Date("2026-11-02T14:00:00Z"), endedAt: new Date("2026-11-02T14:05:00Z") });
        expect((await as(tx, "lobbystack_worker", (db) => loadNumberTrialEmail({ db }, { businessId, trialId: trial!.id, email: "day10" })))?.callsAnswered).toBe(1);
      });
    });
  });

  it("rejects an unknown mode at the database", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx);
      await save(tx, businessId, { greeting: "Hello." });
      await expect(tx.transaction(async (nested) => { await nested.execute(sql`update receptionist_profiles set staff_first_mode = 'weekends' where business_id = ${businessId}::uuid`); })).rejects.toThrow();
    });
  });
});
