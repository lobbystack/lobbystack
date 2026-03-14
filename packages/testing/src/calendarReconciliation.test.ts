import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CALENDAR_RECONCILIATION_INTERVAL_MS } from "../../../convex/integrations/calendar";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { workflowStartMock, runtimeCronsGetMock, runtimeCronsRegisterMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(),
  runtimeCronsGetMock: vi.fn(),
  runtimeCronsRegisterMock: vi.fn(),
}));

vi.mock("../../../convex/lib/components", async () => {
  const actual = await vi.importActual<typeof import("../../../convex/lib/components")>(
    "../../../convex/lib/components",
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

const convexModules = import.meta.glob("../../../convex/**/*.ts");

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
let googleEventsByCalendar: Record<string, Record<string, MockGoogleEvent>> = {};

function resetGoogleMockState(): void {
  googleEventCounter = 0;
  failGoogleEventWrites = false;
  forceInvalidGoogleSyncToken = false;
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
    return await ctx.db.insert("users", {
      authSubject: `calendar-owner:${String(input.businessId)}:${String(input.staffId)}`,
    });
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
});
