import { randomUUID } from "node:crypto";

import { and, count, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { auditLogs, enqueueOutbox, idempotencyKeys, webhookDeliveries, webhookDeliveryAttempts, webhookEndpoints, webhookEvents, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";
import {
  PUBLIC_API_IDEMPOTENCY_TTL_HOURS,
  PUBLIC_API_VERSION,
  WEBHOOK_HISTORY_RETENTION_DAYS,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_MAX_ENDPOINTS_PER_BUSINESS,
  WEBHOOK_RETRY_DELAYS_SECONDS,
  WEBHOOK_TEST_EVENT_TYPE,
  isWebhookEventType,
  webhookEventResource,
  type ApiWebhookEndpoint,
  type ApiWebhookEventPayload,
  type WebhookEventType,
} from "@lobbystack/shared";
import { getMeter, recordException } from "@lobbystack/telemetry/node";

import { requireBusinessAdmin } from "../../authz";
import type { DomainContext } from "../context";
import { queueOperatorAlertInTransaction } from "../notifications";
import { conflict, invalidRequest, notFound } from "./errors";
import { loadAppointmentResource, loadCallResource, loadContactResource, loadMessageResource, serializeWebhookEndpoint } from "./resources";
import { assertWebhookUrlAllowed } from "./webhookNetwork";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret, type WebhookSender } from "./webhookTransport";

const meter = getMeter("lobbystack-webhooks");
const emitFailures = meter.createCounter("lobbystack.webhooks.emit_failures", { unit: "{event}" });
const deliveryAttempts = meter.createCounter("lobbystack.webhooks.delivery_attempts", { unit: "{attempt}" });
const endpointsDisabled = meter.createCounter("lobbystack.webhooks.endpoints_disabled", { unit: "{endpoint}" });

/** Who is managing an endpoint: a signed-in owner or admin, or an API key with webhooks:manage. */
export type WebhookManager = { kind: "operator"; userId: string } | { kind: "api_key"; apiKeyId: string };

async function asManager<T>(context: DomainContext, businessId: string, manager: WebhookManager, callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  if (manager.kind === "operator") {
    return await withBusinessTransaction(context.db, { userId: manager.userId, businessId, actorType: "operator" }, async (tx) => {
      await requireBusinessAdmin(tx, { userId: manager.userId, businessId });
      return await callback(tx);
    });
  }
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, callback);
}

function auditActor(manager: WebhookManager) {
  return manager.kind === "operator" ? { actorUserId: manager.userId, payload: { actor: "operator" } } : { actorUserId: null, payload: { actor: "api_key", apiKeyId: manager.apiKeyId } };
}

function normalizeEvents(events: readonly string[]): WebhookEventType[] {
  const unknown = events.filter((event) => !isWebhookEventType(event));
  if (unknown.length) throw invalidRequest(`Unknown events: ${unknown.join(", ")}.`);
  if (!events.length) throw invalidRequest("Choose at least one event.");
  return [...new Set(events)] as WebhookEventType[];
}

export type WebhookEndpointDetail = ApiWebhookEndpoint & { consecutive_failures: number; last_success_at: string | null; last_failure_at: string | null };

function detail(row: typeof webhookEndpoints.$inferSelect): WebhookEndpointDetail {
  return { ...serializeWebhookEndpoint(row), consecutive_failures: row.consecutiveFailures, last_success_at: row.lastSuccessAt?.toISOString() ?? null, last_failure_at: row.lastFailureAt?.toISOString() ?? null };
}

export async function listWebhookEndpoints(context: DomainContext, input: { businessId: string; manager: WebhookManager }): Promise<WebhookEndpointDetail[]> {
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    const rows = await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.businessId, input.businessId)).orderBy(desc(webhookEndpoints.createdAt), desc(webhookEndpoints.id));
    return rows.map(detail);
  });
}

