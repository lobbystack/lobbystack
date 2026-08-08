import {
  businessHours,
  closures,
  phoneNumbers,
  receptionistProfiles,
  services,
  staff,
  staffServices,
} from "@lobbystack/db";
import type { CreateServiceRequest, CreateStaffRequest } from "@lobbystack/contracts";
import { and, desc, eq } from "drizzle-orm";

import { getAppPool, withDomainTransaction, type TransactionContext } from "./context";

export async function listServices(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select({
          id: services.id,
          name: services.name,
          durationMinutes: services.durationMinutes,
          isActive: services.isActive,
          updatedAt: services.updatedAt,
        })
        .from(services)
        .where(eq(services.businessId, input.businessId))
        .orderBy(desc(services.updatedAt)),
  );
}

export async function createService(input: {
  businessId: string;
  userId: string;
  values: CreateServiceRequest;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => {
      const [service] = await db
        .insert(services)
        .values({
          businessId: input.businessId,
          name: input.values.name,
          durationMinutes: input.values.durationMinutes,
        })
        .returning({
          id: services.id,
          name: services.name,
          durationMinutes: services.durationMinutes,
          isActive: services.isActive,
        });

      if (!service) {
        throw new Error("Service was not created");
      }

      return service;
    },
  );
}

export async function listStaff(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          isActive: staff.isActive,
          updatedAt: staff.updatedAt,
        })
        .from(staff)
        .where(eq(staff.businessId, input.businessId))
        .orderBy(desc(staff.updatedAt)),
  );
}

export async function createStaff(input: {
  businessId: string;
  userId: string;
  values: CreateStaffRequest;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => {
      const [member] = await db
        .insert(staff)
        .values({
          businessId: input.businessId,
          name: input.values.name,
        })
        .returning({
          id: staff.id,
          name: staff.name,
          isActive: staff.isActive,
        });

      if (!member) {
        throw new Error("Staff member was not created");
      }

      return member;
    },
  );
}

export async function listBusinessHours(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(businessHours)
        .where(eq(businessHours.businessId, input.businessId))
        .orderBy(businessHours.dayOfWeek),
  );
}

export async function setBusinessHours(input: {
  businessId: string;
  userId: string;
  hours: Array<{
    dayOfWeek: number;
    openMinutes: number;
    closeMinutes: number;
  }>;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => {
      await db.delete(businessHours).where(eq(businessHours.businessId, input.businessId));

      if (input.hours.length === 0) {
        return [];
      }

      return db
        .insert(businessHours)
        .values(
          input.hours.map((window) => ({
            businessId: input.businessId,
            dayOfWeek: window.dayOfWeek,
            openMinutes: window.openMinutes,
            closeMinutes: window.closeMinutes,
          })),
        )
        .returning();
    },
  );
}

export async function listClosures(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db.select().from(closures).where(eq(closures.businessId, input.businessId)),
  );
}

export async function listPhoneNumbers(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(phoneNumbers)
        .where(eq(phoneNumbers.businessId, input.businessId))
        .orderBy(desc(phoneNumbers.isPrimary)),
  );
}

export async function upsertPhoneNumber(input: {
  businessId: string;
  e164: string;
  label?: string;
  isPrimary?: boolean;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [number] = await db
        .insert(phoneNumbers)
        .values({
          businessId: input.businessId,
          e164: input.e164,
          ...(input.label ? { label: input.label } : {}),
          isPrimary: input.isPrimary ?? false,
        })
        .onConflictDoUpdate({
          target: phoneNumbers.e164,
          set: {
            ...(input.label ? { label: input.label } : {}),
            ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();

      return number ?? null;
    },
  );
}

export async function getReceptionistProfile(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [profile] = await db
        .select()
        .from(receptionistProfiles)
        .where(
          and(
            eq(receptionistProfiles.businessId, input.businessId),
            eq(receptionistProfiles.isActive, true),
          ),
        )
        .limit(1);
      return profile ?? null;
    },
  );
}

export async function upsertReceptionistProfile(input: {
  businessId: string;
  displayName: string;
  greeting?: string;
  voiceId?: string;
  language?: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const existing = await getReceptionistProfile({
        businessId: input.businessId,
        pool: input.pool,
      });

      if (existing) {
        const [updated] = await db
          .update(receptionistProfiles)
          .set({
            displayName: input.displayName,
            ...(input.greeting !== undefined ? { greeting: input.greeting } : {}),
            ...(input.voiceId !== undefined ? { voiceId: input.voiceId } : {}),
            ...(input.language !== undefined ? { language: input.language } : {}),
            updatedAt: new Date(),
          })
          .where(eq(receptionistProfiles.id, existing.id))
          .returning();
        return updated ?? null;
      }

      const [created] = await db
        .insert(receptionistProfiles)
        .values({
          businessId: input.businessId,
          displayName: input.displayName,
          ...(input.greeting ? { greeting: input.greeting } : {}),
          ...(input.voiceId ? { voiceId: input.voiceId } : {}),
          language: input.language ?? "en",
        })
        .returning();

      return created ?? null;
    },
  );
}

export async function linkStaffService(input: {
  businessId: string;
  staffId: string;
  serviceId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      await db
        .insert(staffServices)
        .values({
          businessId: input.businessId,
          staffId: input.staffId,
          serviceId: input.serviceId,
        })
        .onConflictDoNothing();
    },
  );
}
