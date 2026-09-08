import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { businesses, businessMemberships, calls, contacts, conversations, conversationSessions, appointments, services, staff, createDatabaseClient, inboxItems, users, withBusinessTransaction } from "@lobbystack/db";
import { recordCallSchedulingProgress, bookAppointment, finalizeConversationSession, listCalls, completeVoiceFollowUpTasks, createVoiceFollowUpTask, listOpenVoiceFollowUps, getCallDetail, runPrivacyRetentionSweep, startCall } from "@lobbystack/domain";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const auth = createDatabaseClient("lobbystack_auth");
const worker = createDatabaseClient("lobbystack_worker");
const app = createDatabaseClient("lobbystack_app");
const userId = randomUUID();
const businessId = randomUUID();
const foreignBusinessId = randomUUID();
const callId = randomUUID();
const foreignCallId = randomUUID();
const serviceId = randomUUID();
try {
  await auth.db.insert(users).values({ id: userId, email: `${userId}@follow-up.invalid`, normalizedEmail: `${userId}@follow-up.invalid` });
  for (const [tenant, call] of [[businessId, callId], [foreignBusinessId, foreignCallId]] as const) {
    await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => {
      await tx.insert(businesses).values({ id: tenant, slug: `follow-up-${tenant}`, name: "Follow-up certification", timezone: "UTC", businessType: "service_company" });
      await tx.insert(businessMemberships).values({ businessId: tenant, userId, role: "business_owner", status: "active" });
      const contactId = randomUUID(), conversationId = randomUUID();
      await tx.insert(contacts).values({ id: contactId, businessId: tenant, phone: "+14165550199" });
      await tx.insert(conversations).values({ id: conversationId, businessId: tenant, contactId, channel: "voice" });
      await tx.insert(calls).values({ contactId, conversationId, id: call, businessId: tenant, providerCallId: call, transport: "voice", status: "completed", startedAt: new Date() });
      await tx.insert(conversationSessions).values({ businessId: tenant, callId: call, conversationId, channel: "voice" });
      if (tenant === businessId) {
        await tx.insert(services).values({ id: serviceId, businessId, name: "Consultation", slug: "consultation", durationMinutes: 30 });
        await tx.insert(staff).values({ businessId, name: "Provider", timezone: "UTC" });
      }
    });
  }
  await recordCallSchedulingProgress({ db: worker.db }, { businessId, callId, serviceName: "Consultation", startsAt: "2027-01-01T10:00:00Z" });
  const scheduling = (await listCalls({ db: app.db }, { businessId, userId })).calls[0]?.outcome as { kind: string; startsAt: string };
  assert(scheduling.kind === "booking_in_progress" && scheduling.startsAt === "2027-01-01T10:00:00Z", "Live scheduling progress was not persisted.");
  const tasks = await Promise.all(Array.from({ length: 8 }, (_, index) => createVoiceFollowUpTask({ db: worker.db }, { businessId, callId, message: `Retry ${index}` })));
  assert(new Set(tasks.map((task) => task.inboxItemId)).size === 1, "Concurrent retries created duplicate follow-ups.");
  const callPage = await listCalls({ db: app.db }, { businessId, userId, limit: 1, offset: 1 });
  assert(callPage.calls.length === 0 && callPage.pagination.total === 1 && !callPage.pagination.hasNext, "Call pagination lost its total beyond the final page.");
  const noMatch = await listCalls({ db: app.db }, { businessId, userId, search: "no-matching-call-marker" });
  assert(noMatch.pagination.total === 0, "Call pagination total ignored the search filter.");
  const outcomeBefore = (await listCalls({ db: app.db }, { businessId, userId })).calls[0]?.outcome as { kind: string };
  assert(outcomeBefore.kind === "message_taking", "Follow-up outcome did not replace an initially empty session summary.");
  const booking = { businessId, callId, serviceId, startsAt: "2027-01-01T10:00:00Z", timezone: "UTC", contactPhone: "+14165550199", sourceChannel: "voice" };
  await bookAppointment({ db: worker.db }, booking);
  await finalizeConversationSession({ db: worker.db }, { businessId, callId });
  await createVoiceFollowUpTask({ db: worker.db }, { businessId, callId, message: "Additional callback" });
  await recordCallSchedulingProgress({ db: worker.db }, { businessId, callId, serviceName: "Consultation" });
  const outcomeAfter = (await listCalls({ db: app.db }, { businessId, userId })).calls[0]?.outcome as { kind: string; serviceName: string; startsAt: string };
  assert(outcomeAfter.kind === "booked" && outcomeAfter.serviceName === "Consultation" && Date.parse(outcomeAfter.startsAt) === Date.parse(booking.startsAt), "Finalization or follow-up overwrote the confirmed booking outcome.");
  let bookingRejected = false;
  try { await bookAppointment({ db: worker.db }, { ...booking, callId: foreignCallId, startsAt: "2027-01-02T10:00:00Z" }); } catch { bookingRejected = true; }
  assert(bookingRejected, "Booking accepted a foreign call association.");
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => assert((await tx.select().from(appointments).where(eq(appointments.businessId, businessId))).length === 1, "Failed call association left a committed appointment."));
  let rejected = false;
  try { await createVoiceFollowUpTask({ db: worker.db }, { businessId, callId: foreignCallId, message: "Must not cross tenants" }); } catch { rejected = true; }
  assert(rejected, "Follow-up creation accepted a foreign tenant call.");
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
    await tx.insert(inboxItems).values([
      { businessId, relatedCallId: callId, kind: "voice_message", title: "Imported duplicate", body: "Legacy duplicate" },
      { businessId, relatedCallId: callId, kind: "voice_message", title: "Newest duplicate", body: "Latest", createdAt: new Date(Date.now() + 1000) },
    ]);
  });
  await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async (tx) => {
    const rows = await listOpenVoiceFollowUps(tx, businessId);
    assert(rows.length === 1 && rows[0]?.title === "Newest duplicate", "Dashboard did not deduplicate legacy follow-ups to the newest task.");
  });
  assert((await completeVoiceFollowUpTasks({ db: app.db }, { businessId, userId, callId })).completed === 3, "Completing a follow-up did not finish every open duplicate.");
  assert((await completeVoiceFollowUpTasks({ db: app.db }, { businessId, userId, callId })).completed === 0, "Follow-up completion was not idempotent.");
  await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async (tx) => assert((await listOpenVoiceFollowUps(tx, businessId)).length === 0, "Completed follow-ups remained on the dashboard."));
  const expiredId = randomUUID();
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
    await tx.insert(inboxItems).values({ id: expiredId, businessId, relatedCallId: callId, kind: "voice_message", title: "Private expired title", body: "Private expired body", contentExpiresAt: new Date(0) });
  });
  await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async (tx) => {
    const rows = await listOpenVoiceFollowUps(tx, businessId);
    assert(rows[0]?.title === "Expired voice message" && !rows[0]?.body.includes("Private"), "Dashboard exposed expired content before the retention worker ran.");
  });
  const detail = await getCallDetail({ db: app.db }, { userId, businessId, callId });
  assert(!JSON.stringify(detail?.followUpTasks).includes("Private expired"), "Call detail exposed expired follow-up content.");
  assert((await runPrivacyRetentionSweep({ db: worker.db }, { businessId })).scrubbedFollowUps === 1, "Retention sweep did not scrub expired follow-ups.");
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select().from(inboxItems).where(eq(inboxItems.id, expiredId));
    assert(row?.contentRetentionStatus === "scrubbed" && !row.body.includes("Private"), "Expired follow-up content remained stored.");
  });
  for (const [index, contactPhone] of ["+14165550198", "+14165550199"].entries()) {
    const webCall = await startCall({ db: worker.db }, { businessId, provider: "openai_realtime", providerCallId: randomUUID(), from: "web", to: "test", transport: "web_voice", billable: false });
    const result = await bookAppointment({ db: worker.db }, { ...booking, callId: webCall.callId, contactPhone, sourceChannel: "web_voice", startsAt: `2027-02-0${index + 1}T10:00:00Z` });
    assert(result.contactId !== webCall.contactId, "Browser booking did not resolve its phone contact.");
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      const [call] = await tx.select().from(calls).where(eq(calls.id, webCall.callId));
      const [conversation] = await tx.select().from(conversations).where(eq(conversations.id, webCall.conversationId));
      const [session] = await tx.select().from(conversationSessions).where(eq(conversationSessions.callId, webCall.callId));
      assert(call?.contactId === result.contactId && conversation?.contactId === result.contactId, "Browser call and conversation were not linked to the booking contact.");
      assert(session?.summaryKind === "booked", "Browser booking outcome was not recorded.");
    });
    const repeat = await bookAppointment({ db: worker.db }, { ...booking, callId: webCall.callId, contactPhone, sourceChannel: "web_voice", startsAt: `2027-03-0${index + 1}T10:00:00Z` });
    assert(repeat.contactId === result.contactId, "A subsequent browser booking changed the identified contact.");
    let mismatchRejected = false;
    try { await bookAppointment({ db: worker.db }, { ...booking, callId: webCall.callId, contactPhone: "+14165550197", startsAt: `2027-04-0${index + 1}T10:00:00Z` }); } catch { mismatchRejected = true; }
    assert(mismatchRejected, "An identified browser caller was reassigned to a different phone contact.");
  }
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => assert((await tx.select().from(appointments).where(eq(appointments.businessId, businessId))).length === 5, "Rejected browser contact associations left committed bookings."));
  console.log(JSON.stringify({ factualOutcomePersists: true, failedAssociationRollsBack: true, concurrentDeduplication: true, legacyDeduplication: true, tenantIsolation: true, completesAllDuplicates: true, completionIdempotency: true, dashboardRemoval: true, expiredContentHidden: true, retentionScrubbing: true, browserBookingContacts: true }));
} finally {
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, tenant)));
  await auth.db.delete(users).where(eq(users.id, userId));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
