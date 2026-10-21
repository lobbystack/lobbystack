import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { apiKeys, appointmentChangeVerifications, appointments, auditLogs, businesses, businessHours, businessMemberships, calls, contactPasscodes, contacts, createDatabaseClient, receptionistProfiles, services, staff, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { CONTACT_PASSCODES_MAX_PER_REQUEST, isGuessableContactPasscode, type ApiContactPasscodesGenerate, type ApiContactPasscodesUpdate, type AppointmentChangeVerificationMode } from "@lobbystack/shared";

import { createAppointmentChangeVerification, issueAppointmentChangeOtp, verifyAppointmentChangePasscode } from "./appointmentChanges";
import { cancelAppointmentForCaller, rescheduleAppointmentForCaller } from "./booking";
import { removeContactPasscode, setContactPasscode } from "./contactPasscodes";
import { deleteContact, getContactDetail } from "./contacts";
import { generateApiKey } from "./publicApi/apiKeys";
import { generateContactPasscodesForApi, getContactForApi, listContactsForApi, setContactPasscodesForApi, type ApiKeyCaller } from "./publicApi/operations";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Contact passcode integration tests require a dedicated local test database.");
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

const timezone = "UTC";
const phone = "+14165550100";
const pin = "480613";
const tomorrow = DateTime.utc().plus({ days: 1 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 });

/**
 * A business open all day that lets callers cancel and reschedule from the
 * booking number with the given check, and Milan's cut tomorrow at 3 PM. The dashboard runs
 * as the app role and the call as the worker, both under RLS.
 */
async function seed(tx: DatabaseTransaction, verificationMode: AppointmentChangeVerificationMode = "passcode_required") {
  await tx.execute(sql`reset role`);
  const businessId = randomUUID();
  const userIds = { admin: randomUUID(), scheduler: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone, businessType: "test", telemetryEnabled: false });
  for (const [role, id] of [["business_admin", userIds.admin], ["scheduler", userIds.scheduler]] as const) {
    await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId: id, role });
  }
  await tx.insert(receptionistProfiles).values({ businessId, greeting: "Hi", tone: "warm", summary: "Test", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant", appointmentChangePolicy: { enabled: true, verificationMode, allowCancel: true, allowReschedule: true } });
  const [member] = await tx.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
  const [service] = await tx.insert(services).values({ businessId, name: "Cut", slug: "cut", durationMinutes: 30 }).returning();
  await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 0, closeMinutes: 1439 })));
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan", phone, smsConsentStatus: "subscribed" }).returning();
  const [appointment] = await tx.insert(appointments).values({ businessId, contactId: milan!.id, staffId: member!.id, serviceId: service!.id, startsAt: tomorrow.toJSDate(), endsAt: tomorrow.plus({ minutes: 30 }).toJSDate(), timezone, status: "confirmed", sourceChannel: "voice" }).returning();
  const db = tx as unknown as Database;
  const as = async (role: "lobbystack_worker" | "lobbystack_app") => { await tx.execute(sql.raw(`set local role ${role}`)); };
  const asOwner = async () => { await tx.execute(sql`reset role`); };
  const contactId = milan!.id;
  const appointmentId = appointment!.id;
  return {
    businessId,
    contactId,
    appointmentId,
    userIds,
    setPin: async (passcode: string, userId = userIds.admin, forContact = contactId) => {
      await as("lobbystack_app");
      return await setContactPasscode({ db }, { userId, businessId, contactId: forContact, passcode });
    },
    removePin: async () => {
      await as("lobbystack_app");
      return await removeContactPasscode({ db }, { userId: userIds.admin, businessId, contactId });
    },
    detail: async () => {
      await as("lobbystack_app");
      return await getContactDetail({ db }, { userId: userIds.scheduler, businessId, contactId });
    },
    row: async (forContact = contactId) => {
      await asOwner();
      return (await tx.select().from(contactPasscodes).where(eq(contactPasscodes.contactId, forContact)))[0];
    },
    addContact: async (name: string, contactPhone: string) => {
      await asOwner();
      return (await tx.insert(contacts).values({ businessId, name, phone: contactPhone }).returning({ id: contacts.id }))[0]!.id;
    },
    lock: async () => {
      await asOwner();
      await tx.update(contactPasscodes).set({ lockedAt: new Date() }).where(eq(contactPasscodes.contactId, contactId));
    },
    audits: async (prefix: string) => {
      await asOwner();
      // Rows from one transaction share a timestamp, so sort them by name.
      return (await tx.select({ eventType: auditLogs.eventType }).from(auditLogs).where(and(eq(auditLogs.businessId, businessId), sql`${auditLogs.eventType} like ${`${prefix}%`}`))).map((row) => row.eventType).sort();
    },
    // A phone call from the booking number.
    call: async () => {
      await asOwner();
      return (await tx.insert(calls).values({ businessId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport: "pstn", startedAt: new Date() }).returning({ id: calls.id }))[0]!.id;
    },
    // What a phone call from the booking number runs, as the worker.
    verify: async (action: "cancel" | "reschedule" = "cancel", callId?: string) => {
      await as("lobbystack_worker");
      return await createAppointmentChangeVerification({ db }, { businessId, callerPhone: phone, action, serviceName: "Cut", ...(callId ? { callId } : {}) });
    },
    type: async (verificationId: string, passcode: string) => {
      await as("lobbystack_worker");
      return await verifyAppointmentChangePasscode({ db }, { businessId, verificationId, passcode });
    },
    cancel: async (verificationId: string) => {
      await as("lobbystack_worker");
      return await cancelAppointmentForCaller({ db }, { businessId, appointmentId, callerPhone: phone, verificationId });
    },
    reschedule: async (verificationId: string) => {
      await as("lobbystack_worker");
      return await rescheduleAppointmentForCaller({ db }, { businessId, appointmentId, callerPhone: phone, verificationId, startsAt: tomorrow.plus({ days: 1 }).toISO()! });
    },
    verification: async (verificationId: string) => {
      await asOwner();
      return (await tx.select({ status: appointmentChangeVerifications.status, attemptCount: appointmentChangeVerifications.attemptCount }).from(appointmentChangeVerifications).where(eq(appointmentChangeVerifications.id, verificationId)))[0];
    },
    setMode: async (mode: AppointmentChangeVerificationMode) => {
      await asOwner();
      await tx.update(receptionistProfiles).set({ appointmentChangePolicy: { enabled: true, verificationMode: mode, allowCancel: true, allowReschedule: true } }).where(eq(receptionistProfiles.businessId, businessId));
    },
    expire: async (verificationId: string) => {
      await asOwner();
      await tx.update(appointmentChangeVerifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(appointmentChangeVerifications.id, verificationId));
    },
    appointmentStatus: async () => {
      await asOwner();
      return (await tx.select({ status: appointments.status }).from(appointments).where(eq(appointments.id, appointmentId)))[0]?.status;
    },
    deleteContact: async (forContact: string) => {
      await as("lobbystack_app");
      return await deleteContact({ db }, { userId: userIds.admin, businessId, contactId: forContact });
    },
  };
}

