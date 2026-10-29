import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getCalendarWebhook, queueCalendarWebhookSync, resolveBusinessByCalendarWebhook } from "@lobbystack/domain";
import { CALCOM_WEBHOOK_TRIGGERS, SecretBox, verifyCalcomWebhookSignature } from "@lobbystack/providers";
import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNC_TRIGGERS = new Set<string>(CALCOM_WEBHOOK_TRIGGERS);

/**
 * Cal.com's booking webhook for one connection. A verified delivery about a
 * booking queues a calendar sync for the business; the sync reads Cal.com
 * again, so the payload itself is never trusted for busy time.
 */
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) return new NextResponse("Cal.com isn't set up on this server.", { status: 503 });
  const { connectionId } = await params;
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });
  if (!UUID.test(connectionId)) return new NextResponse("Not found", { status: 404 });
  const context = createWorkerDomainContext();
  try {
    const businessId = await resolveBusinessByCalendarWebhook(context, connectionId);
    // A disconnected connection's webhook can still fire until Cal.com drops it. Acknowledge it so Cal.com stops retrying.
    if (!businessId) return NextResponse.json({ received: true });
    const webhook = await getCalendarWebhook(context, { businessId, connectionId });
    if (!webhook?.encryptedWebhookSecret) return NextResponse.json({ received: true });
    if (!verifyCalcomWebhookSignature(rawBody, request.headers.get("x-cal-signature-256"), new SecretBox(encryptionKey).decrypt(webhook.encryptedWebhookSecret))) return new NextResponse("Invalid signature", { status: 401 });
    let payload: { triggerEvent?: unknown };
    try {
      payload = JSON.parse(rawBody) as { triggerEvent?: unknown };
    } catch {
      return new NextResponse("Invalid JSON", { status: 400 });
    }
    if (typeof payload.triggerEvent !== "string" || !SYNC_TRIGGERS.has(payload.triggerEvent)) return NextResponse.json({ received: true });
    await queueCalendarWebhookSync(context, { businessId, connectionId, deliveryKey: createHash("sha256").update(rawBody).digest("hex").slice(0, 32) });
  } catch (error) {
    // A 5xx lets Cal.com deliver again; the sync it queues is deduplicated.
    return asApiResponse(error);
  }
  return NextResponse.json({ received: true });
}
