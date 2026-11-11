import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCallSchema } from "@lobbystack/shared";
import { agents, billingAccounts, billingUsageEvents, businessHours, businessMemberships, businesses, calls, contacts, createDatabaseClient, firstRealConversations, numberTrials, onboardingNumberClaimEvents, outboxMessages, partners, phoneNumbers, productEvents, users, webhookEndpoints, webhookEvents, withBusinessTransaction, type Database, type DatabaseTransaction, defaultAgentIdOf } from "@lobbystack/db";

import { getAnalytics } from "./analytics";
import { loadEntitlement } from "./entitlement";
import { refreshBusinessSnapshot } from "./knowledge";
import { desiredNumberRouting, loadNumberTrialEmail } from "./numberTrials";
import { completeNumberProvisioning } from "./phoneNumbers";
import { saveReceptionistProfileInTransaction } from "./receptionistProfile";
import { decideStaffFirstCall, recordStaffAnsweredCall, recordStaffCallStatus, STAFF_BRIDGED_MINUTES_PER_DAY } from "./staffFirst";
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
async function as<T>(tx: DatabaseTransaction, role: "lobbystack_app" | "lobbystack_worker", run: (db: Database) => Promise<T>): Promise<T> {
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
  if (input.carrier) await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: lobbyNumber, status: "active", carrier: input.carrier, providerPhoneId: `PN${randomUUID()}` });
  return businessId;
}

type Patch = Parameters<typeof saveReceptionistProfileInTransaction>[1]["patch"];
// The dashboard saves in the app role, as the signed-in operator.
async function save(tx: DatabaseTransaction, businessId: string, patch: Patch) {
  const [member] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
  return await as(tx, "lobbystack_app", (db) => withBusinessTransaction(db, { userId: member!.userId, businessId, actorType: "operator" }, (inner) => saveReceptionistProfileInTransaction(inner, { businessId, businessName: "Harbor dental", patch })));
}
// The v1 API saves in the worker role.
const saveFromApi = (tx: DatabaseTransaction, businessId: string, patch: Patch) => as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => saveReceptionistProfileInTransaction(inner, { businessId, businessName: "Harbor dental", patch })));
// The webhooks run as the worker role.
const decide = (tx: DatabaseTransaction, input: Parameters<typeof decideStaffFirstCall>[1]) => as(tx, "lobbystack_worker", (db) => decideStaffFirstCall({ db }, input));