describe.skipIf(!client)("a contact's keypad PIN", () => {
  it("lets an admin set, replace and remove it, keeping only a hash", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, removePin, detail, row, audits } = await seed(tx);
      expect((await detail()).passcode).toBeNull();

      const first = await setPin(pin);
      expect(first).toMatchObject({ locked: false });
      const stored = await row();
      expect(stored!.passcodeHash).toMatch(/^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(stored!.passcodeHash).not.toContain(pin);
      expect((await detail()).passcode).toEqual({ setAt: first!.setAt, locked: false });
      expect(JSON.stringify(await detail())).not.toContain(stored!.passcodeHash);

      await setPin("935172");
      expect((await row())!.passcodeHash).not.toBe(stored!.passcodeHash);

      expect(await removePin()).toBe(true);
      expect((await detail()).passcode).toBeNull();
      expect(await removePin()).toBe(true);
      expect(await audits("contact.passcode")).toEqual(["contact.passcode_removed", "contact.passcode_set", "contact.passcode_set"]);
    });
  });

  it("keeps two contacts with the same PIN apart", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, row, addContact } = await seed(tx);
      const ana = await addContact("Ana", "+14165550101");
      await setPin(pin);
      await setPin(pin, undefined, ana);
      expect((await row(ana))!.passcodeHash).not.toBe((await row())!.passcodeHash);
    });
  });

  it("can't be set by a scheduler, on another business's contact, or to a guessable PIN", async () => {
    await rollbackTest(async (tx) => {
      const { userIds, setPin, row } = await seed(tx);
      await expect(setPin(pin, userIds.scheduler)).rejects.toMatchObject({ status: 403 });
      const other = await seed(tx);
      expect(await setPin(pin, undefined, other.contactId)).toBeNull();
      await expect(setPin("1234")).rejects.toMatchObject({ status: 400, code: "guessable_passcode" });
      await expect(setPin("12")).rejects.toMatchObject({ status: 400, code: "invalid_passcode" });
      expect(await row()).toBeUndefined();
    });
  });

  it("goes with its contact", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, deleteContact: remove, row, addContact } = await seed(tx);
      const ana = await addContact("Ana", "+14165550101");
      await setPin(pin, undefined, ana);
      expect(await remove(ana)).toBe(true);
      expect(await row(ana)).toBeUndefined();
    });
  });
});

