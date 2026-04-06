import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { CALENDAR_RECONCILIATION_INTERVAL_MS } from "../integrations/calendar";
import schema from "../schema";
import { modules } from "../test.setup";

const { workflowStartMock, runtimeCronsGetMock, runtimeCronsRegisterMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(),
  runtimeCronsGetMock: vi.fn(),
  runtimeCronsRegisterMock: vi.fn(),
}));

vi.mock("../lib/components", async () => {
  const actual = await vi.importActual<typeof import("../lib/components")>(
    "../lib/components",
  );

  return {
    ...actual,
    workflowManager: {
      define: actual.workflowManager.define.bind(actual.workflowManager),
      start: workflowStartMock,
    },
    runtimeCrons: {
      get: runtimeCronsGetMock,
      register: runtimeCronsRegisterMock,
    },
  };
});

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = modules;

type MockGoogleEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  updated: string;
  status?: string;
  transparency?: string;
};

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const originalGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const originalAppBaseUrl = process.env.APP_BASE_URL;
const originalSessionEncryptionKey = process.env.SESSION_ENCRYPTION_KEY;

let googleEventCounter = 0;
let failGoogleEventWrites = false;
let forceInvalidGoogleSyncToken = false;
let forceGoogleRefreshTokenRevoked = false;
let googleEventsByCalendar: Record<string, Record<string, MockGoogleEvent>> = {};

function resetGoogleMockState(): void {
  googleEventCounter = 0;
  failGoogleEventWrites = false;
  forceInvalidGoogleSyncToken = false;
  forceGoogleRefreshTokenRevoked = false;
  googleEventsByCalendar = {
    "primary-calendar": {},
    "team-calendar": {},
  };
}

function setGoogleCalendarEvents(calendarId: string, events: Array<MockGoogleEvent>): void {
  googleEventsByCalendar[calendarId] = Object.fromEntries(
    events.map((event) => [event.id, event]),
  );
}

function installGoogleFetchMock(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url;
      const url = new URL(rawUrl);
      const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");

      if (url.toString() === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(String(init?.body ?? ""));
        if (body.get("grant_type") === "authorization_code") {
          return Response.json({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }

        if (forceGoogleRefreshTokenRevoked) {
          return new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "Token has been expired or revoked.",
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return Response.json({
          access_token: "refreshed-access-token",
          expires_in: 3600,
          token_type: "Bearer",
        });
      }

      if (url.toString() === "https://openidconnect.googleapis.com/v1/userinfo") {
        return Response.json({
          sub: "google-user-1",
          email: "owner@example.com",
        });
      }

      if (url.pathname === "/calendar/v3/users/me/calendarList") {
        return Response.json({
          items: [
            {
              id: "primary-calendar",
              summary: "Primary Calendar",
              primary: true,
              accessRole: "owner",
            },
            {
              id: "team-calendar",
              summary: "Team Calendar",
              accessRole: "writer",
            },
          ],
        });
      }

      const eventPathMatch = url.pathname.match(
        /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/,
      );
      if (eventPathMatch) {
        const calendarId = decodeURIComponent(eventPathMatch[1] ?? "");
        const eventId = eventPathMatch[2] ? decodeURIComponent(eventPathMatch[2]) : null;
        googleEventsByCalendar[calendarId] ??= {};

        if (method === "GET") {
          if (forceInvalidGoogleSyncToken && url.searchParams.has("syncToken")) {
            return new Response(JSON.stringify({ error: { message: "Sync token expired." } }), {
              status: 410,
              headers: { "content-type": "application/json" },
            });
          }

          return Response.json({
            items: Object.values(googleEventsByCalendar[calendarId]).map((event) => ({
              id: event.id,
              summary: event.summary,
              status: event.status ?? "confirmed",
              transparency: event.transparency,
              updated: event.updated,
              start: { dateTime: event.start, timeZone: "America/Toronto" },
              end: { dateTime: event.end, timeZone: "America/Toronto" },
            })),
            nextSyncToken: `sync-${googleEventCounter}`,
          });
        }

        if (method === "POST" || method === "PATCH") {
          if (failGoogleEventWrites) {
            return new Response(JSON.stringify({ error: { message: "Google write failed." } }), {
              status: 500,
              headers: { "content-type": "application/json" },
            });
          }

          const rawBody = typeof init?.body === "string" ? init.body : "";
          const parsedBody = JSON.parse(rawBody) as {
            summary: string;
            start: { dateTime: string };
            end: { dateTime: string };
          };
          const resolvedEventId = eventId ?? `evt-${++googleEventCounter}`;
          googleEventsByCalendar[calendarId][resolvedEventId] = {
            id: resolvedEventId,
            summary: parsedBody.summary,
            start: parsedBody.start.dateTime,
            end: parsedBody.end.dateTime,
            updated: new Date().toISOString(),
          };
          return Response.json({ id: resolvedEventId });
        }

        if (method === "DELETE" && eventId) {
          delete googleEventsByCalendar[calendarId][eventId];
          return new Response(null, { status: 204 });
        }
      }

      return new Response(`Unhandled fetch: ${method} ${url.toString()}`, {
        status: 500,
      });
    }),
  );
}

