import {
  appointmentAuditLogs,
  appointments,
  contacts,
  services,
  staff,
} from "@lobbystack/db";
import type { BookAppointmentRequest } from "@lobbystack/contracts";
import { and, eq, inArray, sql } from "drizzle-orm";

import { computeAvailability } from "../availability";
import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export class BookingConflictError extends Error {
  constructor() {
    super("The requested appointment time is no longer available");
    this.name = "BookingConflictError";
  }
}

const ACTIVE_STATUSES = ["scheduled", "confirmed", "held"];

async function lockOverlappingAppointments(
  client: import("pg").PoolClient,
  input: {
    businessId: string;
    staffId?: string;
    startsAt: Date;
    endsAt: Date;
    excludeAppointmentId?: string;
  },
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM app.appointments
     WHERE business_id = $1
       AND status = ANY($2::text[])
       AND ($3::uuid IS NULL OR staff_id = $3::text)
       AND tstzrange(starts_at, ends_at, '[)') && tstzrange($4::timestamptz, $5::timestamptz, '[)')
       AND ($6::uuid IS NULL OR id <> $6::uuid)
     FOR UPDATE`,
    [
      input.businessId,
      ACTIVE_STATUSES,
      input.staffId ?? null,
      input.startsAt.toISOString(),
      input.endsAt.toISOString(),
      input.excludeAppointmentId ?? null,
    ],
  );

  if (result.rows.length > 0) {
    throw new BookingConflictError();
  }
}

export async function checkAvailability(input: {
  businessId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  staffId?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db, client) => {
      const [service] = await db
        .select({ durationMinutes: services.durationMinutes })
        .from(services)
        .where(
          and(eq(services.id, input.serviceId), eq(services.businessId, input.businessId)),
        )
        .limit(1);

      if (!service) {
        return [];
      }

      const staffRows = input.staffId
        ? await db
            .select({ id: staff.id })
            .from(staff)
            .where(
              and(
                eq(staff.businessId, input.businessId),
                eq(staff.id, input.staffId),
                eq(staff.isActive, true),
              ),
            )
        : await db
            .select({ id: staff.id })
            .from(staff)
            .where(and(eq(staff.businessId, input.businessId), eq(staff.isActive, true)));

      const appointmentRows = await db
        .select({
          staffId: appointments.staffId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, input.businessId),
            inArray(appointments.status, ACTIVE_STATUSES),
          ),
        );

      const slots = computeAvailability({
        request: {
          serviceId: input.serviceId,
          startsAt: input.startsAt,
          timezone: input.timezone,
          ...(input.staffId ? { preferredStaffId: input.staffId } : {}),
        },
        serviceDurationMinutes: service.durationMinutes,
        staffIds: staffRows.map((row) => row.id),
        hours: [],
        closures: [],
        existingAppointments: appointmentRows
          .filter((row) => Boolean(row.staffId))
          .map((row) => ({
            staffId: row.staffId!,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
          })),
      });

      if (slots.length === 0) {
        return slots;
      }

      await lockOverlappingAppointments(client, {
        businessId: input.businessId,
        ...(input.staffId ? { staffId: input.staffId } : {}),
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      });

      return slots;
    },
  );
}

export async function bookAppointment(input: {
  businessId: string;
  userId?: string;
  values: BookAppointmentRequest;
  source?: string;
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? (input.userId ? getAppPool() : getWorkerPool());

  return withDomainTransaction(
    {
      businessId: input.businessId,
      ...(input.userId ? { userId: input.userId } : {}),
      actorType: input.userId ? "user" : "worker",
      pool,
    },
    async (db, client) => {
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(eq(contacts.id, input.values.contactId), eq(contacts.businessId, input.businessId)),
        )
        .limit(1);

      const [service] = await db
        .select({ id: services.id })
        .from(services)
        .where(
          and(eq(services.id, input.values.serviceId), eq(services.businessId, input.businessId)),
        )
        .limit(1);

      if (!contact || !service) {
        throw new Error("Booking references a resource outside the active business");
      }

      if (input.values.staffId) {
        const [assignedStaff] = await db
          .select({ id: staff.id })
          .from(staff)
          .where(
            and(eq(staff.id, input.values.staffId), eq(staff.businessId, input.businessId)),
          )
          .limit(1);

        if (!assignedStaff) {
          throw new Error("Booking references a staff member outside the active business");
        }
      }

      await lockOverlappingAppointments(client, {
        businessId: input.businessId,
        ...(input.values.staffId ? { staffId: input.values.staffId } : {}),
        startsAt: new Date(input.values.startsAt),
        endsAt: new Date(input.values.endsAt),
      });

      const [appointment] = await db
        .insert(appointments)
        .values({
          businessId: input.businessId,
          contactId: input.values.contactId,
          serviceId: input.values.serviceId,
          ...(input.values.staffId ? { staffId: input.values.staffId } : {}),
          startsAt: new Date(input.values.startsAt),
          endsAt: new Date(input.values.endsAt),
          timezone: "UTC",
          status: "scheduled",
          source: input.source ?? "dashboard",
        })
        .returning({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
        });

      if (!appointment) {
        throw new Error("Appointment creation did not return a record");
      }

      await db.insert(appointmentAuditLogs).values({
        businessId: input.businessId,
        appointmentId: appointment.id,
        ...(input.userId ? { actorUserId: input.userId } : {}),
        actorType: input.userId ? "user" : "worker",
        action: "created",
        afterJson: appointment,
      });

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "appointment.created",
        payload: { businessId: input.businessId, entityId: appointment.id },
        dedupeKey: `appointment:${appointment.id}:created`,
      });

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "calendar.syncAppointment",
        payload: {
          businessId: input.businessId,
          appointmentId: appointment.id,
          connectionId: "",
        },
        dedupeKey: `appointment:${appointment.id}:calendar-sync`,
      });

      return appointment;
    },
  );
}

export async function cancelAppointment(input: {
  businessId: string;
  appointmentId: string;
  userId?: string;
  reason?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    {
      businessId: input.businessId,
      ...(input.userId ? { userId: input.userId } : {}),
      actorType: input.userId ? "user" : "worker",
      pool: input.pool ?? getAppPool(),
    },
    async (db, client) => {
      const [existing] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.id, input.appointmentId),
            eq(appointments.businessId, input.businessId),
          ),
        )
        .limit(1);

      if (!existing) {
        return null;
      }

      await client.query(`SELECT id FROM app.appointments WHERE id = $1 FOR UPDATE`, [
        input.appointmentId,
      ]);

      const [updated] = await db
        .update(appointments)
        .set({
          status: "cancelled",
          ...(input.reason ? { cancellationReason: input.reason } : {}),
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, input.appointmentId))
        .returning({
          id: appointments.id,
          status: appointments.status,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        });

      if (updated) {
        await enqueueSideEffect(db, {
          businessId: input.businessId,
          topic: "appointment.updated",
          payload: { businessId: input.businessId, entityId: updated.id },
          dedupeKey: `appointment:${updated.id}:cancelled`,
        });
      }

      return updated ?? null;
    },
  );
}

export async function rescheduleAppointment(input: {
  businessId: string;
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  userId?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    {
      businessId: input.businessId,
      ...(input.userId ? { userId: input.userId } : {}),
      actorType: input.userId ? "user" : "worker",
      pool: input.pool ?? getAppPool(),
    },
    async (db, client) => {
      const [existing] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.id, input.appointmentId),
            eq(appointments.businessId, input.businessId),
          ),
        )
        .limit(1);

      if (!existing) {
        return null;
      }

      await client.query(`SELECT id FROM app.appointments WHERE id = $1 FOR UPDATE`, [
        input.appointmentId,
      ]);

      await lockOverlappingAppointments(client, {
        businessId: input.businessId,
        ...(existing.staffId ? { staffId: existing.staffId } : {}),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        excludeAppointmentId: input.appointmentId,
      });

      const [updated] = await db
        .update(appointments)
        .set({
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "scheduled",
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, input.appointmentId))
        .returning({
          id: appointments.id,
          status: appointments.status,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        });

      if (updated) {
        await enqueueSideEffect(db, {
          businessId: input.businessId,
          topic: "appointment.updated",
          payload: { businessId: input.businessId, entityId: updated.id },
          dedupeKey: `appointment:${updated.id}:rescheduled`,
        });
      }

      return updated ?? null;
    },
  );
}

export async function listUpcomingAppointments(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, input.businessId),
            sql`${appointments.startsAt} >= now()`,
            inArray(appointments.status, ACTIVE_STATUSES),
          ),
        )
        .orderBy(appointments.startsAt)
        .limit(100),
  );
}
