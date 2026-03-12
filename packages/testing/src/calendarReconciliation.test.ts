import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const { workflowStartMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(),
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
  };
});

type TestRunFunction = Parameters<TestConvex<typeof schema>["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];

const convexModules = import.meta.glob("../../../convex/**/*.ts");

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

async function insertConnectedCalendar(
  ctx: TestContext,
  input: {
    businessId: Id<"businesses">;
    selectedCalendarId?: string;
  },
): Promise<Id<"calendar_connections">> {
  const userId = await ctx.db.insert("users", {
    authSubject: `calendar-owner:${String(input.businessId)}`,
  });
  return await ctx.db.insert("calendar_connections", {
    businessId: input.businessId,
    provider: "google",
    ownerUserId: userId,
    externalAccountId: `acct-${String(input.businessId)}`,
    ...(input.selectedCalendarId !== undefined
      ? { selectedCalendarId: input.selectedCalendarId }
      : {}),
    status: "connected",
  });
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
  workflowStartMock.mockResolvedValue(null);
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
    const { businessId, serviceId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "connected-calendar-business",
        name: "Connected Calendar Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
        selectedCalendarId: "primary-calendar",
      });
      return seeded;
    });

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
      expect(appointment?.calendarExternalEventId).toContain(String(appointmentId));
      expect(appointment?.calendarLastSyncedAt).toBeTruthy();
    });
  });

  it("records sync failures and schedules reconciliation", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "failing-calendar-business",
        name: "Failing Calendar Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
      });
      return seeded;
    });

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
      expect(appointment?.calendarLastSyncError).toContain("selected calendar");
      expect(appointment?.calendarReconcileAfter).toBeTruthy();
    });
  });

  it("converts stale pending and syncing appointments into failure states", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "stale-calendar-business",
        name: "Stale Calendar Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
        selectedCalendarId: "calendar-a",
      });
      return seeded;
    });

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
      const seeded = await seedBookableBusiness(ctx, {
        slug: "drift-calendar-business",
        name: "Drift Calendar Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
        selectedCalendarId: "calendar-a",
      });
      return seeded;
    });

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
      const seeded = await seedBookableBusiness(ctx, {
        slug: "issue-dedupe-business",
        name: "Issue Dedupe Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
        selectedCalendarId: "calendar-a",
      });
      return seeded;
    });

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

  it("resolves the calendar sync issue once a failed appointment recovers", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, serviceId } = await t.run(async (ctx) => {
      const seeded = await seedBookableBusiness(ctx, {
        slug: "recover-calendar-business",
        name: "Recover Calendar Business",
      });
      await insertConnectedCalendar(ctx, {
        businessId: seeded.businessId,
      });
      return seeded;
    });

    const appointmentId = await bookAppointment(t, { businessId, serviceId });
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

    const connectionId = await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("calendar_connections")
        .withIndex("by_business_id_and_status", (q) =>
          q.eq("businessId", businessId).eq("status", "connected"),
        )
        .unique();
      if (!connection) {
        throw new Error("Expected a connected calendar connection.");
      }
      await ctx.db.patch(connection._id, {
        selectedCalendarId: "primary-calendar",
      });
      return connection._id;
    });
    expect(connectionId).toBeDefined();

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