describe.skipIf(!testUrl)("staff answers first against PostgreSQL", () => {
  beforeEach(() => { vi.stubEnv("OPENAI_PROJECT_ID", "proj_test"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("saves the settings on a paid plan and queues a routing job for each Twilio number", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      const profile = await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      expect(profile).toMatchObject({ staffFirstMode: "always", staffFirstNumber: staffPhone, staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: "Connecting you now." });
      const jobs = await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(eq(outboxMessages.businessId, businessId));
      expect(jobs.map((job) => job.topic)).toContain("phoneNumber.route");
    });
  });

  it("saves through the v1 API's role too", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      expect(await saveFromApi(tx, businessId, { staffFirstMode: "business_hours", staffFirstNumber: staffPhone })).toMatchObject({ staffFirstMode: "business_hours" });
    });
  });

  it("holds the staff phone to the transfer number rules", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: "+8613800138000" })).rejects.toMatchObject({ status: 400, code: "transfer_country_unsupported" });
      await expect(saveFromApi(tx, businessId, { staffFirstNumber: "416-555-0142" })).rejects.toMatchObject({ status: 400, code: "transfer_number_invalid" });
      await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "active", verifiedPhone: "+14165550199" });
      await expect(save(tx, businessId, { staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 409, code: "trial_transfer_locked" });
    });
  });

  it("lets a trial lock stop a staff phone, but not turning the setting off", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone });
      await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "active", verifiedPhone: "+14165550199" });
      expect(await save(tx, businessId, { staffFirstMode: "never", staffFirstNumber: staffPhone })).toMatchObject({ staffFirstMode: "never", staffFirstNumber: staffPhone });
      await expect(save(tx, businessId, { staffFirstMode: "always" })).rejects.toMatchObject({ status: 409, code: "trial_transfer_locked" });
    });
  });

  it("refuses a Free business", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { plan: "free_cloud", carrier: "twilio" });
      await expect(save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone })).rejects.toMatchObject({ status: 402, code: "staff_first_plan_required" });
    });
  });

  it("refuses to turn on when the admin app can't reach GPT-Live, and still turns off", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx, { carrier: "twilio" });
      await save(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone });
      vi.stubEnv("OPENAI_PROJECT_ID", " ");
      await expect(save(tx, businessId, { staffFirstMode: "business_hours" })).rejects.toMatchObject({ status: 409, code: "staff_first_not_configured", message: "Staff answers first needs OPENAI_PROJECT_ID on the admin app." });
      expect(await save(tx, businessId, { staffFirstMode: "never" })).toMatchObject({ staffFirstMode: "never" });
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
      expect((await tx.select({ number: agents.staffFirstNumber }).from(agents).where(eq(agents.businessId, businessId)))[0]?.number).toBe(staffPhone);
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
      await tx.update(agents).set({ staffFirstMode: "always", staffFirstNumber: staffPhone }).where(eq(agents.businessId, businessId));
      expect((await desiredNumberRouting({ db: tx as unknown as Database }, { businessId, phoneNumberId: number!.id }))?.mode).toBe("receptionist");
    });
  });

  describe("decideStaffFirstCall", () => {
    // Monday 2026-11-02 at 10:00 and 20:00 in Toronto.
    const open = new Date("2026-11-02T15:00:00Z");
    const closed = new Date("2026-11-03T01:00:00Z");
    const caller = "+14165550134";
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
        const at = (now: Date) => decide(tx, { businessId, e164: lobbyNumber, providerCallId: `CA${now.getTime()}`, from: "+14165550134", now });
        expect(await at(open)).toEqual({ action: "ring", locale: "en", phone: staffPhone, ringSeconds: 15, message: "One moment." });
        expect(await at(closed)).toEqual({ action: "receptionist", locale: "en" });
      });
    });

    it("uses one transfer attempt per ring, however often Twilio repeats the webhook", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open });
        await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open });
        await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA2", now: open });
        const attempts = await tx.select({ sourceKey: billingUsageEvents.sourceKey }).from(billingUsageEvents).where(and(eq(billingUsageEvents.businessId, businessId), eq(billingUsageEvents.usageKind, "outbound_call_attempts")));
        expect(attempts.map((attempt) => attempt.sourceKey).sort()).toEqual(["staff_ring:CA1", "staff_ring:CA2"]);
      });
    });

    it("sends a forwarded call to the receptionist when the carrier names no forwarding line", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        const call = (providerCallId: string, now: Date) => decide(tx, { businessId, e164: lobbyNumber, providerCallId, from: caller, now });
        expect((await call("CA1", open)).action).toBe("ring");
        // Twilio repeating the webhook is the same call, not a forward.
        expect((await call("CA1", open)).action).toBe("ring");
        expect((await call("CA2", new Date(open.getTime() + 20_000))).action).toBe("receptionist");
        // Other callers still ring, and so does this one once the ring is over.
        expect((await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA3", from: "+14165550155", now: new Date(open.getTime() + 20_000) })).action).toBe("ring");
        expect((await call("CA4", new Date(open.getTime() + 31_000))).action).toBe("ring");
        const attempts = await tx.select({ sourceKey: billingUsageEvents.sourceKey }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId));
        expect(attempts).toHaveLength(3);
        expect(attempts.map((attempt) => attempt.sourceKey).join()).not.toContain("4165550134");
      });
    });

    it("won't ring the staff phone for a call from the staff phone", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", from: staffPhone, now: open })).toEqual({ action: "receptionist", locale: "en" });
      });
    });

    it("skips the ring and spends no attempt outside the hours", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "business_hours");
        await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: closed });
        expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toEqual([]);
      });
    });

    it("rejects a blocked caller", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await tx.insert(contacts).values({ businessId, phone: "+14165550134", operatorBlockedAt: new Date() });
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", from: "+14165550134", now: open })).toEqual({ action: "reject" });
      });
    });

    it("rejects a call on an ended trial", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "ended", verifiedPhone: staffPhone });
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open })).toEqual({ action: "reject" });
      });
    });

    it("won't ring the line that forwarded the call here", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", forwardedFrom: staffPhone, now: open })).toEqual({ action: "receptionist", locale: "en" });
      });
    });

    it("won't ring anyone but the verified mobile during a trial", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always");
        await tx.insert(numberTrials).values({ businessId, userId: (await tx.select({ id: users.id }).from(users).limit(1))[0]!.id, status: "active", verifiedPhone: "+14165550199" });
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open })).toEqual({ action: "receptionist", locale: "en" });
        expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toEqual([]);
      });
    });

    describe("bridged minutes", () => {
      const bridged = (tx: DatabaseTransaction, businessId: string, seconds: number, endedAt: Date, provider?: string) => as(tx, "lobbystack_worker", (db) => recordStaffAnsweredCall({ db }, { businessId, providerCallId: `CA${randomUUID()}`, to: lobbyNumber, seconds, endedAt })).then(async () => {
        if (provider) await tx.update(calls).set({ provider }).where(eq(calls.businessId, businessId));
      });
      const cap = STAFF_BRIDGED_MINUTES_PER_DAY * 60;

      it("sends calls to the receptionist at the cap, and spends no attempt", async () => {
        await rollbackTest(async (tx) => {
          const businessId = await configured(tx, "always");
          await bridged(tx, businessId, cap - 1, new Date(open.getTime() - 60_000));
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-under", from: caller, now: open })).toMatchObject({ action: "ring" });
          await bridged(tx, businessId, 1, new Date(open.getTime() - 60_000));
          const attempts = await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId));
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-over", from: "+14165550135", now: open })).toEqual({ action: "receptionist", locale: "en" });
          expect(await tx.select({ id: billingUsageEvents.id }).from(billingUsageEvents).where(eq(billingUsageEvents.businessId, businessId))).toHaveLength(attempts.length);
        });
      });

      it("rolls: minutes from more than 24 hours ago stop counting", async () => {
        await rollbackTest(async (tx) => {
          const businessId = await configured(tx, "always");
          await bridged(tx, businessId, cap, new Date(open.getTime() - 25 * 60 * 60_000));
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-next-day", from: caller, now: open })).toMatchObject({ action: "ring" });
        });
      });

      it("counts only calls staff took", async () => {
        await rollbackTest(async (tx) => {
          const businessId = await configured(tx, "always");
          await bridged(tx, businessId, cap, new Date(open.getTime() - 60_000), "openai_live");
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-receptionist", from: caller, now: open })).toMatchObject({ action: "ring" });
        });
      });

      it("holds a partner's business billed outside LobbyStack too", async () => {
        await rollbackTest(async (tx) => {
          const [partner] = await tx.insert(partners).values({ name: "Acme", slug: `acme-${randomUUID().slice(0, 8)}` }).returning({ id: partners.id });
          const businessId = randomUUID();
          await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Harbor dental", timezone: "America/Toronto", businessType: "test", telemetryEnabled: true, deploymentMode: "cloud", partnerId: partner!.id });
          await tx.insert(phoneNumbers).values({ businessId, agentId: defaultAgentIdOf(businessId), e164: lobbyNumber, status: "active", carrier: "twilio", providerPhoneId: `PN${randomUUID()}` });
          await saveFromApi(tx, businessId, { staffFirstMode: "always", staffFirstNumber: staffPhone });
          await refreshBusinessSnapshot(context(tx), { businessId });
          const { source } = await as(tx, "lobbystack_worker", (db) => withBusinessTransaction(db, { businessId, actorType: "worker" }, (inner) => loadEntitlement(inner, businessId)));
          expect(source).toBe("billed_outside");
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-under", from: caller, now: open })).toMatchObject({ action: "ring" });
          await bridged(tx, businessId, cap, new Date(open.getTime() - 60_000));
          expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA-outside", from: caller, now: open })).toEqual({ action: "receptionist", locale: "en" });
        });
      });
    });

    it("stops ringing a business that fell back to Free", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await configured(tx, "always", "free_cloud");
        expect(await decide(tx, { businessId, e164: lobbyNumber, providerCallId: "CA1", now: open })).toEqual({ action: "receptionist", locale: "en" });
      });
    });
  });

  describe("recordStaffAnsweredCall", () => {
    const context = (tx: DatabaseTransaction) => ({ db: tx as unknown as Database });
    const endedAt = new Date("2026-11-02T15:00:42Z");
    const answered = (tx: DatabaseTransaction, businessId: string, from?: string) => as(tx, "lobbystack_worker", (db) => recordStaffAnsweredCall({ db }, { businessId, providerCallId: "CA1", to: lobbyNumber, seconds: 42, endedAt, ...(from ? { from } : {}) }));

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

    it("counts as the business's first real conversation, once", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId, "+14165550134");
        await answered(tx, businessId, "+14165550134");
        expect(await tx.select({ channel: firstRealConversations.channel, conversationId: firstRealConversations.conversationId }).from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId))).toEqual([{ channel: "voice", conversationId: null }]);
        const events = await tx.select({ properties: productEvents.properties }).from(productEvents).where(and(eq(productEvents.businessId, businessId), eq(productEvents.name, "conversation.first_real_recorded")));
        expect(events).toHaveLength(1);
        expect(events[0]!.properties).toMatchObject({ channel: "voice" });
      });
    });

    it("doesn't count a call nobody talked on, or one from a team member's verified phone", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await as(tx, "lobbystack_worker", (db) => recordStaffAnsweredCall({ db }, { businessId, providerCallId: "CA0", from: "+14165550134", to: lobbyNumber, seconds: 0, endedAt }));
        const [owner] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
        await tx.update(users).set({ phone: "+14165550135", phoneVerifiedAt: new Date() }).where(eq(users.id, owner!.userId));
        await answered(tx, businessId, "+14165550135");
        expect(await tx.select().from(firstRealConversations).where(eq(firstRealConversations.businessId, businessId))).toEqual([]);
      });
    });

    it("fires call.completed once, as the usual call resource", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await tx.insert(webhookEndpoints).values({ businessId, url: "https://hooks.example.com/lobbystack", events: ["call.completed"], encryptedSecret: "secret" });
        await answered(tx, businessId, "+14165550134");
        await answered(tx, businessId, "+14165550134");
        const events = await tx.select({ payload: webhookEvents.payload }).from(webhookEvents).where(and(eq(webhookEvents.businessId, businessId), eq(webhookEvents.type, "call.completed")));
        expect(events).toHaveLength(1);
        const [call] = await tx.select({ id: calls.id }).from(calls).where(eq(calls.businessId, businessId));
        expect(apiCallSchema.parse(events[0]!.payload.data)).toMatchObject({ id: call!.id, channel: "phone", status: "completed", outcome: "answered_by_team", summary: null, end_reason: "answered_by_team", caller_phone: "+14165550134", duration_seconds: 42 });
      });
    });

    it("records Twilio's final status on the call a staff member took, and keeps its bridged seconds", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId, "+14165550134");
        const reportedAt = new Date("2026-11-02T15:00:43Z");
        await as(tx, "lobbystack_worker", (db) => recordStaffCallStatus({ db }, { businessId, providerCallId: "CA1", status: "completed", reportedAt }));
        const [row] = await tx.select({ status: calls.status, providerUpdatedAt: calls.providerUpdatedAt, providerDurationSeconds: calls.providerDurationSeconds }).from(calls).where(eq(calls.businessId, businessId));
        expect(row).toEqual({ status: "completed", providerUpdatedAt: reportedAt, providerDurationSeconds: 42 });
      });
    });

    it("ignores a status that isn't final, and a call with no staff-answered record", async () => {
      await rollbackTest(async (tx) => {
        const businessId = await business(tx, { carrier: "twilio" });
        await answered(tx, businessId, "+14165550134");
        await as(tx, "lobbystack_worker", async (db) => {
          await recordStaffCallStatus({ db }, { businessId, providerCallId: "CA1", status: "in-progress" });
          await recordStaffCallStatus({ db }, { businessId, providerCallId: "CAother", status: "completed" });
        });
        const rows = await tx.select({ providerCallId: calls.providerCallId, providerUpdatedAt: calls.providerUpdatedAt }).from(calls).where(eq(calls.businessId, businessId));
        expect(rows).toEqual([{ providerCallId: "CA1", providerUpdatedAt: null }]);
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

  it("moves a number bought after the setting went on, and leaves other businesses' new numbers alone", async () => {
    await rollbackTest(async (tx) => {
      const provision = async (businessId: string, e164: string) => {
        const [member] = await tx.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
        const [claim] = await tx.insert(onboardingNumberClaimEvents).values({ businessId, userId: member!.userId, requestedE164: e164, selectionContext: {}, claimTokenHash: randomUUID(), idempotencyKey: randomUUID(), status: "provisioning" }).returning({ id: onboardingNumberClaimEvents.id });
        await as(tx, "lobbystack_worker", (db) => completeNumberProvisioning({ db }, { businessId, claimId: claim!.id, carrier: "twilio", e164, providerPhoneId: `PN${randomUUID()}`, voiceUrl: "sip-trunk:TK1" }));
        return (await tx.select({ topic: outboxMessages.topic }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "phoneNumber.route"))));
      };
      const on = await business(tx);
      await save(tx, on, { staffFirstMode: "always", staffFirstNumber: staffPhone });
      expect(await provision(on, "+14165550124")).toHaveLength(1);
      const off = await business(tx);
      await save(tx, off, { greeting: "Hello." });
      expect(await provision(off, "+14165550125")).toHaveLength(0);
    });
  });

  it("rejects an unknown mode at the database", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await business(tx);
      await save(tx, businessId, { greeting: "Hello." });
      await expect(tx.transaction(async (nested) => { await nested.execute(sql`update agents set staff_first_mode = 'weekends' where business_id = ${businessId}::uuid`); })).rejects.toThrow();
    });
  });
});
