import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { polarWebhookSchema } from "@lobbystack/contracts";
import { businesses, enqueueOutbox, providerEvents, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { verifyPolarWebhookSignature } from "@lobbystack/providers";
import { recordProductEvent } from "@lobbystack/domain";
import { getDispatcherDatabase, getWorkerDatabase } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { normalizePolarEvent } from "@/lib/polar-event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSignature(body: string, headers: Headers): boolean {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;
  return verifyPolarWebhookSignature(body, {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": signature,
  }, secret);
}

// A webhook we cannot attribute to a business is dropped with a 200, which is
// correct for Polar but leaves no trace of a subscription that never applied.
// This is the only signal that a billing event went missing.
async function recordUnresolvedWebhook(
  input: { eventType: string; reason: "no_reference" | "unknown_business"; reference?: string },
): Promise<void> {
  try {
    await recordProductEvent(createWorkerDomainContext(), {
      name: "ops.billing.webhook_unresolved",
      distinctId: `system:billing:${input.reason}`,
      actorType: "worker",
      properties: {
        provider: "polar",
        eventType: input.eventType,
        reason: input.reason,
        ...(input.reference ? { businessReference: input.reference } : {}),
      },
    });
  } catch {
    // Telemetry about a dropped webhook must not itself fail the webhook.
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (!validSignature(body, request.headers)) return new NextResponse("Unauthorized", { status: 401 });
    // Standard Webhooks supplies the delivery ID in headers, not the JSON body.
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    const event = polarWebhookSchema.safeParse({ ...raw, id: request.headers.get("webhook-id") ?? raw.id });
    if (!event.success) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    const normalized = normalizePolarEvent(event.data.type, event.data.data);
    // The live Polar organization also serves staging. UUID references are safe
    // everywhere; legacy Convex references are resolved only during production
    // cutover when the environment explicitly enables compatibility routing.
    const allowLegacyReference = process.env.POLAR_ACCEPT_LEGACY_BUSINESS_IDS === "true";
    const condition = normalized.businessId
      ? eq(businesses.id, normalized.businessId)
      : allowLegacyReference && normalized.businessReference
        ? eq(businesses.legacyConvexId, normalized.businessReference)
        : undefined;
    if (!condition) {
      await recordUnresolvedWebhook({
        eventType: event.data.type,
        reason: "no_reference",
        ...(normalized.businessReference ? { reference: normalized.businessReference } : {}),
      });
      return NextResponse.json({ accepted: true, ignored: true });
    }
    const businessId = await withDispatcherTransaction(getDispatcherDatabase().db, async tx => {
      return (await tx.select({ id: businesses.id }).from(businesses).where(condition).limit(1))[0]?.id;
    });
    if (!businessId) {
      await recordUnresolvedWebhook({
        eventType: event.data.type,
        reason: "unknown_business",
        ...(normalized.businessReference ? { reference: normalized.businessReference } : {}),
      });
      return NextResponse.json({ accepted: true, ignored: true });
    }
    const persist = async (tx: Parameters<Parameters<ReturnType<typeof getWorkerDatabase>["db"]["transaction"]>[0]>[0]) => {
      const [stored] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: event.data.id, eventType: event.data.type, businessId, payload: normalized.payload }).onConflictDoNothing().returning({ id: providerEvents.id });
      if (stored && businessId) {
        await enqueueOutbox(tx, { topic: "billing.reconcile", businessId, aggregateType: "provider_event", aggregateId: stored.id, dedupeKey: `provider-event:${event.data.id}:billing`, payload: { providerEventId: stored.id } });
      }
      return Boolean(stored);
    };
    const inserted = await withBusinessTransaction(getWorkerDatabase().db, { businessId, actorType: "worker" }, persist);
    return NextResponse.json({ accepted: true, duplicate: !inserted, eventId: event.data.id });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