describe.skipIf(!client)("appointment changes that need the keypad PIN", () => {
  it("waits for the PIN, then lets the change through once", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, verify, type, cancel, appointmentStatus, audits } = await seed(tx);
      await setPin(pin);
      const pending = await verify();
      expect(pending).toMatchObject({ status: "passcode_pending" });
      expect(await cancel(pending!.verificationId)).toBeNull();

      expect(await type(pending!.verificationId, pin)).toMatchObject({ ok: true, status: "passcode_verified", action: "cancel", smsConsent: "subscribed" });
      expect(await cancel(pending!.verificationId)).toMatchObject({ smsConsentOnFile: "subscribed" });
      expect(await appointmentStatus()).toBe("canceled");
      expect(await type(pending!.verificationId, pin)).toMatchObject({ ok: false, status: "expired" });
      expect(await audits("appointment_change.passcode")).toEqual(["appointment_change.passcode_verified"]);
    });
  });

  it("sends a caller without a PIN, or with a locked one, to the team", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, removePin, verify, type, lock, audits } = await seed(tx);
      expect(await verify()).toMatchObject({ status: "passcode_missing" });

      await setPin(pin);
      const pending = (await verify())!;
      await lock();
      // Asked for before the lock, and refused without comparing the PIN.
      expect(await type(pending.verificationId, pin)).toMatchObject({ ok: false, status: "passcode_locked" });
      expect(await verify()).toMatchObject({ status: "passcode_locked" });

      await setPin(pin);
      const again = (await verify())!;
      await removePin();
      expect(await type(again.verificationId, pin)).toMatchObject({ ok: false, status: "passcode_missing" });
      expect(await audits("appointment_change.passcode")).toEqual(["appointment_change.passcode_locked", "appointment_change.passcode_missing"]);
    });
  });

  it("allows three tries per change and locks the PIN after five wrong ones in a row", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, verify, type, row, detail, audits } = await seed(tx);
      await setPin(pin);
      const first = (await verify())!;
      expect(await type(first.verificationId, "111222")).toMatchObject({ ok: false, status: "passcode_pending", attemptsLeft: 2 });
      expect(await type(first.verificationId, "111222")).toMatchObject({ ok: false, status: "passcode_pending", attemptsLeft: 1 });
      expect(await type(first.verificationId, "111222")).toMatchObject({ ok: false, status: "failed", attemptsLeft: 0 });
      expect(await type(first.verificationId, pin)).toMatchObject({ ok: false, status: "failed" });

      const second = (await verify())!;
      expect(await type(second.verificationId, "111222")).toMatchObject({ ok: false, status: "passcode_pending", attemptsLeft: 2 });
      expect(await type(second.verificationId, "111222")).toMatchObject({ ok: false, status: "passcode_locked" });
      expect((await row())!.failedAttempts).toBe(5);
      expect((await detail()).passcode).toMatchObject({ locked: true });
      expect(await verify()).toMatchObject({ status: "passcode_locked" });
      expect(await audits("appointment_change.passcode_locked")).toEqual(["appointment_change.passcode_locked"]);

      // A new PIN clears the lock.
      await setPin("935172");
      expect((await detail()).passcode).toMatchObject({ locked: false });
      const third = (await verify())!;
      expect(await type(third.verificationId, "935172")).toMatchObject({ ok: true, status: "passcode_verified" });
    });
  });

  it("forgets earlier wrong PINs once the right one is typed", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, verify, type, row } = await seed(tx);
      await setPin(pin);
      const pending = (await verify())!;
      await type(pending.verificationId, "111222");
      await type(pending.verificationId, "111222");
      expect((await row())!.failedAttempts).toBe(2);
      expect(await type(pending.verificationId, pin)).toMatchObject({ ok: true });
      expect((await row())!.failedAttempts).toBe(0);
    });
  });

  it("counts an accepted PIN for the same appointment on the same call instead of asking again", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, call, verify, type, reschedule, verification } = await seed(tx);
      await setPin(pin);
      const callId = await call();
      const pending = (await verify("cancel", callId))!;
      await type(pending.verificationId, pin);
      // The agent verifies again before cancelling: the accepted PIN still counts.
      expect(await verify("cancel", callId)).toMatchObject({ verificationId: pending.verificationId, status: "passcode_verified" });

      // The caller would rather move it: no second PIN.
      const moving = (await verify("reschedule", callId))!;
      expect(moving).toMatchObject({ status: "passcode_verified" });
      expect(moving.verificationId).not.toBe(pending.verificationId);
      expect(moving.expiresAt).toBe((await verify("reschedule", callId))!.expiresAt);
      expect(await verification(pending.verificationId)).toMatchObject({ status: "superseded" });
      expect(await reschedule(moving.verificationId)).not.toBeNull();
    });
  });

  // Caller ID can be spoofed, so the number alone never stands in for the PIN.
  it("asks a later call from the same number for the PIN again", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, call, verify, type, cancel, appointmentStatus } = await seed(tx);
      await setPin(pin);
      const first = (await verify("cancel", await call()))!;
      expect(await type(first.verificationId, pin)).toMatchObject({ ok: true, status: "passcode_verified" });

      const secondCall = await call();
      const second = (await verify("cancel", secondCall))!;
      expect(second).toMatchObject({ status: "passcode_pending" });
      expect(second.verificationId).not.toBe(first.verificationId);
      expect(await cancel(second.verificationId)).toBeNull();
      // The second call's verification superseded the first call's.
      expect(await cancel(first.verificationId)).toBeNull();
      // A request without a call never counts an accepted PIN either.
      expect(await verify("cancel")).toMatchObject({ status: "passcode_pending" });
      expect(await appointmentStatus()).toBe("confirmed");

      const third = (await verify("cancel", secondCall))!;
      expect(await type(third.verificationId, pin)).toMatchObject({ ok: true, status: "passcode_verified" });
      expect(await cancel(third.verificationId)).not.toBeNull();
      expect(await appointmentStatus()).toBe("canceled");
    });
  });

  it("expires with the verification", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, verify, type, expire, row } = await seed(tx);
      await setPin(pin);
      const pending = (await verify())!;
      await expire(pending.verificationId);
      expect(await type(pending.verificationId, "111222")).toMatchObject({ ok: false, status: "expired" });
      expect((await row())!.failedAttempts).toBe(0);
    });
  });

  it("never takes a texted code instead", async () => {
    await rollbackTest(async (tx) => {
      const { businessId, setPin, verify } = await seed(tx);
      await setPin(pin);
      const pending = (await verify())!;
      await tx.execute(sql.raw("set local role lobbystack_worker"));
      expect(await issueAppointmentChangeOtp({ db: tx as unknown as Database }, { businessId, verificationId: pending.verificationId })).toMatchObject({ ok: false, status: "passcode_pending" });
    });
  });

  it("refuses a change verified the looser way once the business requires a PIN", async () => {
    await rollbackTest(async (tx) => {
      const { verify, cancel, setMode, appointmentStatus } = await seed(tx, "phone_match_and_facts");
      const facts = (await verify())!;
      expect(facts.status).toBe("facts_verified");
      await setMode("passcode_required");
      expect(await cancel(facts.verificationId)).toBeNull();
      expect(await appointmentStatus()).toBe("confirmed");
    });
  });

  it("lets a change verified by PIN through after the business relaxes the check", async () => {
    await rollbackTest(async (tx) => {
      const { setPin, verify, type, cancel, setMode, appointmentStatus } = await seed(tx);
      await setPin(pin);
      const pending = (await verify())!;
      await type(pending.verificationId, pin);
      await setMode("phone_match_and_facts");
      expect(await cancel(pending.verificationId)).not.toBeNull();
      expect(await appointmentStatus()).toBe("canceled");
    });
  });
});