export async function getWebhookEndpoint(context: DomainContext, input: { businessId: string; manager: WebhookManager; endpointId: string }): Promise<WebhookEndpointDetail> {
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    const [row] = await tx.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.id, input.endpointId))).limit(1);
    if (!row) throw notFound("Webhook endpoint");
    return detail(row);
  });
}

/** Returns the signing secret once. It is stored encrypted and never shown again. */
export async function createWebhookEndpoint(
  context: DomainContext,
  input: { businessId: string; manager: WebhookManager; url: string; events: readonly string[]; description?: string | undefined },
): Promise<{ endpoint: WebhookEndpointDetail; secret: string }> {
  const url = assertWebhookUrlAllowed(input.url).toString();
  const events = normalizeEvents(input.events);
  const secret = generateWebhookSecret();
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    // Serialize creation per business so the endpoint cap holds under concurrent requests.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`webhook-endpoints:${input.businessId}`}, 0))`);
    const [existing] = await tx.select({ total: count() }).from(webhookEndpoints).where(eq(webhookEndpoints.businessId, input.businessId));
    if (Number(existing?.total ?? 0) >= WEBHOOK_MAX_ENDPOINTS_PER_BUSINESS) throw conflict(`A business can have up to ${WEBHOOK_MAX_ENDPOINTS_PER_BUSINESS} webhook endpoints.`);
    const [row] = await tx.insert(webhookEndpoints).values({
      businessId: input.businessId,
      url,
      events,
      encryptedSecret: encryptWebhookSecret(secret),
      ...(input.description?.trim() ? { description: input.description.trim().slice(0, 200) } : {}),
      ...(input.manager.kind === "operator" ? { createdByUserId: input.manager.userId } : { createdByApiKeyId: input.manager.apiKeyId }),
    }).returning();
    if (!row) throw new Error("The webhook endpoint could not be created.");
    const actor = auditActor(input.manager);
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.actorUserId, eventType: "webhook_endpoint.created", entityType: "webhook_endpoint", entityId: row.id, payload: { ...actor.payload, events } });
    return { endpoint: detail(row), secret };
  });
}

export async function updateWebhookEndpoint(
  context: DomainContext,
  input: { businessId: string; manager: WebhookManager; endpointId: string; url?: string | undefined; events?: readonly string[] | undefined; description?: string | null | undefined; status?: "enabled" | "disabled" | undefined },
): Promise<WebhookEndpointDetail> {
  const url = input.url !== undefined ? assertWebhookUrlAllowed(input.url).toString() : undefined;
  const events = input.events !== undefined ? normalizeEvents(input.events) : undefined;
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    const patch: Partial<typeof webhookEndpoints.$inferInsert> = { updatedAt: new Date() };
    if (url !== undefined) patch.url = url;
    if (events !== undefined) patch.events = events;
    if (input.description !== undefined) patch.description = input.description?.trim() ? input.description.trim().slice(0, 200) : null;
    if (input.status === "enabled") Object.assign(patch, { status: "enabled", disabledReason: null, disabledAt: null, consecutiveFailures: 0 });
    if (input.status === "disabled") Object.assign(patch, { status: "disabled", disabledReason: "manual", disabledAt: new Date() });
    const [row] = await tx.update(webhookEndpoints).set(patch).where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.id, input.endpointId))).returning();
    if (!row) throw notFound("Webhook endpoint");
    const actor = auditActor(input.manager);
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.actorUserId, eventType: "webhook_endpoint.updated", entityType: "webhook_endpoint", entityId: row.id, payload: { ...actor.payload, fields: Object.keys(patch).filter((key) => key !== "updatedAt") } });
    return detail(row);
  });
}

export async function deleteWebhookEndpoint(context: DomainContext, input: { businessId: string; manager: WebhookManager; endpointId: string }): Promise<void> {
  await asManager(context, input.businessId, input.manager, async (tx) => {
    const [row] = await tx.delete(webhookEndpoints).where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.id, input.endpointId))).returning({ id: webhookEndpoints.id });
    if (!row) throw notFound("Webhook endpoint");
    const actor = auditActor(input.manager);
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.actorUserId, eventType: "webhook_endpoint.deleted", entityType: "webhook_endpoint", entityId: row.id, payload: actor.payload });
  });
}

