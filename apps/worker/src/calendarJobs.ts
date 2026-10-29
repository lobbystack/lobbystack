import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { appointments, calendarConnections, contacts, services, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import { CALENDAR_SYNC_HORIZON_MS, forgetRetiredCalendarWebhook, getRetiredCalendarWebhook, markCalendarConnectionSync, pickCalendarWriter, queueUnsyncedAppointmentSyncs, recordProductEvent, registerCalendarWebhookOnce, resolveCalendarAccessToken, updateAppointmentSyncState, updateAppointmentSyncStateInTransaction, upsertBusyBlocks, type DomainContext } from "@lobbystack/domain";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";
import { redactOtelExceptionText } from "@lobbystack/telemetry/node";
import { calendarProviderLabel, type CalendarProvider } from "@lobbystack/providers/calendar";
import type { JobResult } from "./handlers";

export type CalendarOperations = Pick<CalendarProvider, "getBusyBlocks" | "upsertEvent" | "deleteEvent" | "refreshAccessToken"> & {
  /** A provider that pushes changes, as Cal.com does, registers a webhook for each connection. */
  registerWebhook?: (input: { accessToken: string; subscriberUrl: string; secret: string }) => Promise<{ webhookId: string }>;
  deleteWebhook?: (input: { accessToken: string; webhookId: string }) => Promise<void>;
};
/** The configured providers by name; a connection whose provider is missing here is left alone. */
export type CalendarProviders = Partial<Record<string, CalendarOperations>>;
type Dependencies = { domain: DomainContext; calendars?: CalendarProviders };

async function secretBox() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("Calendar synchronization is not configured.");
  const { SecretBox } = await import("@lobbystack/providers/crypto/secretBox");
  return new SecretBox(key);
}

async function accessToken(dependencies: Dependencies, businessId: string, connectionId: string, calendar: CalendarOperations, forceRefresh = false): Promise<string> {
  const box = await secretBox();
  return await resolveCalendarAccessToken(dependencies.domain, {
    businessId, connectionId, forceRefresh,
    decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value),
    refreshAccessToken: (input) => calendar.refreshAccessToken(input),
  });
}

