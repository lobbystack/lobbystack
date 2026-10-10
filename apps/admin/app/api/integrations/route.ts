import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { billingAccounts, phoneNumbers } from "@lobbystack/db";
import { assignCalendarStaff, discoverCalendars, disconnectCalendar, listCalendarConnections, listCalendarStaff, refreshCalendar, resolveCalendarAccessToken, selectCalendar, type DomainContext } from "@lobbystack/domain";
import { SecretBox } from "@lobbystack/providers";
import { jsonError } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { googleCalendarProvider } from "@/lib/google-calendar-provider";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

async function calendarDiscovery(domain: DomainContext, userId: string, businessId: string, connectionId: string) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("Google Calendar discovery is not configured.");
  const provider = googleCalendarProvider();
  const box = new SecretBox(encryptionKey);
  return await discoverCalendars(domain, {
    userId, businessId, connectionId,
    decryptAccessToken: (value) => box.decrypt(value),
    resolveAccessToken: (id) => resolveCalendarAccessToken(createWorkerDomainContext(), { businessId, connectionId: id, decryptToken: (value) => box.decrypt(value), encryptToken: (value) => box.encrypt(value), refreshAccessToken: (input) => provider.refreshAccessToken(input) }),
    listCalendars: (input) => provider.listCalendars(input),
  });
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
  let calendarOptions: Array<{ id: string; summary: string; primary: boolean; accessRole?: string; selected: boolean }> = [];
  let discoveryError: string | null = null;
  if (googleConnection) {
    try {
      calendarOptions = await calendarDiscovery(domain, userId, businessId, googleConnection.id);
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : "Calendar discovery failed.";
    }
  }
  return NextResponse.json({
    calendarConnections: calendar.map((connection) => ({
      ...connection,
      selectedCalendarSummary: calendarOptions.find((option) => option.id === connection.selectedCalendarId)?.summary ?? null,
    })),
    staff: staffRows,
    calendarOptions,
    discoveryError,
    integrations: [
      ...(calendar[0] ? [{ name: calendar[0].provider === "google" ? "Google Calendar" : calendar[0].provider, account: calendar[0].externalAccountId, status: calendar[0].status, updatedAt: calendar[0].updatedAt, connectionId: calendar[0].id, staffId: calendar[0].staffId, selectedCalendarId: calendar[0].selectedCalendarId, lastSyncError: calendar[0].lastSyncError, calendarOptions, discoveryError }] : [{ name: "Google Calendar", account: "Not connected", status: "disconnected", updatedAt: null, connectionId: null, staffId: null, selectedCalendarId: null, lastSyncError: null, calendarOptions: [], discoveryError: null }]),
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
    const options = await calendarDiscovery(domain, userId, businessId, body.connectionId);
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
  await disconnectCalendar(domain, { userId, businessId, connectionId });
  return NextResponse.json({ ok: true });
});
