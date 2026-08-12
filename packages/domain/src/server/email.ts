import { and, eq, inArray } from "drizzle-orm";

import { enqueueOutbox, notifications, operatorNotificationDeliveries, providerEvents, withBusinessTransaction } from "@lobbystack/db";
import type { DomainContext } from "./context";

function emailIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const value = payload.emailId ?? payload.email_id;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function reconcileResendProviderEvent(context: DomainContext, input: { businessId: string; providerEventId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const event = (await tx.select({ id: providerEvents.id, eventType: providerEvents.eventType, payload: providerEvents.payload, status: providerEvents.status }).from(providerEvents).where(and(eq(providerEvents.id, input.providerEventId), eq(providerEvents.provider, "resend"), eq(providerEvents.businessId, input.businessId))).limit(1))[0];
    if (!event) return false;
    if (event.status === "processed") return true;
    const emailId = emailIdFromPayload(event.payload);
    const failed = /(?:bounced|failed|complained|delivery_delayed)/i.test(event.eventType);
    const successful = /(?:sent|delivered)/i.test(event.eventType);
    if (emailId && (failed || successful)) {
      const targetStatuses = failed ? ["pending", "processing", "sent"] : ["pending", "processing"];
      await tx.update(notifications).set({ providerMessageId: emailId, status: failed ? "failed" : "sent", updatedAt: new Date() }).where(and(eq(notifications.businessId, input.businessId), eq(notifications.providerMessageId, emailId), inArray(notifications.status, targetStatuses)));
      await tx.update(operatorNotificationDeliveries).set({ providerMessageId: emailId, status: failed ? "failed" : "sent", ...(failed ? { lastError: "Resend reported email delivery failure." } : { sentAt: new Date(), lastError: null }), updatedAt: new Date() }).where(and(eq(operatorNotificationDeliveries.businessId, input.businessId), eq(operatorNotificationDeliveries.providerMessageId, emailId), inArray(operatorNotificationDeliveries.status, targetStatuses)));
    }
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "resend_provider_event", aggregateId: event.id, dedupeKey: `resend-event:${event.id}:processed`, payload: { type: "billing.updated", entityId: event.id } });
    return true;
  });
}