export async function syncAppointmentCalendar(dependencies: Dependencies, input: { businessId: string; appointmentId: string }): Promise<JobResult> {
  const { businessId, appointmentId } = input;
  if (!appointmentId) return { status: "skipped", entityId: appointmentId };
  // FOR SHARE makes a calendar switch wait for an event write already running, so its release comes after it.
  // Every connection covering the staff member is read and locked; pickCalendarWriter chooses the one that gets the appointment.
  const load = async (tx: DatabaseTransaction) => pickCalendarWriter(await tx.select({
    id: appointments.id, status: appointments.status, startsAt: appointments.startsAt, endsAt: appointments.endsAt,
    timezone: appointments.timezone, externalEventId: appointments.calendarExternalId, serviceName: services.name,
    contactName: contacts.name, contactPhone: contacts.phone, contactEmail: contacts.email,
    connectionId: calendarConnections.id, calendarId: calendarConnections.selectedCalendarId, connectionStatus: calendarConnections.status,
    provider: calendarConnections.provider, staffId: calendarConnections.staffId,
  }).from(appointments)
    .innerJoin(services, and(eq(services.id, appointments.serviceId), eq(services.businessId, businessId)))
    .leftJoin(contacts, and(eq(contacts.id, appointments.contactId), eq(contacts.businessId, businessId)))
    .innerJoin(calendarConnections, and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"), or(isNull(calendarConnections.staffId), eq(calendarConnections.staffId, appointments.staffId))))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId)))
    .orderBy(asc(calendarConnections.id)).for("share", { of: calendarConnections }), (row) => ({ id: row.connectionId, provider: row.provider, staffId: row.staffId, selectedCalendarId: row.calendarId }));
  const initial = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, load);
  if (!initial?.calendarId) {
    await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "not_required" });
    return { status: "skipped", entityId: appointmentId };
  }
  const provider = dependencies.calendars?.[initial.provider];
  if (!provider) {
    // The appointment belongs in a calendar this worker can't reach. Failing it alerts the operator, once per appointment time.
    await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "failed", error: `${calendarProviderLabel(initial.provider)} isn't set up on this server.` });
    return { status: "skipped", entityId: appointmentId };
  }
  let tokenResolved = false;
  try {
    // Commit refreshed credentials independently before external event writes.
    // No nested pool acquisition while the appointment sync lock is held.
    const token = await accessToken(dependencies, businessId, initial.connectionId, provider, initial.connectionStatus === "error");
    tokenResolved = true;
    return await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`calendar:appointment:${appointmentId}`}, 0))`);
      const current = await load(tx);
      if (!current?.calendarId) return { status: "skipped", entityId: appointmentId };
      if (current.connectionId !== initial.connectionId || current.calendarId !== initial.calendarId) throw new Error("Calendar selection changed during synchronization.");
      const clientEventId = `a${createHash("sha256").update(current.id).digest("hex").slice(0, 31)}`;
      // Durable current state wins over a delayed or out-of-order job payload.
      if (current.status === "canceled" || current.status === "cancelled") {
        await provider.deleteEvent({ accessToken: token, calendarId: current.calendarId, eventId: current.externalEventId ?? clientEventId, appointmentId });
        await updateAppointmentSyncStateInTransaction(tx, { businessId, appointmentId, state: "synced" });
      } else {
        const external = await provider.upsertEvent({
          accessToken: token, calendarId: current.calendarId, clientEventId, ...(current.externalEventId ? { eventId: current.externalEventId } : {}), title: current.serviceName, startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString(), ...(current.contactName ? { description: `Appointment for ${current.contactName}` } : {}),
          appointmentId, timezone: current.timezone, attendee: { name: current.contactName, phone: current.contactPhone, email: current.contactEmail },
        });
        await updateAppointmentSyncStateInTransaction(tx, { businessId, appointmentId, state: "synced", externalEventId: external.externalEventId });
      }
      return { status: "completed", entityId: appointmentId };
    });
  } catch (error) {
    const message = error instanceof Error ? redactOtelExceptionText(error.message) : "Calendar synchronization failed.";
    await updateAppointmentSyncState(dependencies.domain, { businessId, appointmentId, state: "failed", error: message });
    if (message !== "Calendar selection changed during synchronization.") {
      // Booking treats a connection in error as stale, so a failed event write fails only this appointment.
      if (!tokenResolved) await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: initial.connectionId, error: message });
      try {
        await recordProductEvent(dependencies.domain, {
          name: "integration.calendar_sync_failed",
          businessId,
          distinctId: getPostHogDistinctIdForBusinessSystem(businessId),
          actorType: "worker",
          properties: { appointmentId, provider: initial.provider },
        });
      } catch {
        // Product telemetry is best-effort and must not mask the provider error.
      }
    }
    throw error;
  }
}

/** Deletes the event a released booking left in a calendar its connection no longer writes it to. */
export async function deleteReleasedCalendarEvent(dependencies: Dependencies, input: { businessId: string; appointmentId: string; connectionId: string; calendarId: string; eventId: string }): Promise<JobResult> {
  const { businessId, appointmentId, connectionId, calendarId, eventId } = input;
  if (!dependencies.calendars || !connectionId || !calendarId || !eventId) return { status: "skipped", entityId: appointmentId };
  const { connection, currentEventId } = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => ({
    connection: (await tx.select({ status: calendarConnections.status, selectedCalendarId: calendarConnections.selectedCalendarId, provider: calendarConnections.provider }).from(calendarConnections).where(and(eq(calendarConnections.id, connectionId), eq(calendarConnections.businessId, businessId))).limit(1))[0],
    currentEventId: (await tx.select({ eventId: appointments.calendarExternalId }).from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, businessId))).limit(1))[0]?.eventId,
  }));
  // A disconnected connection has no token left. Event ids repeat across calendars, so a connection
  // switched back to this calendar that wrote the booking again holds a live event under this id.
  if (!connection || connection.status === "disconnected" || (connection.selectedCalendarId === calendarId && currentEventId === eventId)) return { status: "skipped", entityId: appointmentId };
  // A Cal.com uid names one booking anywhere, so one an appointment holds again is live, whichever event type it's on.
  if (connection.provider === "calcom" && await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => (await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, businessId), eq(appointments.calendarExternalId, eventId))).limit(1)).length > 0)) return { status: "skipped", entityId: appointmentId };
  const provider = dependencies.calendars[connection.provider];
  if (!provider) return { status: "skipped", entityId: appointmentId };
  await provider.deleteEvent({ accessToken: await accessToken(dependencies, businessId, connectionId, provider), calendarId, eventId, appointmentId });
  return { status: "completed", entityId: appointmentId };
}

/** Syncs the business's live connections, or only `connectionId`, as a webhook delivery asks. */
export async function reconcileBusinessCalendar(dependencies: Dependencies, businessId: string, connectionId?: string): Promise<JobResult> {
  if (!dependencies.calendars) return { status: "skipped", entityId: businessId };
  const connections = await withBusinessTransaction(dependencies.domain.db, { businessId, actorType: "worker" }, async (tx) => tx.select({ id: calendarConnections.id, provider: calendarConnections.provider, calendarId: calendarConnections.selectedCalendarId, staffId: calendarConnections.staffId, status: calendarConnections.status, webhookId: calendarConnections.externalWebhookId }).from(calendarConnections).where(and(eq(calendarConnections.businessId, businessId), ne(calendarConnections.status, "disconnected"), connectionId ? eq(calendarConnections.id, connectionId) : undefined)));
  let synced = 0;
  let failures = 0;
  for (const connection of connections) {
    // Connecting OAuth does not authorize writes to the implicit primary calendar.
    if (!connection.calendarId) continue;
    const provider = dependencies.calendars[connection.provider];
    if (!provider) continue;
    try {
      const token = await accessToken(dependencies, businessId, connection.id, provider, connection.status === "error");
      // A push provider's busy time is only as fresh as its webhook, so the connection fails until one is registered.
      if (provider.registerWebhook && !connection.webhookId) await registerWebhook(dependencies, provider, { businessId, connectionId: connection.id, accessToken: token });
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + CALENDAR_SYNC_HORIZON_MS);
      const blocks = await provider.getBusyBlocks({ accessToken: token, calendarId: connection.calendarId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      await upsertBusyBlocks(dependencies.domain, { businessId, connectionId: connection.id, calendarId: connection.calendarId, syncStartedAt: startsAt, blocks: blocks.map((block) => ({ ...block, ...(connection.staffId ? { staffId: connection.staffId } : {}) })) });
      await queueUnsyncedAppointmentSyncs(dependencies.domain, { businessId, connectionId: connection.id });
      synced++;
    } catch (error) {
      const message = error instanceof Error ? redactOtelExceptionText(error.message) : "Calendar synchronization failed.";
      if (message === "Calendar selection changed during synchronization.") continue;
      await markCalendarConnectionSync(dependencies.domain, { businessId, connectionId: connection.id, error: message });
      failures++;
    }
  }
  if (failures) throw new Error(`Calendar synchronization failed for ${failures} connection(s).`);
  return { status: synced ? "completed" : "skipped", entityId: `${businessId}:${synced}` };
}

async function registerWebhook(dependencies: Dependencies, provider: CalendarOperations, input: { businessId: string; connectionId: string; accessToken: string }): Promise<void> {
  const box = await secretBox();
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  // Under the connection's lock, so two syncs at once register one webhook between them.
  await registerCalendarWebhookOnce(dependencies.domain, {
    businessId: input.businessId, connectionId: input.connectionId,
    register: async () => {
      const secret = randomBytes(32).toString("hex");
      const { webhookId } = await provider.registerWebhook!({ accessToken: input.accessToken, subscriberUrl: `${baseUrl}/api/webhooks/calcom/${input.connectionId}`, secret });
      return { externalWebhookId: webhookId, encryptedWebhookSecret: box.encrypt(secret) };
    },
  });
}

/**
 * Removes a disconnected connection's webhook from the provider with the tokens
 * the disconnect kept for it, then forgets them. A connection reconnected in
 * the meantime keeps its webhook and tokens.
 */
export async function retireCalendarWebhook(dependencies: Dependencies, input: { businessId: string; connectionId: string }): Promise<JobResult> {
  const webhook = await getRetiredCalendarWebhook(dependencies.domain, input);
  if (!webhook) return { status: "skipped", entityId: input.connectionId };
  const provider = dependencies.calendars?.[webhook.provider];
  if (provider?.deleteWebhook) {
    const box = await secretBox();
    try {
      // A refresh rotates the refresh token, so the new one is saved before the delete: a retry after a failed delete uses it.
      const token = await resolveCalendarAccessToken(dependencies.domain, { ...input, retired: true, decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value), refreshAccessToken: (refresh) => provider.refreshAccessToken(refresh) });
      await provider.deleteWebhook({ accessToken: token, webhookId: webhook.externalWebhookId });
    } catch (error) {
      // A revoked grant can't remove the webhook. Its deliveries reach a disconnected connection, which the route ignores.
      const failure = error as { reconnectRequired?: unknown; responseStatus?: unknown };
      if (failure.reconnectRequired !== true && failure.responseStatus !== 401 && failure.responseStatus !== 403) throw error;
    }
  }
  await forgetRetiredCalendarWebhook(dependencies.domain, input);
  return { status: "completed", entityId: input.connectionId };
}