/** Replaces the signing secret immediately. Deliveries after this call use the new secret. */
export async function rotateWebhookSecret(context: DomainContext, input: { businessId: string; manager: WebhookManager; endpointId: string }): Promise<{ secret: string }> {
  const secret = generateWebhookSecret();
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    const [row] = await tx.update(webhookEndpoints).set({ encryptedSecret: encryptWebhookSecret(secret), updatedAt: new Date() }).where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.id, input.endpointId))).returning({ id: webhookEndpoints.id });
    if (!row) throw notFound("Webhook endpoint");
    const actor = auditActor(input.manager);
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: actor.actorUserId, eventType: "webhook_endpoint.secret_rotated", entityType: "webhook_endpoint", entityId: row.id, payload: actor.payload });
    return { secret };
  });
}

function buildEventPayload(input: { id: string; type: string; businessId: string; createdAt: Date; data: Record<string, unknown> }): ApiWebhookEventPayload {
  return { id: input.id, type: input.type, api_version: PUBLIC_API_VERSION, created_at: input.createdAt.toISOString(), business_id: input.businessId, data: input.data };
}

async function queueDelivery(tx: DatabaseTransaction, input: { businessId: string; endpointId: string; eventId: string }): Promise<string> {
  const [delivery] = await tx.insert(webhookDeliveries).values({ businessId: input.businessId, endpointId: input.endpointId, eventId: input.eventId, nextAttemptAt: new Date() }).returning({ id: webhookDeliveries.id });
  if (!delivery) throw new Error("The webhook delivery could not be queued.");
  await enqueueOutbox(tx, { topic: "webhook.deliver", businessId: input.businessId, aggregateType: "webhook_delivery", aggregateId: delivery.id, dedupeKey: `webhook-delivery:${delivery.id}:attempt:1`, payload: { deliveryId: delivery.id, attempt: 1 } });
  return delivery.id;
}

async function loadEventData(tx: DatabaseTransaction, businessId: string, type: WebhookEventType, resourceId: string): Promise<Record<string, unknown> | null> {
  switch (webhookEventResource[type]) {
    case "call": return await loadCallResource(tx, businessId, resourceId);
    case "appointment": return await loadAppointmentResource(tx, businessId, resourceId);
    case "message": return await loadMessageResource(tx, businessId, resourceId);
    case "contact": return await loadContactResource(tx, businessId, resourceId);
  }
}

/**
 * Records a webhook event in the caller's transaction and queues one delivery
 * per subscribed endpoint through the outbox, so the event exists exactly when
 * the domain change commits. The payload is the v1 REST resource as of this
 * transaction. A failure here is contained in a savepoint and never rolls back
 * the domain change that triggered it.
 */
export async function emitWebhookEventInTransaction(tx: DatabaseTransaction, input: { businessId: string; type: WebhookEventType; resourceId: string }): Promise<string | null> {
  try {
    return await tx.transaction(async (savepoint) => {
      const endpoints = await savepoint.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(
        eq(webhookEndpoints.businessId, input.businessId),
        eq(webhookEndpoints.status, "enabled"),
        sql`${webhookEndpoints.events} @> ${JSON.stringify([input.type])}::jsonb`,
      ));
      if (endpoints.length === 0) return null;
      const data = await loadEventData(savepoint, input.businessId, input.type, input.resourceId);
      if (!data) return null;
      const eventId = randomUUID();
      const createdAt = new Date();
      await savepoint.insert(webhookEvents).values({ id: eventId, businessId: input.businessId, type: input.type, payload: buildEventPayload({ id: eventId, type: input.type, businessId: input.businessId, createdAt, data }), createdAt });
      for (const endpoint of endpoints) await queueDelivery(savepoint, { businessId: input.businessId, endpointId: endpoint.id, eventId });
      return eventId;
    });
  } catch (error) {
    emitFailures.add(1, { type: input.type });
    recordException(error, { service: "webhooks", operation: "emit", eventType: input.type });
    return null;
  }
}

