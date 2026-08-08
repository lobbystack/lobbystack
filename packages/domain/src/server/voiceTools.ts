import { appointments, calls, contacts, messages, services, staff } from "@lobbystack/db";
import type {
  BookAppointmentToolRequest,
  CheckAvailabilityToolRequest,
  FindAvailabilityToolRequest,
  LookupAppointmentForChangeToolRequest,
  SearchKnowledgeToolRequest,
  TakeMessageToolRequest,
} from "@lobbystack/contracts";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { DateTime } from "luxon";

import { computeAvailability } from "../availability";
import { bookAppointment } from "./booking";
import {
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";
import { searchKnowledge } from "./knowledge";
import { getBusinessSettings } from "./tenancy";

const ACTIVE_STATUSES = ["scheduled", "confirmed", "held"];

async function loadAvailabilityContext(input: {
  businessId: string;
  serviceName: string;
  pool?: TransactionContext["pool"];
}) {
  const settings = await getBusinessSettings({
    businessId: input.businessId,
    pool: input.pool,
  });

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [service] = await db
        .select({
          id: services.id,
          name: services.name,
          durationMinutes: services.durationMinutes,
        })
        .from(services)
        .where(
          and(
            eq(services.businessId, input.businessId),
            eq(services.isActive, true),
            ilike(services.name, input.serviceName),
          ),
        )
        .limit(1);

      if (!service) {
        return null;
      }

      const staffRows = await db
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
        )
        .orderBy(asc(appointments.startsAt));

      return {
        serviceId: service.id,
        serviceName: service.name,
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
        timezone: settings?.timezone ?? "UTC",
      };
    },
  );
}

function computeSlot(
  context: NonNullable<Awaited<ReturnType<typeof loadAvailabilityContext>>>,
  input: { startsAt: string; timezone: string; preferredStaffId?: string | undefined },
) {
  return computeAvailability({
    request: {
      serviceId: context.serviceId,
      startsAt: input.startsAt,
      timezone: input.timezone,
      ...(input.preferredStaffId !== undefined
        ? { preferredStaffId: input.preferredStaffId }
        : {}),
    },
    serviceDurationMinutes: context.serviceDurationMinutes,
    staffIds: context.staffIds,
    hours: context.hours,
    closures: context.closures,
    existingAppointments: context.existingAppointments,
  });
}

export async function findVoiceAvailability(input: FindAvailabilityToolRequest & {
  pool?: TransactionContext["pool"];
}) {
  const context = await loadAvailabilityContext({
    businessId: input.businessId,
    serviceName: input.serviceName,
    pool: input.pool,
  });

  if (!context) {
    return {
      serviceId: "",
      serviceName: input.serviceName,
      timezone: input.timezone,
      date: input.date,
      summary: "Service is not configured.",
      setupIssue: "SERVICE_NOT_FOUND",
      slots: [],
    };
  }

  const day = DateTime.fromISO(input.date, { zone: input.timezone }).startOf("day");
  const startMinute =
    input.preferredHour24 !== undefined
      ? input.preferredHour24 * 60 + (input.preferredMinute ?? 0)
      : 8 * 60;

  const slots: Array<{
    staffId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
    displayTime: string;
  }> = [];

  for (let minute = startMinute; minute < 24 * 60 && slots.length < (input.limit ?? 8); minute += 15) {
    const candidate = day.plus({ minutes: minute });
    const startsAt = candidate.toUTC().toISO();
    if (!startsAt) {
      continue;
    }

    const available = computeSlot(context, {
      startsAt,
      timezone: input.timezone,
      ...(input.preferredStaffId !== undefined
        ? { preferredStaffId: input.preferredStaffId }
        : {}),
    });

    for (const slot of available) {
      slots.push({ ...slot, displayTime: candidate.toFormat("h:mm a") });
      if (slots.length >= (input.limit ?? 8)) {
        break;
      }
    }
  }

  return {
    serviceId: context.serviceId,
    serviceName: context.serviceName,
    timezone: input.timezone,
    date: input.date,
    summary: slots.length
      ? `${slots.length} times are available.`
      : "There are no matching times available.",
    slots,
  };
}