/**
 * The seed plus an API key the business's admin made, and the v1 PIN
 * operations run as the worker role, as the admin serves /api/v1.
 */
async function seedApi(tx: DatabaseTransaction) {
  const seeded = await seed(tx);
  const generated = generateApiKey();
  const [key] = await tx.insert(apiKeys).values({ businessId: seeded.businessId, name: "PINs", prefix: generated.prefix, keyHash: generated.keyHash, scopes: ["contacts:read", "contacts:write"], createdByUserId: seeded.userIds.admin }).returning({ id: apiKeys.id });
  const caller: ApiKeyCaller = { businessId: seeded.businessId, apiKeyId: key!.id };
  const db = tx as unknown as Database;
  const asWorker = async () => { await tx.execute(sql`set local role lobbystack_worker`); };
  const asOwner = async () => { await tx.execute(sql`reset role`); };
  return {
    ...seeded,
    setPins: async (passcodes: ApiContactPasscodesUpdate["passcodes"]) => {
      await asWorker();
      return await setContactPasscodesForApi({ db }, caller, { passcodes });
    },
    generate: async (input: ApiContactPasscodesGenerate = {}) => {
      await asWorker();
      return await generateContactPasscodesForApi({ db }, caller, input);
    },
    get: async (contactId: string) => {
      await asWorker();
      return await getContactForApi({ db }, caller, contactId);
    },
    list: async () => {
      await asWorker();
      return (await listContactsForApi({ db }, caller, { limit: 100 })).data;
    },
    addContacts: async (values: Array<{ name: string; phone?: string | null; email?: string; createdAt?: Date }>) => {
      await asOwner();
      return (await tx.insert(contacts).values(values.map((value) => ({ businessId: seeded.businessId, ...value }))).returning({ id: contacts.id })).map((row) => row.id);
    },
    demoteAdmin: async () => {
      await asOwner();
      await tx.update(businessMemberships).set({ role: "scheduler" }).where(and(eq(businessMemberships.businessId, seeded.businessId), eq(businessMemberships.userId, seeded.userIds.admin)));
    },
  };
}