/** Queues a webhook.test event to one endpoint, whether or not it is subscribed or enabled. */
export async function sendWebhookTestEvent(context: DomainContext, input: { businessId: string; manager: WebhookManager; endpointId: string }): Promise<{ event_id: string; delivery_id: string }> {
  return await asManager(context, input.businessId, input.manager, async (tx) => {
    const [endpoint] = await tx.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.businessId, input.businessId), eq(webhookEndpoints.id, input.endpointId))).limit(1);
    if (!endpoint) throw notFound("Webhook endpoint");
    const eventId = randomUUID();
    const createdAt = new Date();
    await tx.insert(webhookEvents).values({ id: eventId, businessId: input.businessId, type: WEBHOOK_TEST_EVENT_TYPE, payload: buildEventPayload({ id: eventId, type: WEBHOOK_TEST_EVENT_TYPE, businessId: input.businessId, createdAt, data: { endpoint_id: endpoint.id, message: "This is a test event from LobbyStack." } }), createdAt });
    const deliveryId = await queueDelivery(tx, { businessId: input.businessId, endpointId: endpoint.id, eventId });
    return { event_id: eventId, delivery_id: deliveryId };
  });
}

export type WebhookDeliveryRecord = {
  id: string;
  eventId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
};

export async function listWebhookDeliveries(context: DomainContext, input: { businessId: string; userId: string; endpointId: string; limit?: number }): Promise<WebhookDeliveryRecord[]> {
  return await asManager(context, input.businessId, { kind: "operator", userId: input.userId }, async (tx) => {
    const rows = await tx.select({
      id: webhookDeliveries.id,
      eventId: webhookDeliveries.eventId,
      eventType: webhookEvents.type,
      status: webhookDeliveries.status,
      attemptCount: webhookDeliveries.attemptCount,
      lastResponseStatus: webhookDeliveries.lastResponseStatus,
      lastError: webhookDeliveries.lastError,
      nextAttemptAt: webhookDeliveries.nextAttemptAt,
      lastAttemptAt: webhookDeliveries.lastAttemptAt,
      createdAt: webhookDeliveries.createdAt,
    }).from(webhookDeliveries)
      .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
      .where(and(eq(webhookDeliveries.businessId, input.businessId), eq(webhookDeliveries.endpointId, input.endpointId)))
      .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
      .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
    return rows.map((row) => ({ ...row, nextAttemptAt: row.status === "retrying" || row.status === "pending" ? row.nextAttemptAt?.toISOString() ?? null : null, lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }));
  });
}

/** Sends the same event again as a new delivery. The webhook-id stays the same, so receivers can deduplicate. */
export async function resendWebhookDelivery(context: DomainContext, input: { businessId: string; userId: string; deliveryId: string }): Promise<{ deliveryId: string }> {
  return await asManager(context, input.businessId, { kind: "operator", userId: input.userId }, async (tx) => {
    const [original] = await tx.select({ endpointId: webhookDeliveries.endpointId, eventId: webhookDeliveries.eventId }).from(webhookDeliveries).where(and(eq(webhookDeliveries.businessId, input.businessId), eq(webhookDeliveries.id, input.deliveryId))).limit(1);
    if (!original) throw notFound("Webhook delivery");
    return { deliveryId: await queueDelivery(tx, { businessId: input.businessId, endpointId: original.endpointId, eventId: original.eventId }) };
  });
}

export function webhookRetryDelaySeconds(attemptNumber: number): number | null {
  // attemptNumber is the attempt that just failed (1-based).
  return WEBHOOK_RETRY_DELAYS_SECONDS[attemptNumber - 1] ?? null;
}