async function insertBusiness(
  ctx: TestContext,
  input: { slug: string; name: string },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name,
    timezone: "America/Toronto",
    businessType: "clinic",
    deploymentMode: "manual",
    status: "active",
  });
}

async function seedBookableBusiness(
  ctx: TestContext,
  input: { slug: string; name: string },
): Promise<{
  businessId: Id<"businesses">;
  serviceId: Id<"services">;
  staffId: Id<"staff">;
}> {
  const businessId = await insertBusiness(ctx, input);

  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    await ctx.db.insert("business_hours", {
      businessId,
      dayOfWeek,
      openMinutes: 9 * 60,
      closeMinutes: 17 * 60,
    });
  }

  const staffId = await ctx.db.insert("staff", {
    businessId,
    name: `${input.name} Staff`,
    timezone: "America/Toronto",
    active: true,
  });
  const serviceId = await ctx.db.insert("services", {
    businessId,
    name: "Initial Consultation",
    slug: "initial-consultation",
    durationMinutes: 30,
    active: true,
  });
  await ctx.db.insert("staff_service_assignments", {
    businessId,
    staffId,
    serviceId,
  });

  return { businessId, serviceId, staffId };
}

async function connectGoogleCalendar(
  t: TestConvex<typeof schema>,
  input: {
    businessId: Id<"businesses">;
    staffId: Id<"staff">;
  },
): Promise<Id<"calendar_connections">> {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: `calendar-owner:${String(input.businessId)}:${String(input.staffId)}`,
    });
    await ctx.db.insert("business_memberships", {
      businessId: input.businessId,
      userId,
      role: "owner",
      status: "active",
    });
    return userId;
  });
  const nonce = `state-${String(input.businessId)}-${String(input.staffId)}`;

  await t.mutation(internal.integrations.calendar.createCalendarOAuthState, {
    provider: "google",
    businessId: input.businessId,
    userId,
    staffId: input.staffId,
    nonce,
    expiresAt: "2099-03-20T00:00:00.000Z",
  });
  await t.action(internal.integrations.googleCalendar.completeOAuthCallback, {
    code: "test-auth-code",
    state: nonce,
  });

  const connection = await t.run(async (ctx) => {
    return await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider_and_staff_id", (q) =>
        q.eq("businessId", input.businessId).eq("provider", "google").eq("staffId", input.staffId),
      )
      .unique();
  });

  if (!connection) {
    throw new Error("Expected Google Calendar connection to be created.");
  }

  return connection._id;
}

async function bookAppointment(
  t: TestConvex<typeof schema>,
  input: {
    businessId: Id<"businesses">;
    serviceId: Id<"services">;
    startsAt?: string;
    contactPhone?: string;
  },
): Promise<Id<"appointments">> {
  const result = await t.mutation(
    internal.appointments.booking.bookAppointmentForBusiness,
    {
      businessId: input.businessId,
      serviceId: input.serviceId,
      startsAt: input.startsAt ?? "2026-03-17T14:00:00.000-04:00",
      timezone: "America/Toronto",
      contactPhone: input.contactPhone ?? "+14165550199",
      sourceChannel: "sms",
    },
  );

  return result.appointmentId;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://convex.example.com/integrations/google/callback";
  process.env.APP_BASE_URL = "https://app.example.com";
  process.env.SESSION_ENCRYPTION_KEY = "test-session-encryption-key";
  workflowStartMock.mockResolvedValue(null);
  runtimeCronsGetMock.mockResolvedValue(null);
  runtimeCronsRegisterMock.mockResolvedValue(null);
  resetGoogleMockState();
  installGoogleFetchMock();
});

