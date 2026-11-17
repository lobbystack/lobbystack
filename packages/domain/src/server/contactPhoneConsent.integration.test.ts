import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { apiKeys, businesses, businessMemberships, contacts, createDatabaseClient, smsConsentEvents, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { updateContactDetails } from "./contacts";
import { generateApiKey } from "./publicApi/apiKeys";
import { updateContactForApi, type ApiKeyCaller } from "./publicApi/operations";
import { receiveSharedSenderSms } from "./sms";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Contact phone consent integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

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

const oldPhone = "+14165550100";
const newPhone = "+14165550199";

/**
 * A business whose contact said yes to texts, then texted STOP to the shared sender, so the contact
 * is opted out with the status that STOP replaced on file. Each call runs under the role that makes it.
 */
async function seed(tx: DatabaseTransaction) {
  await tx.execute(sql`reset session authorization`);
  await tx.execute(sql`reset role`);
  const businessId = randomUUID();
  const adminId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: false });
  await tx.insert(users).values({ id: adminId, email: `${adminId}@example.invalid`, normalizedEmail: `${adminId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId: adminId, role: "business_admin" });
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan", phone: oldPhone, smsConsentStatus: "subscribed", smsConsentSource: "reminder_consent", smsOptInConfirmedAt: new Date() }).returning({ id: contacts.id });
  const contactId = milan!.id;
  const generated = generateApiKey();
  const [key] = await tx.insert(apiKeys).values({ businessId, name: "Contacts", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["contacts:read", "contacts:write"], createdByUserId: adminId }).returning({ id: apiKeys.id });
  const caller: ApiKeyCaller = { businessId, apiKeyId: key!.id };
  const db = tx as unknown as Database;
  // The shared sender's lookup checks session_user, so the worker is a session authorization, not just a role.
  const owner = async () => { await tx.execute(sql`reset session authorization`); await tx.execute(sql`reset role`); };
  const as = async (role: "lobbystack_worker" | "lobbystack_app") => {
    await owner();
    await tx.execute(sql.raw(role === "lobbystack_worker" ? `set local session authorization ${role}` : `set local role ${role}`));
  };
  return {
    contactId,
    // The contact texts STOP to the shared sender, as the worker does for the webhook.
    stop: async () => {
      await as("lobbystack_worker");
      await receiveSharedSenderSms({ db }, { from: oldPhone, body: "STOP" });
    },
    start: async (from: string) => {
      await as("lobbystack_worker");
      return await receiveSharedSenderSms({ db }, { from, body: "START" });
    },
    editInDashboard: async (phone: string) => {
      await as("lobbystack_app");
      return await updateContactDetails({ db }, { userId: adminId, businessId, contactId, phone });
    },
    editThroughApi: async (input: { phone?: string; name?: string }) => {
      await as("lobbystack_worker");
      return await updateContactForApi({ db }, caller, contactId, input);
    },
    consent: async () => {
      await owner();
      return (await tx.select({ status: contacts.smsConsentStatus, before: contacts.smsConsentStatusBeforeOptOut, source: contacts.smsConsentSource, confirmedAt: contacts.smsOptInConfirmedAt, updatedAt: contacts.smsConsentUpdatedAt }).from(contacts).where(eq(contacts.id, contactId)))[0]!;
    },
    events: async () => {
      await owner();
      return await tx.select({ phone: smsConsentEvents.phone, action: smsConsentEvents.action, source: smsConsentEvents.source }).from(smsConsentEvents).where(and(eq(smsConsentEvents.businessId, businessId), eq(smsConsentEvents.contactId, contactId)));
    },
  };
}

describe.skipIf(!client)("changing a contact's phone number", () => {
  it("clears what the old number's STOP replaced, so a START from the new number restores nothing, in the dashboard", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await fixture.stop();
      expect(await fixture.consent()).toMatchObject({ status: "opted_out", before: "subscribed", source: "shared_sender:STOP" });

      await fixture.editInDashboard(newPhone);

      // The opt-out stays, but nothing of the old number's yes is left to restore.
      expect(await fixture.consent()).toMatchObject({ status: "opted_out", before: null, source: null, confirmedAt: null });
      expect((await fixture.consent()).updatedAt).toBeInstanceOf(Date);
      expect(await fixture.events()).toContainEqual({ phone: newPhone, action: "consent_reset_phone_changed", source: expect.stringMatching(/^operator:/) });

      expect((await fixture.start(newPhone)).contactsChanged).toBe(0);
      expect((await fixture.consent()).status).toBe("opted_out");
    });
  });

  it("does the same through the API", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await fixture.stop();

      await fixture.editThroughApi({ phone: newPhone });

      expect(await fixture.consent()).toMatchObject({ status: "opted_out", before: null, source: null, confirmedAt: null });
      expect(await fixture.events()).toContainEqual({ phone: newPhone, action: "consent_reset_phone_changed", source: "api:api_key" });

      expect((await fixture.start(newPhone)).contactsChanged).toBe(0);
      expect((await fixture.consent()).status).toBe("opted_out");
    });
  });

  it("drops a yes to texts and records the reset", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);

      await fixture.editInDashboard(newPhone);

      expect(await fixture.consent()).toMatchObject({ status: null, source: null, confirmedAt: null });
      expect(await fixture.events()).toHaveLength(1);
    });
  });

  it("leaves consent and events alone when the number stays the same or only another field changes", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);

      await fixture.editThroughApi({ name: "Mila", phone: oldPhone });
      await fixture.editInDashboard(oldPhone);

      expect(await fixture.consent()).toMatchObject({ status: "subscribed", source: "reminder_consent" });
      expect((await fixture.consent()).confirmedAt).toBeInstanceOf(Date);
      expect(await fixture.events()).toEqual([]);
    });
  });

  it("records no event for a contact with no consent on file", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx);
      await tx.update(contacts).set({ smsConsentStatus: null, smsConsentSource: null, smsOptInConfirmedAt: null }).where(eq(contacts.id, fixture.contactId));

      await fixture.editThroughApi({ phone: newPhone });

      expect(await fixture.events()).toEqual([]);
    });
  });
});