export type WebhookAttemptOutcome = "succeeded" | "retry_scheduled" | "failed" | "skipped" | "stale";

/**
 * Runs one delivery attempt: loads the event and endpoint, sends, and records
 * the result. A failed attempt schedules the next one through the outbox; the
 * last failure marks the delivery failed and may disable the endpoint.
 */
export async function processWebhookDelivery(
  context: DomainContext,
  input: { businessId: string; deliveryId: string; attempt: number; send: WebhookSender; now?: () => Date },
): Promise<{ outcome: WebhookAttemptOutcome; endpointDisabled: boolean }> {
  const now = input.now ?? (() => new Date());
  const target = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({
      status: webhookDeliveries.status,
      attemptCount: webhookDeliveries.attemptCount,
      endpointStatus: webhookEndpoints.status,
      url: webhookEndpoints.url,
      encryptedSecret: webhookEndpoints.encryptedSecret,
      eventId: webhookEvents.id,
      eventType: webhookEvents.type,
      payload: webhookEvents.payload,
    }).from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
      .where(and(eq(webhookDeliveries.businessId, input.businessId), eq(webhookDeliveries.id, input.deliveryId)))
      .limit(1);
    if (!row) return { kind: "missing" as const };
    // Duplicate or out-of-date jobs for an attempt that already ran do nothing.
    if (!["pending", "retrying"].includes(row.status) || row.attemptCount !== input.attempt - 1) return { kind: "stale" as const };
    if (row.endpointStatus !== "enabled" && row.eventType !== WEBHOOK_TEST_EVENT_TYPE) {
      await tx.update(webhookDeliveries).set({ status: "skipped", nextAttemptAt: null, lastError: "The endpoint is disabled.", updatedAt: now() }).where(eq(webhookDeliveries.id, input.deliveryId));
      return { kind: "skipped" as const };
    }
    return { kind: "send" as const, url: row.url, secret: decryptWebhookSecret(row.encryptedSecret), eventId: row.eventId, body: JSON.stringify(row.payload) };
  });
  if (target.kind === "missing") return { outcome: "skipped", endpointDisabled: false };
  if (target.kind === "stale") return { outcome: "stale", endpointDisabled: false };
  if (target.kind === "skipped") return { outcome: "skipped", endpointDisabled: false };

  const result = await input.send({ url: target.url, secret: target.secret, id: target.eventId, body: target.body });
  deliveryAttempts.add(1, { outcome: result.ok ? "success" : "failure" });

  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [delivery] = await tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.businessId, input.businessId), eq(webhookDeliveries.id, input.deliveryId))).limit(1).for("update");
    if (!delivery || delivery.attemptCount !== input.attempt - 1 || !["pending", "retrying"].includes(delivery.status)) return { outcome: "stale" as const, endpointDisabled: false };
    const at = now();
    const error = result.error?.slice(0, 500) ?? null;
    await tx.insert(webhookDeliveryAttempts).values({ businessId: input.businessId, deliveryId: delivery.id, attemptNumber: input.attempt, responseStatus: result.status, error, durationMs: result.durationMs, attemptedAt: at });
    const base = { attemptCount: input.attempt, lastAttemptAt: at, lastResponseStatus: result.status, lastError: error, updatedAt: at };
    if (result.ok) {
      await tx.update(webhookDeliveries).set({ ...base, status: "succeeded", succeededAt: at, nextAttemptAt: null }).where(eq(webhookDeliveries.id, delivery.id));
      await tx.update(webhookEndpoints).set({ consecutiveFailures: 0, lastSuccessAt: at, updatedAt: at }).where(eq(webhookEndpoints.id, delivery.endpointId));
      return { outcome: "succeeded" as const, endpointDisabled: false };
    }
    const [endpoint] = await tx.update(webhookEndpoints).set({ consecutiveFailures: sql`${webhookEndpoints.consecutiveFailures} + 1`, lastFailureAt: at, updatedAt: at }).where(eq(webhookEndpoints.id, delivery.endpointId)).returning();
    const delaySeconds = input.attempt < WEBHOOK_MAX_ATTEMPTS ? webhookRetryDelaySeconds(input.attempt) : null;
    if (delaySeconds !== null) {
      const nextAttemptAt = new Date(at.getTime() + delaySeconds * 1000);
      await tx.update(webhookDeliveries).set({ ...base, status: "retrying", nextAttemptAt }).where(eq(webhookDeliveries.id, delivery.id));
      await enqueueOutbox(tx, { topic: "webhook.deliver", businessId: input.businessId, aggregateType: "webhook_delivery", aggregateId: delivery.id, dedupeKey: `webhook-delivery:${delivery.id}:attempt:${input.attempt + 1}`, payload: { deliveryId: delivery.id, attempt: input.attempt + 1 }, availableAt: nextAttemptAt });
      return { outcome: "retry_scheduled" as const, endpointDisabled: false };
    }
    await tx.update(webhookDeliveries).set({ ...base, status: "failed", nextAttemptAt: null }).where(eq(webhookDeliveries.id, delivery.id));
    // Sustained failure: this message failed every retry (about 23 hours) and
    // nothing reached the endpoint since it was created.
    const sustained = endpoint && endpoint.status === "enabled" && (!endpoint.lastSuccessAt || endpoint.lastSuccessAt < delivery.createdAt);
    if (!sustained) return { outcome: "failed" as const, endpointDisabled: false };
    await tx.update(webhookEndpoints).set({ status: "disabled", disabledReason: "failing", disabledAt: at, updatedAt: at }).where(eq(webhookEndpoints.id, endpoint.id));
    await tx.insert(auditLogs).values({ businessId: input.businessId, eventType: "webhook_endpoint.auto_disabled", entityType: "webhook_endpoint", entityId: endpoint.id, payload: { consecutiveFailures: endpoint.consecutiveFailures } });
    await queueOperatorAlertInTransaction(tx, {
      businessId: input.businessId,
      eventKind: "webhookDisabled",
      eventKey: `webhookDisabled:${endpoint.id}:${at.getTime()}`,
      subject: "A webhook endpoint was turned off",
      body: `LobbyStack stopped sending events to ${new URL(endpoint.url).host} after every delivery failed for about a day. Fix the endpoint, then turn it back on in Integrations > Webhooks.`,
    });
    endpointsDisabled.add(1);
    return { outcome: "failed" as const, endpointDisabled: true };
  });
}

