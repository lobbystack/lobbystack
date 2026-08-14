import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { twilioSmsStatusSchema } from "@lobbystack/contracts";
import { updateNotificationDeliveryStatus, updateOperatorNotificationDeliveryStatus, updateSmsDeliveryStatus } from "@lobbystack/domain";
import { normalizeTwilioFormFields, validateTwilioSignature } from "@lobbystack/shared";
import { getAppDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const params = normalizeTwilioFormFields(new URLSearchParams(rawBody));
    const valid = await validateTwilioSignature({ authToken: process.env.TWILIO_AUTH_TOKEN, signatureHeader: request.headers.get("x-twilio-signature"), url: process.env.TWILIO_STATUS_CALLBACK_URL ?? request.url, params });
    if (!valid) return new NextResponse("Unauthorized", { status: 401 });
    const body = twilioSmsStatusSchema.parse(params);
    const providerPrice = body.Price !== undefined && Number.isFinite(Number(body.Price)) ? Number(body.Price) : undefined;
    const providerPriceUnit = body.PriceUnit?.trim().toLowerCase() || undefined;
    const providerCostUsd = providerPrice !== undefined && providerPriceUnit === "usd" ? Math.abs(providerPrice) : undefined;
    const providerMessageId = body.MessageSid ?? body.SmsSid;
    if (!providerMessageId) return NextResponse.json({ ok: true });
    const messageId = new URL(request.url).searchParams.get("messageId");
    const notificationId = new URL(request.url).searchParams.get("notificationId");
    const operatorDeliveryId = new URL(request.url).searchParams.get("operatorDeliveryId");
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_message(${providerMessageId}) as business_id`);
    const byMessageId = messageId && /^[0-9a-f-]{36}$/i.test(messageId)
      ? await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_message_id(${messageId}::uuid) as business_id`)
      : null;
    const byNotificationId = notificationId && /^[0-9a-f-]{36}$/i.test(notificationId)
      ? await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_notification_id(${notificationId}::uuid) as business_id`)
      : null;
    const byOperatorDeliveryId = operatorDeliveryId && /^[0-9a-f-]{36}$/i.test(operatorDeliveryId)
      ? await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_operator_delivery_id(${operatorDeliveryId}::uuid) as business_id`)
      : null;
    const businessId = resolved.rows[0]?.business_id ?? byMessageId?.rows[0]?.business_id ?? byNotificationId?.rows[0]?.business_id ?? byOperatorDeliveryId?.rows[0]?.business_id;
    if (!businessId) return NextResponse.json({ ok: true });
    const workerContext = createWorkerDomainContext();
    if (messageId && /^[0-9a-f-]{36}$/i.test(messageId)) await updateSmsDeliveryStatus(workerContext, { businessId, providerMessageId, providerStatus: body.MessageStatus, messageId });
    else if (notificationId && /^[0-9a-f-]{36}$/i.test(notificationId)) await updateNotificationDeliveryStatus(workerContext, { businessId, notificationId, providerMessageId, providerStatus: body.MessageStatus, ...(providerPrice !== undefined ? { providerPrice } : {}), ...(providerPriceUnit ? { providerPriceUnit } : {}), ...(providerCostUsd !== undefined ? { providerCostUsd } : {}), ...(body.NumSegments !== undefined ? { providerNumSegments: body.NumSegments } : {}) });
    else if (operatorDeliveryId && /^[0-9a-f-]{36}$/i.test(operatorDeliveryId)) await updateOperatorNotificationDeliveryStatus(workerContext, { businessId, deliveryId: operatorDeliveryId, providerMessageId, providerStatus: body.MessageStatus, ...(providerPrice !== undefined ? { providerPrice } : {}), ...(providerPriceUnit ? { providerPriceUnit } : {}), ...(providerCostUsd !== undefined ? { providerCostUsd } : {}), ...(body.NumSegments !== undefined ? { providerNumSegments: body.NumSegments } : {}) });
    else await updateSmsDeliveryStatus(workerContext, { businessId, providerMessageId, providerStatus: body.MessageStatus });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
