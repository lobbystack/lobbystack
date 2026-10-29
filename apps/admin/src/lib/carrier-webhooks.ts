import "server-only";

import { sql } from "drizzle-orm";

import { isSharedSmsSender, receiveInboundSms, receiveSharedSenderSms, resolveRefusedCallForward, updateNotificationDeliveryStatus, updateOperatorNotificationDeliveryStatus, updateSmsDeliveryStatus } from "@lobbystack/domain";
import type { FallbackCallEvent, InboundSmsEvent, SmsStatusEvent } from "@lobbystack/providers/telephony/events";
import type { CarrierId } from "@lobbystack/providers/telephony/types";

import { getAppDatabase } from "./api-helpers";
import { createWorkerDomainContext } from "./domain-context";

/**
 * What a carrier's webhook does once it has checked the carrier's signature
 * and mapped the payload: the same for every carrier, so a new carrier's
 * routes only verify and parse.
 */

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

async function businessByPhone(phone: string): Promise<string | undefined> {
  return (await getAppDatabase().db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_phone(${phone}) as business_id`)).rows[0]?.business_id ?? undefined;
}

/**
 * Where a call the receptionist won't take goes: the first dialled number
 * that belongs to a business decides, and resolveRefusedCallForward picks the
 * forward. A forward to the dialled number or the line that forwarded the
 * call here would loop, so those get a busy signal.
 */
export async function fallbackForCall(event: FallbackCallEvent): Promise<{ action: "forward"; to: string } | { action: "reject" }> {
  for (const to of event.dialled) {
    const businessId = await businessByPhone(to);
    if (!businessId) continue;
    const forward = await resolveRefusedCallForward(createWorkerDomainContext(), { businessId, e164: to, forwardedFrom: event.forwardedFrom });
    return forward ? { action: "forward", to: forward } : { action: "reject" };
  }
  return { action: "reject" };
}

/**
 * Records an inbound text. A text to the shared sender, which belongs to no
 * business, answers STOP, START and HELP; the reply comes back for the route
 * to send.
 */
export async function receiveCarrierSms(event: InboundSmsEvent, carrier: CarrierId): Promise<{ reply: string | null }> {
  const businessId = await businessByPhone(event.to);
  if (!businessId) {
    if (!isSharedSmsSender(event.to)) return { reply: null };
    const { reply } = await receiveSharedSenderSms(createWorkerDomainContext(), { from: event.from, body: event.body, ...(event.optOutType ? { optOutType: event.optOutType } : {}) });
    return { reply: reply ?? null };
  }
  await receiveInboundSms(createWorkerDomainContext(), {
    businessId,
    carrier,
    providerMessageId: event.providerMessageId,
    from: event.from,
    to: event.to,
    body: event.body,
    payload: { From: event.from, To: event.to, Body: event.body, MessageSid: event.providerMessageId, ...(event.numMedia !== undefined ? { NumMedia: event.numMedia } : {}), ...(event.optOutType ? { OptOutType: event.optOutType } : {}) },
  });
  return { reply: null };
}

/**
 * Applies a delivery status to the row the callback URL names, a
 * conversation text, an appointment notification or an operator alert, or
 * else to the text with the provider's id. Throws when the update fails, so
 * the carrier delivers the status again.
 */
export async function applyCarrierSmsStatus(event: SmsStatusEvent, carrier: CarrierId, query: URLSearchParams): Promise<void> {
  const db = getAppDatabase().db;
  const id = (key: string) => { const value = query.get(key); return value && UUID_PATTERN.test(value) ? value : null; };
  const messageId = id("messageId"); const notificationId = id("notificationId"); const operatorDeliveryId = id("operatorDeliveryId");
  const businessId = (await db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_message(${event.providerMessageId}) as business_id`)).rows[0]?.business_id
    ?? (messageId ? (await db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_message_id(${messageId}::uuid) as business_id`)).rows[0]?.business_id : null)
    ?? (notificationId ? (await db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_notification_id(${notificationId}::uuid) as business_id`)).rows[0]?.business_id : null)
    ?? (operatorDeliveryId ? (await db.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_operator_delivery_id(${operatorDeliveryId}::uuid) as business_id`)).rows[0]?.business_id : null);
  if (!businessId) return;
  const context = createWorkerDomainContext();
  const pricing = { ...(event.providerPrice !== undefined ? { providerPrice: event.providerPrice } : {}), ...(event.providerPriceUnit ? { providerPriceUnit: event.providerPriceUnit } : {}), ...(event.providerCostUsd !== undefined ? { providerCostUsd: event.providerCostUsd } : {}), ...(event.providerNumSegments !== undefined ? { providerNumSegments: event.providerNumSegments } : {}) };
  const base = { businessId, providerMessageId: event.providerMessageId, providerStatus: event.status };
  if (messageId) await updateSmsDeliveryStatus(context, { ...base, messageId });
  else if (notificationId) await updateNotificationDeliveryStatus(context, { ...base, notificationId, carrier, ...pricing });
  else if (operatorDeliveryId) await updateOperatorNotificationDeliveryStatus(context, { ...base, deliveryId: operatorDeliveryId, carrier, ...pricing });
  else await updateSmsDeliveryStatus(context, base);
}
