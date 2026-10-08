import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { afterAll, describe, expect, it } from "vitest";
import { appointments, businessMemberships, businesses, calls, contacts, conversations, createDatabaseClient, inboxItems, services, staff, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { createAppointmentChangeVerification } from "./appointmentChanges";
import { cancelAppointment, cancelAppointmentInTransaction } from "./booking";
import { listCurrentAppointments, listUpcomingAppointments } from "./operatorActivity";
import { requestCancellationForCaller, takeMessageForStaff } from "./receptionistActions";
import { CANCELLATION_REQUEST, completeVoiceFollowUpTasks, getCallDetail, listOpenVoiceFollowUps } from "./voice";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Appointment cancellation integration tests require a dedicated local test database.");
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

const timezone = "America/Toronto";
const local = (days: number, hour: number) => DateTime.now().setZone(timezone).plus({ days }).set({ hour, minute: 0, second: 0, millisecond: 0 });
const asked = (time: DateTime) => time.toFormat("yyyy-LL-dd'T'HH:mm");

/**
 * A business with Milan's consultation tomorrow at 3 PM and cleaning in three
 * days, Ana's consultation at the same time tomorrow, and a cancelled one of
 * Milan's. A browser call is in progress. Each role is a member.
 */
async function seed(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userIds = { scheduler: randomUUID(), viewer: randomUUID() };
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Cancellation test", timezone, businessType: "test", telemetryEnabled: false });
  for (const [role, id] of Object.entries(userIds)) {
    await tx.insert(users).values({ id, email: `${id}@example.invalid`, normalizedEmail: `${id}@example.invalid` });
    await tx.insert(businessMemberships).values({ businessId, userId: id, role });
  }
  const [milan] = await tx.insert(contacts).values({ businessId, name: "Milan Obrenovic", phone: "+14165550100" }).returning();
  const [ana] = await tx.insert(contacts).values({ businessId, name: "Ana", phone: "+14165550101" }).returning();
  const [employee] = await tx.insert(staff).values({ businessId, name: "Sam", timezone }).returning();
  const [colleague] = await tx.insert(staff).values({ businessId, name: "Jo", timezone }).returning();
  const [consultation] = await tx.insert(services).values({ businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 }).returning();
  const [cleaning] = await tx.insert(services).values({ businessId, name: "Cleaning", slug: "cleaning", durationMinutes: 30 }).returning();
  const book = async (contactId: string, serviceId: string, startsAt: DateTime, status = "confirmed", staffId = employee!.id) => (await tx.insert(appointments).values({ businessId, contactId, staffId, serviceId, startsAt: startsAt.toJSDate(), endsAt: startsAt.plus({ minutes: 30 }).toJSDate(), timezone, status, sourceChannel: "web_voice" }).returning())[0]!.id;
  const ids = {
    consultation: await book(milan!.id, consultation!.id, local(1, 15)),
    cleaning: await book(milan!.id, cleaning!.id, local(3, 10)),
    anas: await book(ana!.id, consultation!.id, local(1, 15), "confirmed", colleague!.id),
    cancelled: await book(milan!.id, consultation!.id, local(2, 9), "canceled"),
  };
  const conversationId = randomUUID();
  await tx.insert(conversations).values({ id: conversationId, businessId, contactId: milan!.id, channel: "voice" });
  const [call] = await tx.insert(calls).values({ businessId, conversationId, provider: "openai_live", providerCallId: `rtc_${randomUUID()}`, transport: "web_voice", status: "started", startedAt: new Date() }).returning();
  const db = tx as unknown as Database;
  const as = async (role: "lobbystack_worker" | "lobbystack_app") => { await tx.execute(sql.raw(`set local role ${role}`)); };
  // The agent's tool runs as the worker; the dashboard reads as the operator.
  const request = async (input: { callerName: string; appointmentStartsAt?: string; serviceName?: string; callbackPhone?: string }) => {
    await as("lobbystack_worker");
    return await requestCancellationForCaller({ db }, { businessId, channel: "web_voice", timezone, callId: call!.id, conversationId, ...input });
  };
  const message = async (text: string) => {
    await as("lobbystack_worker");
    return await takeMessageForStaff({ db }, { businessId, channel: "web_voice", message: text, callerName: "Milan Obrenovic", callId: call!.id, conversationId });
  };
  // A request saved before this one's appointment was cancelled, or from another call.
  const openRequest = async (appointmentId: string) => {
    await tx.execute(sql`reset role`);
    return (await tx.insert(inboxItems).values({ businessId, kind: "voice_message", title: "Voice message from Milan Obrenovic", body: "Cancellation request: appointment", metadata: { request: CANCELLATION_REQUEST, appointmentId } }).returning())[0]!.id;
  };
  const complete = async (inboxItemId?: string) => {
    await as("lobbystack_app");
    return await completeVoiceFollowUpTasks({ db }, { userId: userIds.scheduler, businessId, callId: call!.id, ...(inboxItemId ? { inboxItemId } : {}) });
  };
  const detail = async () => {
    await as("lobbystack_app");
    return (await getCallDetail({ db }, { userId: userIds.scheduler, businessId, callId: call!.id }))!.followUpTasks;
  };
  const item = async (inboxItemId: string) => {
    await tx.execute(sql`reset role`);
    return (await tx.select().from(inboxItems).where(eq(inboxItems.id, inboxItemId)))[0]!;
  };
  const dashboard = async () => {
    await as("lobbystack_app");
    return await withBusinessTransaction(db, { businessId, userId: userIds.scheduler, actorType: "operator" }, async (appTx) => ({
      followUps: await listOpenVoiceFollowUps(appTx, businessId),
      upcoming: (await listUpcomingAppointments(appTx, businessId, new Date())).map((row) => row.id),
      current: (await listCurrentAppointments(appTx, businessId, new Date())).map((row) => row.id),
    }));
  };
  const cancel = async (userId: string, appointmentId: string) => {
    await as("lobbystack_app");
    return await cancelAppointment({ db }, { userId, businessId, appointmentId });
  };
  // The caller on the phone, the public API and MCP cancel as the worker.
  const cancelAsWorker = async (appointmentId: string) => {
    await as("lobbystack_worker");
    return await withBusinessTransaction(db, { businessId, actorType: "worker" }, async (workerTx) => await cancelAppointmentInTransaction(workerTx, { businessId, appointmentId, change: { source: "caller" } }));
  };
  const status = async (appointmentId: string) => {
    await tx.execute(sql`reset role`);
    return (await tx.select({ status: appointments.status }).from(appointments).where(eq(appointments.id, appointmentId)))[0]?.status;
  };
  // The self-service check a phone call from the booking number runs before a change.
  const verify = async (input: { callerPhone: string; appointmentStartsAt?: string; serviceName?: string }) => {
    await as("lobbystack_worker");
    return await createAppointmentChangeVerification({ db }, { businessId, action: "cancel", ...input });
  };
  return { ids, userIds, request, message, openRequest, complete, detail, item, dashboard, cancel, cancelAsWorker, status, verify };
}

describe.skipIf(!client)("self-service changes from the booking number", () => {
  // On staging the booking saved "Rafael Morenzi" and the cancel calls heard "Raphael Morency" and "Rafael Marancy",
  // so the name no longer takes part.
  it("verifies by the caller's number and the appointment's time or service, without a name", async () => {
    await rollbackTest(async (tx) => {
      const { ids, verify } = await seed(tx);
      expect((await verify({ callerPhone: "+14165550100", appointmentStartsAt: asked(local(1, 15)) }))?.appointmentId).toBe(ids.consultation);
      expect(await verify({ callerPhone: "+14165550100", serviceName: "Cleaning" })).toMatchObject({ appointmentId: ids.cleaning, status: "facts_verified" });
    });
  });

  it("still needs the number the appointment was booked with, and the time or service", async () => {
    await rollbackTest(async (tx) => {
      const { verify } = await seed(tx);
      expect(await verify({ callerPhone: "+14165550199", appointmentStartsAt: asked(local(1, 15)) })).toBeNull();
      expect(await verify({ callerPhone: "+14165550100" })).toBeNull();
      expect(await verify({ callerPhone: "+14165550100", appointmentStartsAt: asked(local(1, 17)) })).toBeNull();
    });
  });
});

describe.skipIf(!client)("cancellation requests from calls without a trusted number", () => {
  it("links the one upcoming appointment that matches the caller's name and time", async () => {
    await rollbackTest(async (tx) => {
      const { ids, request, item, dashboard } = await seed(tx);
      const saved = await request({ callerName: " milan obrenovic ", appointmentStartsAt: asked(local(1, 15)), serviceName: "consultation" });
      const row = await item(saved.inboxItemId);
      expect(row.metadata).toMatchObject({ request: CANCELLATION_REQUEST, appointmentId: ids.consultation, channel: "web_voice" });
      expect(row.body).toContain(`Cancellation request: consultation, ${local(1, 15).toFormat("cccc, LLLL d 'at' h:mm a")}`);
      const { followUps } = await dashboard();
      expect(followUps).toEqual([expect.objectContaining({ id: saved.inboxItemId, request: CANCELLATION_REQUEST, appointment: { id: ids.consultation, startsAt: local(1, 15).toJSDate(), timezone, status: "confirmed", serviceName: "Consultation", contactName: "Milan Obrenovic" } })]);
    });
  });

  it("matches a date without a time, a name by sound, and the number when the caller gives one", async () => {
    await rollbackTest(async (tx) => {
      const { ids, request, item } = await seed(tx);
      const link = async (input: Parameters<typeof request>[0]) => ((await item((await request(input)).inboxItemId)).metadata as { appointmentId?: string }).appointmentId;
      expect(await link({ callerName: "Milan Obrenovic", appointmentStartsAt: local(3, 10).toISODate()!, callbackPhone: "+14165550100" })).toBe(ids.cleaning);
      // A name part or a misheard spelling with the right number links; any name with another number doesn't.
      expect(await link({ callerName: "Milan", appointmentStartsAt: local(3, 10).toISODate()!, callbackPhone: "+14165550100" })).toBe(ids.cleaning);
      expect(await link({ callerName: "Mylan Obrenowitz", appointmentStartsAt: local(3, 10).toISODate()!, callbackPhone: "+14165550100" })).toBe(ids.cleaning);
      expect(await link({ callerName: "Ana", appointmentStartsAt: asked(local(1, 15)), callbackPhone: "+14165550199" })).toBeUndefined();
      expect(await link({ callerName: "Ana", appointmentStartsAt: asked(local(1, 15)), callbackPhone: "+14165550101" })).toBe(ids.anas);
    });
  });

  it("doesn't link anything when the date or time doesn't parse, even when the name has one appointment", async () => {
    await rollbackTest(async (tx) => {
      const { ids, request, item } = await seed(tx);
      expect((await item((await request({ callerName: "Ana" })).inboxItemId)).metadata).toMatchObject({ appointmentId: ids.anas });
      for (const appointmentStartsAt of ["next Tuesday afternoon", "2026-13-45", "tomorrow at 3"]) {
        expect((await item((await request({ callerName: "Ana", appointmentStartsAt })).inboxItemId)).metadata).not.toHaveProperty("appointmentId");
      }
    });
  });

  it("saves the request without a link when the details fit no single appointment", async () => {
    await rollbackTest(async (tx) => {
      const { request, item, dashboard } = await seed(tx);
      // Two of Milan's appointments, nobody by that name, a wildcard, and an unreadable time.
      for (const input of [{ callerName: "Milan Obrenovic" }, { callerName: "Someone Else", appointmentStartsAt: asked(local(1, 15)) }, { callerName: "%" }, { callerName: "Milan Obrenovic", appointmentStartsAt: "next Tuesday afternoon" }]) {
        const row = await item((await request(input)).inboxItemId);
        expect(row.metadata).toEqual(expect.objectContaining({ request: CANCELLATION_REQUEST }));
        expect(row.metadata).not.toHaveProperty("appointmentId");
      }
      expect((await item((await request({ callerName: "Milan Obrenovic", appointmentStartsAt: "next Tuesday afternoon" })).inboxItemId)).body).toContain("Cancellation request: next Tuesday afternoon");
      expect((await dashboard()).followUps[0]).toMatchObject({ request: CANCELLATION_REQUEST, appointment: null });
    });
  });
});

describe.skipIf(!client)("several follow-ups on one call", () => {
  it("keeps a message and cancellation requests for different appointments as separate items, and a retry as one", async () => {
    await rollbackTest(async (tx) => {
      const { ids, request, message, item, dashboard, detail, complete } = await seed(tx);
      const consultation = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: asked(local(1, 15)) });
      const note = await message("Please also call me about parking.");
      const cleaning = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: local(3, 10).toISODate()!, serviceName: "Cleaning" });
      // Retries: the same request again, with more detail, and a second message.
      expect((await request({ callerName: "Milan Obrenovic", appointmentStartsAt: asked(local(1, 15)), serviceName: "Consultation" })).inboxItemId).toBe(consultation.inboxItemId);
      expect((await message("Please call me about parking, after 5.")).inboxItemId).toBe(note.inboxItemId);
      // An unlinked request is a retry only with the same details.
      const vague = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: "next Tuesday afternoon" });
      expect((await request({ callerName: "Milan Obrenovic", appointmentStartsAt: "next Tuesday afternoon" })).inboxItemId).toBe(vague.inboxItemId);
      const march = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: "the one in March" });
      expect(march.inboxItemId).not.toBe(vague.inboxItemId);

      expect((await item(consultation.inboxItemId)).metadata).toMatchObject({ request: CANCELLATION_REQUEST, appointmentId: ids.consultation });
      expect((await item(consultation.inboxItemId)).body).toContain("Consultation");
      expect((await item(cleaning.inboxItemId)).metadata).toMatchObject({ request: CANCELLATION_REQUEST, appointmentId: ids.cleaning });
      expect((await item(note.inboxItemId)).metadata).not.toHaveProperty("request");
      expect((await item(note.inboxItemId)).body).toContain("after 5");
      const listed = (await dashboard()).followUps.map((row) => row.id);
      expect(new Set(listed)).toEqual(new Set([consultation, note, cleaning, vague, march].map((saved) => saved.inboxItemId)));
      expect(listed).toHaveLength(5);
      expect((await detail()).filter((task) => task.status === "open")).toHaveLength(5);

      // Marking one done on the call page leaves the others open.
      await expect(complete(note.inboxItemId)).resolves.toEqual({ completed: 1 });
      await expect(complete(cleaning.inboxItemId)).resolves.toEqual({ completed: 1 });
      expect((await item(consultation.inboxItemId)).status).toBe("open");
      expect((await dashboard()).followUps.map((row) => row.id)).not.toContain(note.inboxItemId);
      expect((await dashboard()).followUps).toHaveLength(3);
      await expect(complete()).resolves.toEqual({ completed: 3 });
    });
  });
});