/** Deletes webhook history past the retention window and expired API idempotency records. */
export async function pruneApiHistory(context: DomainContext, input: { businessId: string; now?: Date }): Promise<{ events: number; idempotencyKeys: number }> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const eventCutoff = new Date(now.getTime() - WEBHOOK_HISTORY_RETENTION_DAYS * 86_400_000);
    // Keep events whose deliveries are still being retried.
    const active = tx.select({ eventId: webhookDeliveries.eventId }).from(webhookDeliveries).where(and(eq(webhookDeliveries.businessId, input.businessId), inArray(webhookDeliveries.status, ["pending", "retrying"])));
    const events = await tx.delete(webhookEvents).where(and(eq(webhookEvents.businessId, input.businessId), lt(webhookEvents.createdAt, eventCutoff), sql`${webhookEvents.id} not in (${active})`)).returning({ id: webhookEvents.id });
    const keys = await tx.delete(idempotencyKeys).where(and(eq(idempotencyKeys.businessId, input.businessId), sql`${idempotencyKeys.scope} like 'api:%'`, lt(idempotencyKeys.createdAt, new Date(now.getTime() - PUBLIC_API_IDEMPOTENCY_TTL_HOURS * 3_600_000)))).returning({ id: idempotencyKeys.id });
    return { events: events.length, idempotencyKeys: keys.length };
  });
}

