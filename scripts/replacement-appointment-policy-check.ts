import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { appointments, businesses, contacts, createDatabaseClient, receptionistProfiles, services, staff, withBusinessTransaction } from "@lobbystack/db";
import { cancelAppointmentForCaller, createAppointmentChangeVerification } from "@lobbystack/domain";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const worker = createDatabaseClient("lobbystack_worker");
const businessId = randomUUID(), contactId = randomUUID(), serviceId = randomUUID(), staffId = randomUUID(), appointmentId = randomUUID();
const callerPhone = "+14165550199";
const policy = { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" };
const scoped = <T>(run: Parameters<typeof withBusinessTransaction<T>>[2]) => withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, run);
try {
  await scoped(async (tx) => {
    await tx.insert(businesses).values({ id: businessId, slug: `policy-${businessId}`, name: "Policy certification", timezone: "UTC", businessType: "clinic" });
    await tx.insert(contacts).values({ id: contactId, businessId, phone: callerPhone, name: "Alex Morgan" });
    await tx.insert(services).values({ id: serviceId, businessId, name: "Dental exam", slug: "dental-exam", durationMinutes: 30, localizedNames: { fr: "Examen dentaire" } });
    await tx.insert(staff).values({ id: staffId, businessId, name: "Provider", timezone: "UTC" });
    await tx.insert(receptionistProfiles).values({ businessId, greeting: "Hello", tone: "warm", summary: "Clinic", bookingPolicy: "Confirm bookings", transferMode: "on_request", appointmentChangePolicy: policy });
    await tx.insert(appointments).values({ id: appointmentId, businessId, contactId, serviceId, staffId, startsAt: new Date("2027-01-01T10:00:00Z"), endsAt: new Date("2027-01-01T10:30:00Z"), timezone: "UTC", status: "confirmed", sourceChannel: "voice" });
  });
  const input = { businessId, appointmentId, callerPhone, action: "cancel" as const, callerName: "Alex Morgan", serviceName: "Examen dentaire" };
  assert(await createAppointmentChangeVerification({ db: worker.db }, { businessId, appointmentId, callerPhone, action: "cancel" }) === null, "Missing appointment facts were accepted.");
  assert(await createAppointmentChangeVerification({ db: worker.db }, { ...input, callerName: "Someone else" }) === null, "Wrong caller name was accepted.");
  assert(await createAppointmentChangeVerification({ db: worker.db }, { ...input, serviceName: "Haircut" }) === null, "Wrong appointment fact was accepted.");
  const verified = await createAppointmentChangeVerification({ db: worker.db }, input);
  assert(verified?.status === "facts_verified", "Facts were not distinguished from OTP verification.");
  await scoped(async (tx) => tx.update(receptionistProfiles).set({ appointmentChangePolicy: { ...policy, verificationMode: "otp_required" } }).where(eq(receptionistProfiles.businessId, businessId)));
  assert(await cancelAppointmentForCaller({ db: worker.db }, { ...input, verificationId: verified.verificationId }) === null, "A stricter OTP policy accepted earlier facts verification.");
  await scoped(async (tx) => tx.update(receptionistProfiles).set({ appointmentChangePolicy: { ...policy, allowCancel: false } }).where(eq(receptionistProfiles.businessId, businessId)));
  assert(await createAppointmentChangeVerification({ db: worker.db }, input) === null, "Disabled cancellation issued a verification.");
  assert(await cancelAppointmentForCaller({ db: worker.db }, { ...input, verificationId: verified.verificationId }) === null, "Disabled cancellation accepted an earlier verification.");
  await scoped(async (tx) => tx.update(receptionistProfiles).set({ appointmentChangePolicy: policy }).where(eq(receptionistProfiles.businessId, businessId)));
  const { appointmentId: _id, ...withoutId } = input;
  const resolved = await createAppointmentChangeVerification({ db: worker.db }, withoutId);
  assert(resolved?.appointmentId === appointmentId, "Caller facts could not resolve the appointment without an internal ID.");
  assert(await cancelAppointmentForCaller({ db: worker.db }, { ...input, verificationId: resolved.verificationId }), "Verified cancellation did not commit.");
  assert(await cancelAppointmentForCaller({ db: worker.db }, { ...input, verificationId: resolved.verificationId }) === null, "Verification replay succeeded.");
  console.log(JSON.stringify({ missingFactsDenied: true, nameChecked: true, localizedFactsChecked: true, otpEscalationEnforced: true, policyRevocationEnforced: true, factsResolveAppointment: true, cancellationCommitted: true, replayDenied: true }));
} finally {
  await scoped(async (tx) => tx.delete(businesses).where(eq(businesses.id, businessId)));
  await worker.pool.end();
}