describe.skipIf(!client)("operator cancellation under operator RLS", () => {
  it("approves the request: cancels the appointment, drops it from Upcoming and closes the request", async () => {
    await rollbackTest(async (tx) => {
      const { ids, userIds, request, item, dashboard, cancel, status } = await seed(tx);
      const saved = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: asked(local(1, 15)) });
      const before = await dashboard();
      // The appointment cancelled before was never listed.
      expect(new Set(before.upcoming)).toEqual(new Set([ids.consultation, ids.anas, ids.cleaning]));
      expect(new Set(before.current)).toEqual(new Set([ids.consultation, ids.anas, ids.cleaning]));

      await expect(cancel(userIds.scheduler, ids.consultation)).resolves.toBe("cancelled");
      expect(await status(ids.consultation)).toBe("canceled");
      expect((await item(saved.inboxItemId)).status).toBe("done");
      const after = await dashboard();
      expect(after.upcoming).not.toContain(ids.consultation);
      expect(after.current).not.toContain(ids.consultation);
      expect(after.followUps).toEqual([]);
      await expect(cancel(userIds.scheduler, ids.consultation)).resolves.toBe("already");
    });
  });

  it("closes every open request for the appointment, whatever cancels it, but not a request for another appointment", async () => {
    await rollbackTest(async (tx) => {
      const { ids, userIds, request, openRequest, item, dashboard, cancel, cancelAsWorker } = await seed(tx);
      const saved = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: asked(local(1, 15)) });
      const duplicate = await openRequest(ids.consultation);
      const other = await request({ callerName: "Milan Obrenovic", appointmentStartsAt: local(3, 10).toISODate()! });
      // The caller cancels on the phone, as the public API and MCP do.
      await expect(cancelAsWorker(ids.consultation)).resolves.toBe("cancelled");
      expect((await item(saved.inboxItemId)).status).toBe("done");
      expect((await item(duplicate)).status).toBe("done");
      expect((await item(other.inboxItemId)).status).toBe("open");
      expect((await dashboard()).followUps.map((row) => row.id)).toEqual([other.inboxItemId]);
      // An operator cancels the other one.
      await expect(cancel(userIds.scheduler, ids.cleaning)).resolves.toBe("cancelled");
      expect((await item(other.inboxItemId)).status).toBe("done");
    });
  });

  it("shows a request for an appointment cancelled before as already cancelled, and closes it on a later cancel", async () => {
    await rollbackTest(async (tx) => {
      const { ids, userIds, openRequest, item, dashboard, cancel } = await seed(tx);
      const stale = await openRequest(ids.cancelled);
      expect((await dashboard()).followUps).toEqual([expect.objectContaining({ id: stale, request: CANCELLATION_REQUEST, appointment: expect.objectContaining({ id: ids.cancelled, status: "canceled" }) })]);
      await expect(cancel(userIds.scheduler, ids.cancelled)).resolves.toBe("already");
      expect((await item(stale)).status).toBe("done");
    });
  });

  it("refuses viewers and reports an unknown appointment as not found", async () => {
    await rollbackTest(async (tx) => {
      const { ids, userIds, cancel, status } = await seed(tx);
      await expect(cancel(userIds.viewer, ids.consultation)).rejects.toMatchObject({ status: 403 });
      expect(await status(ids.consultation)).toBe("confirmed");
      await expect(cancel(userIds.scheduler, randomUUID())).rejects.toMatchObject({ status: 404, code: "not_found" });
    });
  });
});