export async function checkVoiceAvailability(input: CheckAvailabilityToolRequest & {
  pool?: TransactionContext["pool"];
}) {
  const context = await loadAvailabilityContext({
    businessId: input.businessId,
    serviceName: input.serviceName,
    pool: input.pool,
  });

  if (!context) {
    return {
      serviceId: "",
      serviceName: input.serviceName,
      setupIssue: "SERVICE_NOT_FOUND",
      availability: [],
    };
  }

  return {
    serviceId: context.serviceId,
    serviceName: context.serviceName,
    availability: computeSlot(context, input),
  };
}

export async function bookVoiceAppointment(input: BookAppointmentToolRequest & {
  pool?: TransactionContext["pool"];
}) {
  const context = await loadAvailabilityContext({
    businessId: input.businessId,
    serviceName: input.serviceName,
    pool: input.pool,
  });

  if (!context) {
    throw new Error("Service is not configured");
  }

  const available = computeSlot(context, input);
  const staffId = available[0]?.staffId;
  if (!staffId) {
    throw new Error("Requested appointment time is unavailable");
  }

  const endsAt = DateTime.fromISO(input.startsAt)
    .plus({ minutes: context.serviceDurationMinutes })
    .toUTC()
    .toJSDate();

  const contact = await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(eq(contacts.businessId, input.businessId), eq(contacts.phoneE164, input.contactPhone)),
        )
        .limit(1);

      if (existing) {
        return existing;
      }

      const [created] = await db
        .insert(contacts)
        .values({
          businessId: input.businessId,
          phoneE164: input.contactPhone,
          ...(input.contactName ? { displayName: input.contactName } : {}),
        })
        .returning({ id: contacts.id });

      if (!created) {
        throw new Error("Contact could not be created");
      }

      return created;
    },
  );

  const appointment = await bookAppointment({
    businessId: input.businessId,
    values: {
      contactId: contact.id,
      serviceId: context.serviceId,
      staffId,
      startsAt: input.startsAt,
      endsAt: endsAt.toISOString(),
    },
    source: input.channel ?? "voice",
    pool: input.pool,
  });

  return {
    appointmentId: appointment.id,
    contactId: contact.id,
    serviceId: context.serviceId,
    serviceName: context.serviceName,
  };
}

export async function lookupVoiceAppointments(input: LookupAppointmentForChangeToolRequest & {
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const rows = await db
        .select({
          id: appointments.id,
          serviceName: services.name,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
        })
        .from(appointments)
        .innerJoin(contacts, eq(contacts.id, appointments.contactId))
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .where(
          and(
            eq(appointments.businessId, input.businessId),
            eq(contacts.phoneE164, input.callerPhone),
            inArray(appointments.status, ACTIVE_STATUSES),
          ),
        );

      return rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      }));
    },
  );
}

export async function takeVoiceMessage(input: TakeMessageToolRequest & {
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      let conversationId = input.conversationId;

      if (!conversationId) {
        const [call] = await db
          .select({ conversationId: calls.conversationId })
          .from(calls)
          .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)))
          .limit(1);

        conversationId = call?.conversationId ?? undefined;
      }

      if (!conversationId) {
        throw new Error("Conversation is required to take a message");
      }

      const [message] = await db
        .insert(messages)
        .values({
          businessId: input.businessId,
          conversationId,
          direction: "inbound",
          senderRole: "caller",
          body: input.message,
          status: "received",
          metadataJson: {
            callId: input.callId,
            urgency: input.urgency,
            callbackPhone: input.callbackPhone,
            callbackWindow: input.callbackWindow,
            callerName: input.callerName,
          },
        })
        .returning({ id: messages.id });

      return { messageId: message?.id ?? null, conversationId };
    },
  );
}

export async function searchVoiceKnowledge(input: SearchKnowledgeToolRequest & {
  embedding: number[];
  pool?: TransactionContext["pool"];
}) {
  const results = await searchKnowledge({
    businessId: input.businessId,
    embedding: input.embedding,
    pool: input.pool,
  });

  return {
    query: input.query,
    results: results.map((result) => ({
      title: result.title,
      content: result.textContent,
      score: result.score,
    })),
  };
}
