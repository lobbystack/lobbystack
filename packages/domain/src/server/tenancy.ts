import {
  billingAccounts,
  businesses,
  businessSettings,
  invitations,
  memberships,
  setRlsContext,
} from "@lobbystack/db";
import type { CreateBusinessRequest, UpdateBusinessSettingsRequest } from "@lobbystack/contracts";
import { and, eq, isNull } from "drizzle-orm";

import { recordAuditLog } from "./audit";
import {
  enqueueSideEffect,
  getAppPool,
  getDispatcherPool,
  getWorkerPool,
  withDomainTransaction,
  type DomainDb,
  type TransactionContext,
} from "./context";

const SETTINGS_KEYS = [
  "greeting",
  "voiceInstructions",
  "smsInstructions",
  "businessSummary",
  "bookingPolicy",
  "transferMode",
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

async function upsertSetting(
  db: DomainDb,
  businessId: string,
  key: SettingsKey,
  value: string,
): Promise<void> {
  await db
    .insert(businessSettings)
    .values({
      businessId,
      key,
      valueJson: JSON.stringify(value),
    })
    .onConflictDoUpdate({
      target: [businessSettings.businessId, businessSettings.key],
      set: { valueJson: JSON.stringify(value), updatedAt: new Date() },
    });
}

async function readSettings(
  db: DomainDb,
  businessId: string,
): Promise<Record<SettingsKey, string | undefined>> {
  const rows = await db
    .select({ key: businessSettings.key, valueJson: businessSettings.valueJson })
    .from(businessSettings)
    .where(eq(businessSettings.businessId, businessId));

  const result = {} as Record<SettingsKey, string | undefined>;
  for (const row of rows) {
    if (SETTINGS_KEYS.includes(row.key as SettingsKey)) {
      try {
        result[row.key as SettingsKey] = JSON.parse(row.valueJson) as string;
      } catch {
        result[row.key as SettingsKey] = row.valueJson;
      }
    }
  }
  return result;
}

export async function createBusiness(input: {
  userId: string;
  values: CreateBusinessRequest;
  pool?: TransactionContext["pool"];
}): Promise<string> {
  return withDomainTransaction(
    { userId: input.userId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db, client) => {
      const [business] = await db
        .insert(businesses)
        .values({
          slug: input.values.slug,
          name: input.values.name,
          timezone: input.values.timezone,
          locale: input.values.defaultLocale,
          ownerUserId: input.userId,
        })
        .returning({ id: businesses.id });

      if (!business) {
        throw new Error("Business creation did not return an id");
      }

      await setRlsContext(client, {
        businessId: business.id,
        userId: input.userId,
        actorType: "user",
      });

      await db.insert(memberships).values({
        businessId: business.id,
        userId: input.userId,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
      });

      await db.insert(billingAccounts).values({
        businessId: business.id,
        planSlug: "free_cloud",
        status: "active",
      });

      await enqueueSideEffect(db, {
        businessId: business.id,
        topic: "snapshot.refresh",
        payload: { businessId: business.id, reason: "business_created" },
        dedupeKey: `business:${business.id}:snapshot-created`,
      });

      return business.id;
    },
  );
}

export async function listBusinessesForUser(input: {
  userId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { userId: input.userId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const rows = await db
        .select({
          id: businesses.id,
          slug: businesses.slug,
          name: businesses.name,
          timezone: businesses.timezone,
          locale: businesses.locale,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(businesses, eq(businesses.id, memberships.businessId))
        .where(
          and(eq(memberships.userId, input.userId), eq(memberships.status, "active")),
        );

      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        timezone: row.timezone,
        defaultLocale: row.locale === "fr" ? ("fr" as const) : ("en" as const),
        role: row.role,
      }));
    },
  );
}

export async function listActiveBusinessIds(input?: { pool?: TransactionContext["pool"] }) {
  return withDomainTransaction(
    { actorType: "dispatcher", pool: input?.pool ?? getDispatcherPool() },
    async (db) => {
      const rows = await db
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.status, "active"));
      return rows.map((row) => row.id);
    },
  );
}

export async function getBusinessSettings(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const [business] = await db
        .select({
          id: businesses.id,
          slug: businesses.slug,
          name: businesses.name,
          timezone: businesses.timezone,
          locale: businesses.locale,
        })
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1);

      if (!business) {
        return null;
      }

      const settings = await readSettings(db, input.businessId);
      return {
        ...business,
        greeting: settings.greeting,
        voiceInstructions: settings.voiceInstructions,
        smsInstructions: settings.smsInstructions,
        businessSummary: settings.businessSummary,
        bookingPolicy: settings.bookingPolicy,
        transferMode: settings.transferMode,
      };
    },
  );
}

export async function updateBusinessSettings(input: {
  businessId: string;
  userId: string;
  values: UpdateBusinessSettingsRequest;
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
      if (input.values.name !== undefined || input.values.timezone !== undefined) {
        await db
          .update(businesses)
          .set({
            ...(input.values.name !== undefined ? { name: input.values.name } : {}),
            ...(input.values.timezone !== undefined
              ? { timezone: input.values.timezone }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, input.businessId));
      }

      const settingEntries: Array<[SettingsKey, string]> = [];
      if (input.values.greeting !== undefined) {
        settingEntries.push(["greeting", input.values.greeting]);
      }
      if (input.values.voiceInstructions !== undefined) {
        settingEntries.push(["voiceInstructions", input.values.voiceInstructions]);
      }
      if (input.values.smsInstructions !== undefined) {
        settingEntries.push(["smsInstructions", input.values.smsInstructions]);
      }
      if (input.values.businessSummary !== undefined) {
        settingEntries.push(["businessSummary", input.values.businessSummary]);
      }
      if (input.values.bookingPolicy !== undefined) {
        settingEntries.push(["bookingPolicy", input.values.bookingPolicy]);
      }
      if (input.values.transferMode !== undefined) {
        settingEntries.push(["transferMode", input.values.transferMode]);
      }

      for (const [key, value] of settingEntries) {
        await upsertSetting(db, input.businessId, key, value);
      }

      await recordAuditLog({
        db,
        businessId: input.businessId,
        actorUserId: input.userId,
        actorType: "user",
        action: "business.settings_updated",
        resourceType: "business",
        resourceId: input.businessId,
        metadataJson: { fields: Object.keys(input.values) },
      });

      return getBusinessSettings({ businessId: input.businessId, pool: input.pool });
    },
  );
}

export async function listMemberships(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.businessId, input.businessId),
            eq(memberships.status, "active"),
          ),
        ),
  );
}

export async function listInvitations(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.businessId, input.businessId),
            isNull(invitations.revokedAt),
          ),
        ),
  );
}

export async function revokeInvitation(input: {
  businessId: string;
  invitationId: string;
  userId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => {
      await db
        .update(invitations)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.businessId, input.businessId),
          ),
        );
    },
  );
}

export async function refreshBusinessSnapshot(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "snapshot.refresh",
        payload: { businessId: input.businessId },
        dedupeKey: `business:${input.businessId}:snapshot-refresh`,
      });
    },
  );
}
