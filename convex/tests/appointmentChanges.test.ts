import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const { workflowStartMock } = vi.hoisted(() => ({
  workflowStartMock: vi.fn(),
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
  };
});

type AppointmentChangeFixture = {
  businessId: Id<"businesses">;
  contactId: Id<"contacts">;
  serviceId: Id<"services">;
  staffId: Id<"staff">;
  appointmentId: Id<"appointments">;
  startsAt: string;
  endsAt: string;
  contactPhone: string;
};

let fixtureCounter = 0;

function createHarness(): TestConvex<typeof schema> {
  return convexTest(schema, modules);
}

async function seedAppointmentChangeFixture(
  t: TestConvex<typeof schema>,
  input?: {
    verificationMode?: "phone_match_and_facts" | "otp_required" | "operator_only";
    allowCancel?: boolean;
    allowReschedule?: boolean;
  },
): Promise<AppointmentChangeFixture> {
  return await t.run(async (ctx) => {
    fixtureCounter += 1;
    const businessId = await ctx.db.insert("businesses", {
      slug: `appointment-change-${fixtureCounter}`,
      name: "Maple Clinic",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting: "Hello",
      tone: "warm",
      summary: "Clinic",
      bookingPolicy: "Confirm before booking.",
      transferMode: "never",
      appointmentChangePolicy: {
        enabled: true,
        allowCancel: input?.allowCancel ?? true,
        allowReschedule: input?.allowReschedule ?? true,
        verificationMode: input?.verificationMode ?? "phone_match_and_facts",
      },
    });
    const staffId = await ctx.db.insert("staff", {
      businessId,
      name: "Front Desk",
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
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      await ctx.db.insert("business_hours", {
        businessId,
        dayOfWeek,
        openMinutes: 0,
        closeMinutes: 24 * 60,
      });
    }
    const contactPhone = "+14165550199";
    const contactId = await ctx.db.insert("contacts", {
      businessId,
      phone: contactPhone,
      name: "Jane Doe",
    });
    const startsAt = "2030-05-15T14:00:00.000Z";
    const endsAt = "2030-05-15T14:30:00.000Z";
    const appointmentId = await ctx.db.insert("appointments", {
      businessId,
      contactId,
      staffId,
      serviceId,
      startsAt,
      endsAt,
      timezone: "America/Toronto",
      status: "confirmed",
      sourceChannel: "sms",
      calendarSyncState: "synced",
      calendarExternalEventId: "external-event-1",
    });
    await ctx.db.insert("notifications", {
      businessId,
      channel: "sms",
      kind: "appointment_reminder",
      relatedId: String(appointmentId),
      scheduledFor: "2030-05-14T14:00:00.000Z",
      status: "scheduled",
      senderRole: "platform_alert",
    });

    return {
      businessId,
      contactId,
      serviceId,
      staffId,
      appointmentId,
      startsAt,
      endsAt,
      contactPhone,
    };
  });
}

describe("appointment change authorization", () => {
  beforeEach(() => {
    workflowStartMock.mockReset();
    workflowStartMock.mockResolvedValue(null);
  });

  it("allows cancellation after phone, name, appointment fact, and final confirmation", async () => {
    const t = createHarness();
    const fixture = await seedAppointmentChangeFixture(t);

    const lookup = await t.query(
      internal.appointments.changes.lookupAppointmentsForChange,
      {
        businessId: fixture.businessId,
        callerPhone: fixture.contactPhone,
      },
    );
    expect(lookup).toMatchObject({
      ok: true,
      phoneMatched: true,
      appointmentCount: 1,
      hasConfirmedAppointments: true,
      appointments: [],
    });
    expect(JSON.stringify(lookup)).not.toContain(fixture.startsAt);
    expect(JSON.stringify(lookup)).not.toContain("Initial Consultation");

    const verification = await t.mutation(
      internal.appointments.changes.verifyAppointmentChangeFacts,
      {
        businessId: fixture.businessId,
        action: "cancel",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "Jane Doe",
        appointmentStartsAt: fixture.startsAt,
      },
    );
    expect(verification.ok).toBe(true);
    if (!verification.ok) {
      throw new Error("Expected verification to succeed.");
    }
    expect(verification.appointmentId).toBe(fixture.appointmentId);

    const result = await t.mutation(
      internal.appointments.changes.cancelAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        finalConfirmation: true,
        verificationId: verification.verificationId,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      action: "cancel",
      status: "canceled",
      calendarSyncState: "pending",
    });
    const state = await t.run(async (ctx) => {
      const appointment = await ctx.db.get(fixture.appointmentId);
      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_kind_and_related_id", (q) =>
          q.eq("kind", "appointment_reminder").eq("relatedId", String(fixture.appointmentId)),
        )
        .collect();
      const audits = await ctx.db
        .query("appointment_change_audit_logs")
        .withIndex("by_appointment_id_and_created_at", (q) =>
          q.eq("appointmentId", fixture.appointmentId),
        )
        .collect();
      return { appointment, notifications, audits };
    });

    expect(state.appointment?.status).toBe("canceled");
    expect(state.notifications[0]?.status).toBe("canceled");
    expect(state.audits.some((audit) => audit.status === "succeeded")).toBe(true);
    expect(workflowStartMock).toHaveBeenCalled();
  });

  it("blocks OTP-required cancellation until OTP is approved", async () => {
    const t = createHarness();
    const fixture = await seedAppointmentChangeFixture(t, {
      verificationMode: "otp_required",
    });

    const verification = await t.mutation(
      internal.appointments.changes.verifyAppointmentChangeFacts,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "cancel",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "Jane Doe",
        serviceName: "Initial Consultation",
      },
    );
    expect(verification.ok).toBe(true);
    if (!verification.ok) {
      throw new Error("Expected verification to require OTP.");
    }
    expect(verification.requiresOtp).toBe(true);

    const blocked = await t.mutation(
      internal.appointments.changes.cancelAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        finalConfirmation: true,
        verificationId: verification.verificationId,
      },
    );
    expect(blocked).toMatchObject({
      ok: false,
      reason: "verification_required",
    });

    await t.mutation(internal.appointments.changes.markAppointmentChangeOtpApproved, {
      verificationId: verification.verificationId,
      status: "otp_verified",
      approvedAt: new Date().toISOString(),
      attemptCount: 1,
    });

    const approved = await t.mutation(
      internal.appointments.changes.cancelAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        finalConfirmation: true,
        verificationId: verification.verificationId,
      },
    );
    expect(approved.ok).toBe(true);
  });

  it("blocks wrong phone, wrong facts, and missing final confirmation", async () => {
    const t = createHarness();
    const fixture = await seedAppointmentChangeFixture(t);

    await expect(
      t.mutation(internal.appointments.changes.verifyAppointmentChangeFacts, {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "cancel",
        channel: "sms",
        callerPhone: "+14165550000",
        callerName: "Jane Doe",
        appointmentStartsAt: fixture.startsAt,
      }),
    ).resolves.toMatchObject({ ok: false, reason: "phone_mismatch" });

    await expect(
      t.mutation(internal.appointments.changes.verifyAppointmentChangeFacts, {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "cancel",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "John Doe",
        appointmentStartsAt: fixture.startsAt,
      }),
    ).resolves.toMatchObject({ ok: false, reason: "name_mismatch" });

    await expect(
      t.mutation(internal.appointments.changes.verifyAppointmentChangeFacts, {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "cancel",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "Jane Doe",
        serviceName: "Different Service",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "service_mismatch" });

    const verification = await t.mutation(
      internal.appointments.changes.verifyAppointmentChangeFacts,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "cancel",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "Jane Doe",
        appointmentStartsAt: fixture.startsAt,
      },
    );
    if (!verification.ok) {
      throw new Error("Expected verification to succeed.");
    }

    const blocked = await t.mutation(
      internal.appointments.changes.cancelAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        finalConfirmation: false,
        verificationId: verification.verificationId,
      },
    );
    expect(blocked).toMatchObject({
      ok: false,
      reason: "missing_final_confirmation",
    });
    const appointment = await t.run(async (ctx) => await ctx.db.get(fixture.appointmentId));
    expect(appointment?.status).toBe("confirmed");
  });

  it("rechecks availability and updates calendar sync state before rescheduling", async () => {
    const t = createHarness();
    const fixture = await seedAppointmentChangeFixture(t);
    const conflictStartsAt = "2030-05-16T14:00:00.000Z";
    const freeStartsAt = "2030-05-16T15:00:00.000Z";

    await t.run(async (ctx) => {
      await ctx.db.insert("appointments", {
        businessId: fixture.businessId,
        contactId: fixture.contactId,
        staffId: fixture.staffId,
        serviceId: fixture.serviceId,
        startsAt: conflictStartsAt,
        endsAt: "2030-05-16T14:30:00.000Z",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "not_required",
      });
    });

    const verification = await t.mutation(
      internal.appointments.changes.verifyAppointmentChangeFacts,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        action: "reschedule",
        channel: "sms",
        callerPhone: fixture.contactPhone,
        callerName: "Jane Doe",
        serviceName: "Initial Consultation",
      },
    );
    if (!verification.ok) {
      throw new Error("Expected verification to succeed.");
    }

    const blocked = await t.mutation(
      internal.appointments.changes.rescheduleAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        startsAt: conflictStartsAt,
        finalConfirmation: true,
        verificationId: verification.verificationId,
      },
    );
    expect(blocked).toMatchObject({ ok: false, reason: "no_availability" });

    const updated = await t.mutation(
      internal.appointments.changes.rescheduleAppointmentForBusiness,
      {
        businessId: fixture.businessId,
        appointmentId: fixture.appointmentId,
        channel: "sms",
        callerPhone: fixture.contactPhone,
        startsAt: freeStartsAt,
        finalConfirmation: true,
        verificationId: verification.verificationId,
      },
    );
    expect(updated).toMatchObject({
      ok: true,
      startsAt: freeStartsAt,
      endsAt: "2030-05-16T15:30:00.000Z",
      calendarSyncState: "pending",
    });

    const appointment = await t.run(async (ctx) => await ctx.db.get(fixture.appointmentId));
    expect(appointment?.startsAt).toBe(freeStartsAt);
    expect(appointment?.endsAt).toBe("2030-05-16T15:30:00.000Z");
    expect(appointment?.calendarSyncState).toBe("pending");
  });
});
