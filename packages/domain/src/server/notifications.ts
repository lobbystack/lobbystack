import { notificationDeliveries, notificationPreferences } from "@lobbystack/db";
import type { UpdateNotificationPreferencesRequest } from "@lobbystack/contracts";
import { and, eq } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type TransactionContext,
} from "./context";

export async function getNotificationPreferences(input: {
  businessId: string;
  userId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.businessId, input.businessId),
            eq(notificationPreferences.userId, input.userId),
          ),
        ),
  );
}

export async function updateNotificationPreferences(input: {
  businessId: string;
  userId: string;
  values: UpdateNotificationPreferencesRequest;
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
      const channels: Array<{ channel: string; enabled: boolean }> = [
        { channel: "email", enabled: input.values.emailEnabled },
        { channel: "sms", enabled: input.values.smsEnabled },
      ];

      for (const { channel, enabled } of channels) {
        await db
          .insert(notificationPreferences)
          .values({
            businessId: input.businessId,
            userId: input.userId,
            channel,
            eventKind: "all",
            enabled,
            settingsJson: {
              eventPreferences: input.values.eventPreferences,
              dailySummaryEnabled: input.values.dailySummaryEnabled,
              dailySummarySendTime: input.values.dailySummarySendTime ?? null,
            },
          })
          .onConflictDoNothing();
      }
    },
  );
}

export async function queueNotificationDispatch(input: {
  businessId: string;
  channel: string;
  eventKind: string;
  recipient: string;
  subject?: string;
  body: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (db) => {
      const [delivery] = await db
        .insert(notificationDeliveries)
        .values({
          businessId: input.businessId,
          channel: input.channel,
          eventKind: input.eventKind,
          recipient: input.recipient,
          ...(input.subject ? { subject: input.subject } : {}),
          body: input.body,
          status: "pending",
        })
        .returning({ id: notificationDeliveries.id });

      if (!delivery) {
        throw new Error("Notification delivery was not created");
      }

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "notification.dispatch",
        payload: { businessId: input.businessId, notificationId: delivery.id },
        dedupeKey: `notification:${delivery.id}:dispatch`,
      });

      return delivery;
    },
  );
}

export async function listNotificationDeliveries(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) =>
      db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.businessId, input.businessId))
        .limit(100),
  );
}
