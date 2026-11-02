import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getCalendarWebhook, queueCalendarWebhookSync, resolveBusinessByCalendarWebhook } from "@lobbystack/domain";
import { CALENDLY_WEBHOOK_EVENTS, SecretBox, calendlyCalendarConfigFromEnv, verifyCalendlyWebhookSignature } from "@lobbystack/providers";
import { asApiResponse } from "@/lib/api-helpers";
import { enforceCalendarWebhookClientLimit, enforceCalendarWebhookConnectionLimit } from "@/lib/calendar-webhook-limit";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { readTextWithin } from "@/lib/operator-request";
import { trustedClientIp } from "@/lib/trusted-client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNC_EVENTS = new Set<string>(CALENDLY_WEBHOOK_EVENTS);

/**
 * Calendly's booking webhook for one connection. A verified delivery about an
 * invitee queues a calendar sync for the business; the sync reads Calendly
 * again, so the payload itself is never trusted for busy time.
 */
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const config = calendlyCalendarConfigFromEnv();
  if (!encryptionKey || !config) return new NextResponse("Calendly isn't set up on this server.", { status: 503 });
  const { connectionId } = await params;
  if (!UUID.test(connectionId)) return new NextResponse("Not found", { status: 404 });
  // Forged deliveries are cheap to send, so each client is counted before the body is read or the database is asked.
  const client = await enforceCalendarWebhookClientLimit({ ip: trustedClientIp(request) });
  if (!client.allowed) return new NextResponse("Too many requests", { status: client.status });
  let rawBody: string;
  try {
    rawBody = await readTextWithin(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof Response) return new NextResponse("Payload too large", { status: 413 });
    throw error;
  }
  const context = createWorkerDomainContext();
  try {
    const businessId = await resolveBusinessByCalendarWebhook(context, connectionId);
    // A disconnected connection's webhook can still fire until Calendly drops it. Acknowledge it so Calendly stops retrying.
    if (!businessId) return NextResponse.json({ received: true });
    const webhook = await getCalendarWebhook(context, { businessId, connectionId });
    if (webhook?.provider !== "calendly" || !webhook.encryptedWebhookSecret) return NextResponse.json({ received: true });
    // Calendly's docs say an OAuth app's deliveries carry the app's key, and also take a key per subscription, so either passes.
    const keys = [new SecretBox(encryptionKey).decrypt(webhook.encryptedWebhookSecret), config.webhookSigningKey];
    if (!verifyCalendlyWebhookSignature(rawBody, request.headers.get("calendly-webhook-signature"), keys)) return new NextResponse("Invalid signature", { status: 401 });
    // Counted only once Calendly's signature checks out, so a forger can't use up a real connection's budget.
    const connection = await enforceCalendarWebhookConnectionLimit({ connectionId: connectionId.toLowerCase() });
    if (!connection.allowed) return new NextResponse("Too many requests", { status: connection.status });
    let payload: { event?: unknown };
    try {
      payload = JSON.parse(rawBody) as { event?: unknown };
    } catch {
      return new NextResponse("Invalid JSON", { status: 400 });
    }
    if (typeof payload.event !== "string" || !SYNC_EVENTS.has(payload.event)) return NextResponse.json({ received: true });
    await queueCalendarWebhookSync(context, { businessId, connectionId, deliveryKey: createHash("sha256").update(rawBody).digest("hex").slice(0, 32) });
  } catch (error) {
    // A 5xx lets Calendly deliver again; the sync it queues is deduplicated.
    return asApiResponse(error);
  }
  return NextResponse.json({ received: true });
}