afterEach(() => {
  process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
  process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
  process.env.GOOGLE_REDIRECT_URI = originalGoogleRedirectUri;
  process.env.APP_BASE_URL = originalAppBaseUrl;
  process.env.SESSION_ENCRYPTION_KEY = originalSessionEncryptionKey;
  vi.unstubAllGlobals();
});

describe("calendar reconciliation backend", () => {
  it("marks bookings without a connected calendar as not_required", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "no-calendar-business",
        name: "No Calendar Business",
      });
    });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("not_required");
    });
  });

  it("starts connected-calendar bookings in pending and syncs them to synced", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "connected-calendar-business",
        name: "Connected Calendar Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("pending");
    });

    const result = await t.action(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      {
        appointmentId,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      status: "synced",
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment).toMatchObject({
        calendarSyncState: "synced",
      });
      expect(appointment?.calendarExternalEventId).toBe("evt-1");
      expect(appointment?.calendarLastSyncedAt).toBeTruthy();
    });
  });

  it("removes stale busy blocks when a calendar connection is disconnected", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "disconnect-calendar-busy-blocks-business",
        name: "Disconnect Calendar Busy Blocks Business",
      });
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    await t.mutation(internal.integrations.calendar.applyCalendarBusyBlockChanges, {
      connectionId,
      fullSync: true,
      syncedAt: "2026-03-17T12:00:00.000Z",
      busyBlocks: [
        {
          startsAt: "2026-03-17T14:00:00.000-04:00",
          endsAt: "2026-03-17T14:30:00.000-04:00",
          externalEventId: "busy-1",
          sourceCalendarId: "primary-calendar",
        },
      ],
      removedExternalEventIds: [],
    });

    const blockedAvailability = await t.query(
      internal.appointments.booking.checkAvailabilityForBusiness,
      {
        businessId,
        serviceId,
        startsAt: "2026-03-17T14:00:00.000-04:00",
        timezone: "America/Toronto",
      },
    );

    expect(blockedAvailability).toHaveLength(0);

    const authed = t.withIdentity({
      subject: `calendar-owner:${String(businessId)}:${String(staffId)}`,
    });
    await authed.action(api.integrations.calendar.disconnectGoogleCalendar, {
      businessId,
      staffId,
    });

    const availableAfterDisconnect = await t.query(
      internal.appointments.booking.checkAvailabilityForBusiness,
      {
        businessId,
        serviceId,
        startsAt: "2026-03-17T14:00:00.000-04:00",
        timezone: "America/Toronto",
      },
    );

    expect(availableAfterDisconnect).toHaveLength(1);

    await t.run(async (ctx) => {
      const busyBlocks = await ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_connection_id_and_starts_at", (q) =>
          q.eq("connectionId", connectionId),
        )
        .collect();
      const connection = await ctx.db.get(connectionId);

      expect(busyBlocks).toHaveLength(0);
      expect(connection?.status).toBe("disconnected");
    });
  });

  it("records sync failures and schedules reconciliation", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "failing-calendar-business",
        name: "Failing Calendar Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });
    failGoogleEventWrites = true;

    const appointmentId = await bookAppointment(t, { businessId, serviceId });
    const result = await t.action(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      {
        appointmentId,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("failed");
      expect(appointment?.calendarLastSyncError).toContain("Google write failed");
      expect(appointment?.calendarReconcileAfter).toBeTruthy();
    });
  });

  it("converts stale pending and syncing appointments into failure states", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "stale-calendar-business",
        name: "Stale Calendar Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const stalePendingId = await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550201",
      });
      return await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-17T14:00:00.000-04:00",
        endsAt: "2026-03-17T14:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "pending",
        calendarLastSyncAttemptAt: "2026-03-11T10:00:00.000Z",
      });
    });
    const staleSyncingId = await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550202",
      });
      return await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-17T15:00:00.000-04:00",
        endsAt: "2026-03-17T15:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "syncing",
        calendarLastSyncAttemptAt: "2026-03-11T10:00:00.000Z",
      });
    });

    await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    await t.run(async (ctx) => {
      const pendingAppointment = await ctx.db.get(stalePendingId);
      const syncingAppointment = await ctx.db.get(staleSyncingId);

      expect(pendingAppointment?.calendarSyncState).toBe("failed");
      expect(pendingAppointment?.calendarLastSyncError).toContain("pending");
      expect(pendingAppointment?.calendarReconcileAfter).toBeTruthy();

      expect(syncingAppointment?.calendarSyncState).toBe("failed");
      expect(syncingAppointment?.calendarLastSyncError).toContain("stuck");
      expect(syncingAppointment?.calendarReconcileAfter).toBeTruthy();
    });
  });

  it("marks synced appointments without external event IDs as drifted", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "drift-calendar-business",
        name: "Drift Calendar Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550203",
      });
      return await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-17T16:00:00.000-04:00",
        endsAt: "2026-03-17T16:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "synced",
      });
    });

    await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("drifted");
      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.filter((issue) => issue.status === "open")).toHaveLength(1);
    });
  });

  it("dedupes calendar sync issues across repeated reconciliation runs", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "issue-dedupe-business",
        name: "Issue Dedupe Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550204",
      });
      return await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-18T09:00:00.000-04:00",
        endsAt: "2026-03-18T09:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "drifted",
        calendarLastSyncError: "Drifted record",
        calendarReconcileAfter: "2099-03-18T09:00:00.000Z",
      });
    });

    await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );
    await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    await t.run(async (ctx) => {
      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.filter((issue) => issue.status === "open")).toHaveLength(1);
    });
  });

  it("automatically retries failed appointments after an issue exists and resolves the issue on recovery", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "recover-calendar-business",
        name: "Recover Calendar Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });
    failGoogleEventWrites = true;
    await t.action(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      {
        appointmentId,
      },
    );
    await t.action(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      {
        appointmentId,
      },
    );

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("failed");
      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.filter((issue) => issue.status === "open")).toHaveLength(1);
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(appointmentId, {
        calendarReconcileAfter: "2026-03-11T00:00:00.000Z",
      });
    });
    failGoogleEventWrites = false;

    const result = await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );
    expect(result).toMatchObject({
      retried: 1,
      recovered: 1,
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("synced");
      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.some((issue) => issue.status === "resolved")).toBe(true);
    });
  });

  it("keeps retrying failed appointments with open issues without duplicating the issue", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "retry-open-issue-business",
        name: "Retry Open Issue Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });
    failGoogleEventWrites = true;
    await t.action(internal.integrations.calendar.syncAppointmentToExternalCalendars, {
      appointmentId,
    });
    await t.action(internal.integrations.calendar.syncAppointmentToExternalCalendars, {
      appointmentId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(appointmentId, {
        calendarReconcileAfter: "2026-03-01T00:00:00.000Z",
      });
    });

    const result = await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    expect(result).toMatchObject({
      retried: 1,
      recovered: 0,
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("failed");
      expect(appointment?.calendarReconcileAfter).toBeTruthy();
      expect(appointment?.calendarReconcileAfter).not.toBe("2026-03-01T00:00:00.000Z");

      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.filter((issue) => issue.status === "open")).toHaveLength(1);
    });
  });

  it("retries drifted appointments automatically once they are due and resolves the issue on recovery", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "drift-recovery-business",
        name: "Drift Recovery Business",
      });
    });
    await connectGoogleCalendar(t, { businessId, staffId });

    const appointmentId = await t.run(async (ctx) => {
      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550299",
      });
      return await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-18T11:00:00.000-04:00",
        endsAt: "2026-03-18T11:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "synced",
      });
    });

    await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("drifted");
      expect(appointment?.calendarReconcileAfter).toBeTruthy();
      await ctx.db.patch(appointmentId, {
        calendarReconcileAfter: "2026-03-01T00:00:00.000Z",
      });
    });

    const result = await t.action(
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      {
        businessId,
      },
    );

    expect(result).toMatchObject({
      retried: 1,
      recovered: 1,
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("synced");
      expect(appointment?.calendarExternalEventId).toBe("evt-1");
      const issues = await ctx.db
        .query("inbox_items")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "calendar_sync_issue").eq("relatedId", String(appointmentId)),
        )
        .collect();
      expect(issues.some((issue) => issue.status === "resolved")).toBe(true);
    });
  });

  it("imports Google busy blocks only for the mapped staff member", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "busy-block-scope-business",
        name: "Busy Block Scope Business",
      });
      const secondStaffId = await ctx.db.insert("staff", {
        businessId: seeded.businessId,
        name: "Second Staff",
        timezone: "America/Toronto",
        active: true,
      });
      await ctx.db.insert("staff_service_assignments", {
        businessId: seeded.businessId,
        staffId: secondStaffId,
        serviceId: seeded.serviceId,
      });
      return seeded;
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    setGoogleCalendarEvents("primary-calendar", [
      {
        id: "busy-1",
        summary: "Busy",
        start: "2026-03-17T14:00:00.000-04:00",
        end: "2026-03-17T14:30:00.000-04:00",
        updated: "2026-03-10T00:00:00.000Z",
      },
    ]);

    await t.action(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
      connectionId,
      fullSync: true,
    });

    const availability = await t.query(
      internal.appointments.booking.checkAvailabilityForBusiness,
      {
        businessId,
        serviceId,
        startsAt: "2026-03-17T14:00:00.000-04:00",
        timezone: "America/Toronto",
      },
    );

    expect(availability).toHaveLength(1);
    expect(availability[0]?.staffId).not.toBe(String(staffId));
  });

  it("keeps legacy business-wide Google connections active for staff bookings until migrated", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "legacy-google-connection-business",
        name: "Legacy Google Connection Business",
      });
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      if (!connection) {
        throw new Error("Expected legacy connection fixture to exist.");
      }

      const { staffId: _staffId, ...legacyConnection } = connection;
      await ctx.db.replace(connectionId, legacyConnection);
    });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("pending");
    });

    await t.action(internal.integrations.calendar.syncAppointmentToExternalCalendars, {
      appointmentId,
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db.get(appointmentId);
      expect(appointment?.calendarSyncState).toBe("synced");
      expect(appointment?.calendarExternalEventId).toBe("evt-1");
      expect(appointment?.staffId).toBe(staffId);
    });
  });

  it("keeps legacy Google connections in busy-time reconciliation until remapped", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "legacy-google-reconciliation-business",
        name: "Legacy Google Reconciliation Business",
      });
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      if (!connection) {
        throw new Error("Expected legacy reconciliation connection fixture to exist.");
      }

      const { staffId: _staffId, ...legacyConnection } = connection;
      await ctx.db.replace(connectionId, legacyConnection);
    });

    setGoogleCalendarEvents("primary-calendar", [
      {
        id: "legacy-busy-1",
        summary: "Legacy Busy",
        start: "2026-03-17T16:00:00.000-04:00",
        end: "2026-03-17T16:30:00.000-04:00",
        updated: "2026-03-10T00:00:00.000Z",
      },
    ]);

    await t.action(internal.integrations.calendar.runBusinessCalendarReconciliation, {
      businessId,
    });

    await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      expect(connection?.lastSyncedAt).toBeTruthy();

      const blocks = await ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_connection_id_and_starts_at", (q) => q.eq("connectionId", connectionId))
        .collect();

      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.externalEventId).toBe("legacy-busy-1");
    });
  });

  it("treats legacy Google connections as eligible for not_required drift detection", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      return await seedBookableBusiness(ctx, {
        slug: "legacy-google-drift-business",
        name: "Legacy Google Drift Business",
      });
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      if (!connection) {
        throw new Error("Expected legacy drift connection fixture to exist.");
      }

      const { staffId: _staffId, ...legacyConnection } = connection;
      await ctx.db.replace(connectionId, legacyConnection);

      const contactId = await ctx.db.insert("contacts", {
        businessId,
        phone: "+14165550333",
      });
      await ctx.db.insert("appointments", {
        businessId,
        contactId,
        staffId,
        serviceId,
        startsAt: "2026-03-18T09:00:00.000-04:00",
        endsAt: "2026-03-18T09:30:00.000-04:00",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "not_required",
      });
    });

    const result = await t.action(internal.integrations.calendar.runBusinessCalendarReconciliation, {
      businessId,
    });

    expect(result).toMatchObject({
      drifted: 1,
      issuesOpened: 1,
    });

    await t.run(async (ctx) => {
      const appointment = await ctx.db
        .query("appointments")
        .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", businessId))
        .unique();

      expect(appointment?.calendarSyncState).toBe("drifted");
      expect(appointment?.calendarLastSyncError).toBe(
        "Connected calendar exists but the appointment was never queued for sync.",
      );
    });
  });

  it("falls back to a full busy sync when Google rejects the stored sync token", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "invalid-sync-token-business",
        name: "Invalid Sync Token Business",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId };
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    setGoogleCalendarEvents("primary-calendar", [
      {
        id: "busy-2",
        summary: "Busy",
        start: "2026-03-17T15:00:00.000-04:00",
        end: "2026-03-17T15:30:00.000-04:00",
        updated: "2026-03-10T00:00:00.000Z",
      },
    ]);
    forceInvalidGoogleSyncToken = true;

    const result = await t.action(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
      connectionId,
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "full_resync",
    });

    await t.run(async (ctx) => {
      const blocks = await ctx.db
        .query("calendar_busy_blocks")
        .withIndex("by_connection_id_and_starts_at", (q) =>
          q.eq("connectionId", connectionId),
        )
        .collect();
      expect(blocks).toHaveLength(1);
      expect(blocks[0]?.externalEventId).toBe("busy-2");
    });
  });

  it("marks Google connections as reconnect required when the refresh token is revoked", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "revoked-google-refresh-business",
        name: "Revoked Google Refresh Business",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId };
    });
    const connectionId = await connectGoogleCalendar(t, { businessId, staffId });

    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        tokenExpiresAt: "2020-01-01T00:00:00.000Z",
      });
    });

    forceGoogleRefreshTokenRevoked = true;

    const result = await t.action(internal.integrations.googleCalendar.syncBusyTimeForConnection, {
      connectionId,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "reconnect_required",
      message: "Google Calendar authorization expired or was revoked. Reconnect Google Calendar.",
    });

    await t.run(async (ctx) => {
      const connection = await ctx.db.get(connectionId);
      expect(connection?.status).toBe("reconnect_required");
      expect(connection?.lastSyncError).toBe(
        "Google Calendar authorization expired or was revoked. Reconnect Google Calendar.",
      );
    });
  });

  it("rejects expired Google OAuth states", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "expired-oauth-state-business",
        name: "Expired OAuth State Business",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId };
    });
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        authSubject: "expired-state-user",
      });
    });

    await t.mutation(internal.integrations.calendar.createCalendarOAuthState, {
      provider: "google",
      businessId,
      userId,
      staffId,
      nonce: "expired-oauth-state",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    await expect(
      t.action(internal.integrations.googleCalendar.completeOAuthCallback, {
        code: "expired-code",
        state: "expired-oauth-state",
      }),
    ).rejects.toThrow("expired");
  });

  it("rejects OAuth callbacks if the initiating operator no longer has admin access", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId, userId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "revoked-oauth-state-business",
        name: "Revoked OAuth State Business",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "revoked-oauth-user",
      });
      await ctx.db.insert("business_memberships", {
        businessId: seeded.businessId,
        userId,
        role: "owner",
        status: "active",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId, userId };
    });

    await t.mutation(internal.integrations.calendar.createCalendarOAuthState, {
      provider: "google",
      businessId,
      userId,
      staffId,
      nonce: "revoked-oauth-state",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_user_id_and_business_id", (q) =>
          q.eq("userId", userId).eq("businessId", businessId),
        )
        .unique();
      if (!membership) {
        throw new Error("Expected membership to exist.");
      }
      await ctx.db.patch(membership._id, {
        role: "scheduler",
      });
    });

    await expect(
      t.action(internal.integrations.googleCalendar.completeOAuthCallback, {
        code: "revoked-code",
        state: "revoked-oauth-state",
      }),
    ).rejects.toThrow("Calendar integrations require admin access.");
  });

  it("registers the business reconciliation cron every five minutes", async () => {
    const t = convexTest(schema, convexModules);
    const businessId = await t.run(async (ctx) => {
      return await insertBusiness(ctx, {
        slug: "cron-registration-business",
        name: "Cron Registration Business",
      });
    });

    const cronName = await t.mutation(
      internal.ai.workflows.runtime.registerCalendarReconciliationCron,
      {
        businessId,
      },
    );

    expect(cronName).toBe(`calendar-reconcile-${String(businessId)}`);
    expect(runtimeCronsGetMock).toHaveBeenCalled();
    expect(runtimeCronsRegisterMock).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "interval", ms: CALENDAR_RECONCILIATION_INTERVAL_MS },
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      { businessId },
      `calendar-reconcile-${String(businessId)}`,
    );
  });

  it("scopes reconciliation queries to the requesting member's business", async () => {
    const t = convexTest(schema, convexModules);
    const { businessAId, businessBId } = await t.run(async (ctx) => {
      const businessAId = await insertBusiness(ctx, {
        slug: "member-business-a",
        name: "Member Business A",
      });
      const businessBId = await insertBusiness(ctx, {
        slug: "member-business-b",
        name: "Member Business B",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "member-a",
      });
      await ctx.db.insert("business_memberships", {
        businessId: businessAId,
        userId,
        role: "owner",
        status: "active",
      });

      const [staffA, staffB] = await Promise.all([
        ctx.db.insert("staff", {
          businessId: businessAId,
          name: "A Staff",
          timezone: "America/Toronto",
          active: true,
        }),
        ctx.db.insert("staff", {
          businessId: businessBId,
          name: "B Staff",
          timezone: "America/Toronto",
          active: true,
        }),
      ]);
      const [serviceA, serviceB] = await Promise.all([
        ctx.db.insert("services", {
          businessId: businessAId,
          name: "A Service",
          slug: "a-service",
          durationMinutes: 30,
          active: true,
        }),
        ctx.db.insert("services", {
          businessId: businessBId,
          name: "B Service",
          slug: "b-service",
          durationMinutes: 30,
          active: true,
        }),
      ]);
      const [contactA, contactB] = await Promise.all([
        ctx.db.insert("contacts", {
          businessId: businessAId,
          phone: "+14165550301",
          name: "Alice",
        }),
        ctx.db.insert("contacts", {
          businessId: businessBId,
          phone: "+14165550302",
          name: "Bob",
        }),
      ]);
      const [appointmentAId, appointmentBId] = await Promise.all([
        ctx.db.insert("appointments", {
          businessId: businessAId,
          contactId: contactA,
          staffId: staffA,
          serviceId: serviceA,
          startsAt: "2026-03-20T09:00:00.000-04:00",
          endsAt: "2026-03-20T09:30:00.000-04:00",
          timezone: "America/Toronto",
          status: "confirmed",
          sourceChannel: "dashboard",
          calendarSyncState: "failed",
          calendarLastSyncError: "A failed sync",
          calendarReconcileAfter: "2026-03-20T08:00:00.000Z",
        }),
        ctx.db.insert("appointments", {
          businessId: businessBId,
          contactId: contactB,
          staffId: staffB,
          serviceId: serviceB,
          startsAt: "2026-03-21T09:00:00.000-04:00",
          endsAt: "2026-03-21T09:30:00.000-04:00",
          timezone: "America/Toronto",
          status: "confirmed",
          sourceChannel: "dashboard",
          calendarSyncState: "drifted",
          calendarLastSyncError: "B drifted sync",
        }),
      ]);

      await ctx.db.insert("inbox_items", {
        businessId: businessAId,
        kind: "calendar_sync_issue",
        title: "Business A issue",
        body: "A",
        relatedId: String(appointmentAId),
        status: "open",
      });
      await ctx.db.insert("inbox_items", {
        businessId: businessBId,
        kind: "calendar_sync_issue",
        title: "Business B issue",
        body: "B",
        relatedId: String(appointmentBId),
        status: "open",
      });

      return { businessAId, businessBId };
    });

    const authed = t.withIdentity({ subject: "member-a" });
    const summary = await authed.query(
      api.integrations.calendar.getCalendarReconciliationSummary,
      {
        businessId: businessAId,
      },
    );
    const issues = await authed.query(
      api.integrations.calendar.listCalendarReconciliationIssues,
      {
        businessId: businessAId,
      },
    );
    const appointments = await authed.query(
      api.integrations.calendar.listAppointmentsNeedingCalendarAttention,
      {
        businessId: businessAId,
      },
    );

    expect(summary.businessId).toBe(businessAId);
    expect(summary.counts.failed).toBe(1);
    expect(summary.counts.drifted).toBe(0);
    expect(summary.openIssueCount).toBe(1);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.title).toBe("Business A issue");

    expect(appointments).toHaveLength(1);
    expect(appointments[0]?.lastSyncError).toBe("A failed sync");

    await expect(
      authed.query(api.integrations.calendar.getCalendarReconciliationSummary, {
        businessId: businessBId,
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });

  it("requires admin access for calendar integration management", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "calendar-integration-access-business",
        name: "Calendar Integration Access Business",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "calendar-non-admin",
      });
      await ctx.db.insert("business_memberships", {
        businessId: seeded.businessId,
        userId,
        role: "scheduler",
        status: "active",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId };
    });

    const authed = t.withIdentity({ subject: "calendar-non-admin" });

    await expect(
      authed.query(api.integrations.calendar.listCalendarConnections, {
        businessId,
      }),
    ).rejects.toThrow("Calendar integrations require admin access.");

    await expect(
      authed.action(api.integrations.calendar.connectGoogle, {
        businessId,
        staffId,
      }),
    ).rejects.toThrow("Calendar integrations require admin access.");
  });

  it("sanitizes calendar connections before returning them to the client", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "calendar-connection-sanitization-business",
        name: "Calendar Connection Sanitization Business",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "calendar-admin",
      });
      await ctx.db.insert("business_memberships", {
        businessId: seeded.businessId,
        userId,
        role: "owner",
        status: "active",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId };
    });

    await connectGoogleCalendar(t, { businessId, staffId });

    const authed = t.withIdentity({ subject: "calendar-admin" });
    const [connection] = await authed.query(api.integrations.calendar.listCalendarConnections, {
      businessId,
    });

    expect(connection).toMatchObject({
      businessId,
      provider: "google",
      staffId,
      externalAccountEmail: "owner@example.com",
      selectedCalendarId: "primary-calendar",
      selectedCalendarSummary: "Primary Calendar",
      status: "connected",
    });
    expect(connection).not.toHaveProperty("encryptedAccessToken");
    expect(connection).not.toHaveProperty("encryptedRefreshToken");
    expect(connection).not.toHaveProperty("externalAccountId");
    expect(connection).not.toHaveProperty("syncCursor");
  });

  it("preserves the previous refresh token when reconnect responses omit it", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, staffId, userId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "google-refresh-token-preservation-business",
        name: "Google Refresh Token Preservation Business",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: "refresh-token-owner",
      });
      await ctx.db.insert("calendar_connections", {
        businessId: seeded.businessId,
        provider: "google",
        ownerUserId: userId,
        staffId: seeded.staffId,
        externalAccountId: "google-account-1",
        externalAccountEmail: "owner@example.com",
        selectedCalendarId: "primary-calendar",
        selectedCalendarSummary: "Primary Calendar",
        status: "connected",
        encryptedAccessToken: "old-access-token",
        encryptedRefreshToken: "old-refresh-token",
      });
      return { businessId: seeded.businessId, staffId: seeded.staffId, userId };
    });

    await t.mutation(internal.integrations.calendar.upsertGoogleCalendarConnection, {
      businessId,
      userId,
      staffId,
      externalAccountId: "google-account-1",
      externalAccountEmail: "owner@example.com",
      selectedCalendarId: "primary-calendar",
      selectedCalendarSummary: "Primary Calendar",
      encryptedAccessToken: "new-access-token",
    });

    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("calendar_connections")
        .withIndex("by_business_id_and_provider_and_staff_id", (q) =>
          q.eq("businessId", businessId).eq("provider", "google").eq("staffId", staffId),
        )
        .unique();

      expect(connection?.encryptedAccessToken).toBe("new-access-token");
      expect(connection?.encryptedRefreshToken).toBe("old-refresh-token");
    });
  });
});