const daysAgo = (days: number) => DateTime.utc().minus({ days }).toJSDate();

describe.skipIf(!client)("keypad PINs through the v1 API", () => {
  it("sets, replaces and removes many contacts' PINs at once, and shows only whether each has one", async () => {
    await rollbackTest(async (tx) => {
      const { contactId, setPins, get, list, row, lock, verify, type, expire, addContacts, audits } = await seedApi(tx);
      const [ana] = await addContacts([{ name: "Ana", phone: "+14165550101" }]);
      expect((await get(contactId)).passcode).toBeNull();

      const set = await setPins([{ contact_id: ana!, passcode: "935172" }, { contact_id: contactId, passcode: pin }]);
      expect(set.map((contact) => contact.id)).toEqual([ana, contactId]);
      for (const contact of set) expect(contact.passcode).toEqual({ set_at: expect.any(String), locked: false });
      expect((await row(ana))!.passcodeHash).toMatch(/^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(JSON.stringify(await list())).not.toMatch(/935172|480613|scrypt/);
      // The PIN works on a call.
      const call = (await verify())!;
      expect(await type(call.verificationId, pin)).toMatchObject({ ok: true, status: "passcode_verified" });
      await expire(call.verificationId);

      await lock();
      expect((await get(contactId)).passcode).toMatchObject({ locked: true });
      expect((await list()).find((contact) => contact.id === contactId)!.passcode).toMatchObject({ locked: true });

      // Ids in any case; a new PIN unlocks, and null removes.
      const changed = await setPins([{ contact_id: contactId.toUpperCase(), passcode: "935172" }, { contact_id: ana!, passcode: null }]);
      expect(changed.map((contact) => [contact.id, contact.passcode?.locked ?? null])).toEqual([[contactId, false], [ana, null]]);
      expect(await row(ana)).toBeUndefined();
      const nextCall = (await verify())!;
      expect(nextCall.status).toBe("passcode_pending");
      expect(await type(nextCall.verificationId, pin)).toMatchObject({ ok: false, status: "passcode_pending" });
      expect(await type(nextCall.verificationId, "935172")).toMatchObject({ ok: true, status: "passcode_verified" });
      expect(await audits("api.contact.passcode")).toEqual(["api.contact.passcode_removed", "api.contact.passcode_set", "api.contact.passcode_set", "api.contact.passcode_set"]);
    });
  });

  it("changes nothing when a contact is another business's or sent twice", async () => {
    await rollbackTest(async (tx) => {
      const { contactId, setPins, generate, row } = await seedApi(tx);
      const other = await seed(tx);
      await expect(setPins([{ contact_id: contactId, passcode: pin }, { contact_id: other.contactId, passcode: pin }])).rejects.toMatchObject({ status: 400, code: "invalid_request", details: [{ path: "passcodes.1.contact_id", message: "Unknown contact." }] });
      await expect(setPins([{ contact_id: contactId, passcode: pin }, { contact_id: contactId.toUpperCase(), passcode: null }])).rejects.toMatchObject({ status: 400, details: [{ path: "passcodes.1.contact_id", message: "This contact is already in the list." }] });
      await expect(generate({ contact_ids: [other.contactId] })).rejects.toMatchObject({ status: 400, details: [{ path: "contact_ids.0", message: "Unknown contact." }] });
      expect(await row()).toBeUndefined();
      expect(await other.row()).toBeUndefined();
    });
  });

  it("refuses a key whose creator is no longer an owner or admin, as the dashboard would", async () => {
    await rollbackTest(async (tx) => {
      const { contactId, setPins, generate, demoteAdmin, row } = await seedApi(tx);
      await demoteAdmin();
      await expect(setPins([{ contact_id: contactId, passcode: pin }])).rejects.toMatchObject({ status: 403, code: "key_owner_inactive" });
      await expect(generate()).rejects.toMatchObject({ status: 403, code: "key_owner_inactive" });
      expect(await row()).toBeUndefined();
    });
  });

  it("gives a PIN to each contact with a phone number and none yet, oldest first, and returns it once", async () => {
    await rollbackTest(async (tx) => {
      const { contactId, setPin, generate, get, row, verify, type, addContacts, audits } = await seedApi(tx);
      const [oldest, hasPin, noPhone] = await addContacts([
        { name: "Ana", phone: "+14165550101", createdAt: daysAgo(3) },
        { name: "Bo", phone: "+14165550102", createdAt: daysAgo(5) },
        { name: "Cy", phone: null, email: "cy@example.invalid", createdAt: daysAgo(4) },
      ]);
      await setPin(pin, undefined, hasPin);
      const kept = (await row(hasPin))!.passcodeHash;

      const generated = await generate({ length: 4 });
      expect(generated.contacts.map((contact) => contact.id)).toEqual([oldest, contactId]);
      for (const contact of generated.contacts) {
        expect(contact.new_passcode).toMatch(/^\d{4}$/);
        expect(isGuessableContactPasscode(contact.new_passcode)).toBe(false);
        expect(contact.passcode).toEqual({ set_at: expect.any(String), locked: false });
      }
      expect(generated.remaining).toBe(0);
      expect((await row(hasPin))!.passcodeHash).toBe(kept);
      expect(await row(noPhone)).toBeUndefined();
      // Only the response has the PIN; the contact shows whether there is one.
      expect(await get(contactId)).not.toHaveProperty("new_passcode");
      const milan = generated.contacts.find((contact) => contact.id === contactId)!;
      expect(await type((await verify())!.verificationId, milan.new_passcode)).toMatchObject({ ok: true, status: "passcode_verified" });

      expect(await generate()).toEqual({ contacts: [], remaining: 0 });
      expect(await audits("api.contact.passcode")).toEqual(["api.contact.passcode_generated", "api.contact.passcode_generated"]);
    });
  });

  it("gives the named contacts a new PIN even when they have one, which unlocks it", async () => {
    await rollbackTest(async (tx) => {
      const { contactId, setPin, generate, lock, row, verify, type, addContacts } = await seedApi(tx);
      const [noPhone, waiting] = await addContacts([{ name: "Cy", phone: null, email: "cy@example.invalid" }, { name: "Ana", phone: "+14165550101" }]);
      await setPin(pin);
      await lock();

      const generated = await generate({ contact_ids: [noPhone!, contactId] });
      expect(generated.contacts.map((contact) => [contact.id, contact.passcode?.locked, contact.new_passcode.length])).toEqual([[noPhone, false, 6], [contactId, false, 6]]);
      expect((await row())!).toMatchObject({ failedAttempts: 0, lockedAt: null });
      expect(await row(waiting)).toBeUndefined();
      expect(generated.remaining).toBe(1);
      const milan = generated.contacts[1]!;
      expect(await type((await verify())!.verificationId, milan.new_passcode)).toMatchObject({ ok: true });
    });
  });

  it("gives at most CONTACT_PASSCODES_MAX_PER_REQUEST PINs per request and counts the contacts still waiting", { timeout: 120_000 }, async () => {
    await rollbackTest(async (tx) => {
      const { generate, addContacts } = await seedApi(tx);
      // With the seeded contact, one more contact than a request takes has a phone number and no PIN.
      await addContacts(Array.from({ length: CONTACT_PASSCODES_MAX_PER_REQUEST }, (_, index) => ({ name: `Caller ${index}`, phone: `+1416555${String(2000 + index)}`, createdAt: daysAgo(1) })));
      const first = await generate({ length: 4 });
      expect(first.contacts).toHaveLength(CONTACT_PASSCODES_MAX_PER_REQUEST);
      expect(first.remaining).toBe(1);
      const second = await generate({ length: 4 });
      expect(second.contacts).toHaveLength(1);
      expect(second.remaining).toBe(0);
      expect(new Set([...first.contacts, ...second.contacts].map((contact) => contact.id)).size).toBe(CONTACT_PASSCODES_MAX_PER_REQUEST + 1);
    });
  });
});
