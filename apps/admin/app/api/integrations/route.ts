import { and, count, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, businessHours, businesses, phoneNumbers, services } from "@lobbystack/db";
import { assignCalendarStaff, calcomEventTypeWarnings, discoverCalendars, disconnectCalendar, listCalendarConnections, listCalendarStaff, refreshCalendar, resolveCalendarAccessToken, selectCalendar, type CalcomEventTypeWarning, type DomainContext } from "@lobbystack/domain";
import { SecretBox, calendarProviderLabel, type CalcomEventType } from "@lobbystack/providers";
import { jsonError } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { calcomCalendarProvider, calendarProvider, calendarProviderConfigured } from "@/lib/calendar-providers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

type CalendarOption = { id: string; summary: string; primary: boolean; accessRole?: string; selected: boolean };

async function calendarDiscovery(domain: DomainContext, userId: string, businessId: string, connectionId: string, providerName: string, listCalendars?: (input: { accessToken: string }) => Promise<Array<Omit<CalendarOption, "selected">>>) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Calendar discovery is not configured.");
  const provider = calendarProvider(providerName);
  const box = new SecretBox(encryptionKey);
  return await discoverCalendars(domain, {
    userId, businessId, connectionId,
    decryptAccessToken: (value) => box.decrypt(value),
    resolveAccessToken: (id) => resolveCalendarAccessToken(createWorkerDomainContext(), { businessId, connectionId: id, decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value), refreshAccessToken: (input) => provider.refreshAccessToken(input) }),
    listCalendars: listCalendars ?? ((input) => provider.listCalendars(input)),
  });
}

/**
 * A Cal.com connection's event types, and what to warn about the selected one:
 * service lengths it can't book, an SMS workflow, and hours its schedule leaves out.
 */
async function calcomDiscovery(domain: DomainContext, userId: string, businessId: string, connectionId: string, readBusiness: () => Promise<{ serviceDurations: number[]; hours: Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>; timezone: string }>) {
  const provider = calcomCalendarProvider();
  let eventTypes: CalcomEventType[] = [];
  let accessToken = "";
  const options = await calendarDiscovery(domain, userId, businessId, connectionId, "calcom", async (input) => {
    accessToken = input.accessToken;
    eventTypes = await provider.listEventTypes(input);
    return eventTypes.map((eventType) => ({ id: eventType.id, summary: eventType.title, primary: false, accessRole: "owner" }));
  });
  const selected = eventTypes.find((eventType) => options.some((option) => option.selected && option.id === eventType.id));
  let warnings: CalcomEventTypeWarning[] = [];
  if (selected) {
    const [business, schedule] = await Promise.all([readBusiness(), provider.getSchedule({ accessToken, scheduleId: selected.scheduleId }).catch(() => null)]);
    warnings = calcomEventTypeWarnings({ eventType: selected, ...business, schedule });
  }
  return { options, warnings };
}

export const GET = operatorRoute(async ({ userId, businessId, domain, transaction }) => {
  const { billing, phones } = await transaction(async (tx) => {
    const billing = await tx.select({ plan: billingAccounts.plan, state: billingAccounts.subscriptionState, updatedAt: billingAccounts.updatedAt }).from(billingAccounts).where(eq(billingAccounts.businessId, businessId)).limit(1);
    const phones = await tx.select({ count: count() }).from(phoneNumbers).where(and(eq(phoneNumbers.businessId, businessId), eq(phoneNumbers.status, "active")));
    return { billing, phones };
  });
  const [calendar, staffRows] = await Promise.all([
    listCalendarConnections(domain, { userId, businessId }),
    listCalendarStaff(domain, { userId, businessId }),
  ]);
  const googleConnection = calendar.find((connection) => connection.provider === "google");
  const calcomConnection = calendar.find((connection) => connection.provider === "calcom");
  const failure = (error: unknown) => error instanceof Error ? error.message : "Calendar discovery failed.";
  // Each provider answers on its own, so neither waits on the other.
  const [google, calcomResult] = await Promise.all([
    googleConnection ? calendarDiscovery(domain, userId, businessId, googleConnection.id, googleConnection.provider).then((options) => ({ options, error: null }), (error: unknown) => ({ options: [] as CalendarOption[], error: failure(error) })) : { options: [] as CalendarOption[], error: null },
    calcomConnection ? calcomDiscovery(domain, userId, businessId, calcomConnection.id, () => transaction(async (tx) => {
      const [business] = await tx.select({ timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const durations = await tx.select({ minutes: services.durationMinutes }).from(services).where(and(eq(services.businessId, businessId), eq(services.active, true)));
      const hours = await tx.select({ dayOfWeek: businessHours.dayOfWeek, openMinutes: businessHours.openMinutes, closeMinutes: businessHours.closeMinutes }).from(businessHours).where(and(eq(businessHours.businessId, businessId), isNull(businessHours.staffId)));
      return { serviceDurations: durations.map((row) => row.minutes), hours, timezone: business?.timezone ?? "UTC" };
    })).then((found) => ({ ...found, discoveryError: null }), (error: unknown) => ({ options: [] as CalendarOption[], warnings: [] as CalcomEventTypeWarning[], discoveryError: failure(error) })) : { options: [] as CalendarOption[], warnings: [] as CalcomEventTypeWarning[], discoveryError: null },
  ]);
  const calendarOptions = google.options;
  const discoveryError = google.error;
  const calcom = { configured: calendarProviderConfigured("calcom"), ...calcomResult };
  return NextResponse.json({
    calendarConnections: calendar.map((connection) => ({
      ...connection,
      selectedCalendarSummary: (connection.provider === "calcom" ? calcom.options : calendarOptions).find((option) => option.id === connection.selectedCalendarId)?.summary ?? null,
    })),
    staff: staffRows,
    calendarOptions,
    discoveryError,
    calcom,
    integrations: [
      ...(calendar[0] ? [{ name: calendarProviderLabel(calendar[0].provider), account: calendar[0].externalAccountId, status: calendar[0].status, updatedAt: calendar[0].updatedAt, connectionId: calendar[0].id, staffId: calendar[0].staffId, selectedCalendarId: calendar[0].selectedCalendarId, lastSyncError: calendar[0].lastSyncError, calendarOptions: calendar[0].provider === "calcom" ? calcom.options : calendarOptions, discoveryError: calendar[0].provider === "calcom" ? calcom.discoveryError : discoveryError }] : [{ name: calendarProviderLabel("google"), account: "Not connected", status: "disconnected", updatedAt: null, connectionId: null, staffId: null, selectedCalendarId: null, lastSyncError: null, calendarOptions: [], discoveryError: null }]),
      { name: "Twilio", account: `${Number(phones[0]?.count ?? 0)} active phone number${Number(phones[0]?.count ?? 0) === 1 ? "" : "s"}`, status: Number(phones[0]?.count ?? 0) > 0 ? "connected" : "disconnected", updatedAt: null },
      { name: "Polar billing", account: billing[0]?.plan ?? "Not configured", status: billing[0]?.state ?? "disconnected", updatedAt: billing[0]?.updatedAt ?? null },
    ],
  });
});

export const PATCH = operatorRoute(async ({ userId, businessId, body: input, domain, transaction }) => {
  const body = input as { connectionId?: string; calendarId?: string; staffId?: string | null };
  if (!body.connectionId || (!body.calendarId && body.staffId === undefined)) return jsonError("connectionId and a calendarId or staffId are required.", 400);
  if (body.calendarId) {
    await transaction(async () => undefined, { minimumRole: "business_admin" });
    const connection = (await listCalendarConnections(domain, { userId, businessId })).find((row) => row.id === body.connectionId);
    if (!connection) return jsonError("Calendar connection not found.", 404);
    const options = await calendarDiscovery(domain, userId, businessId, connection.id, connection.provider);
    const selected = options.find((option) => option.id === body.calendarId?.trim());
    if (!selected || !["owner", "writer"].includes(selected.accessRole ?? "")) return jsonError("Select a calendar you can write to.", 400);
    await selectCalendar(domain, { userId, businessId, connectionId: body.connectionId, calendarId: selected.id });
  }
  if (body.staffId !== undefined) await assignCalendarStaff(domain, { userId, businessId, connectionId: body.connectionId, staffId: body.staffId });
  return NextResponse.json({ ok: true });
});

export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  if (typeof body.connectionId !== "string" || !body.connectionId) return jsonError("connectionId is required.", 400);
  await refreshCalendar(domain, { userId, businessId, connectionId: body.connectionId });
  return NextResponse.json({ ok: true });
});

export const DELETE = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return jsonError("connectionId is required.", 400);
  // A Cal.com connection's webhook is removed from Cal.com by a job the disconnect queues.
  await disconnectCalendar(domain, { userId, businessId, connectionId });
  return NextResponse.json({ ok: true });
});
