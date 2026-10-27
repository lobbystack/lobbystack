import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { polarWebhookSchema } from "@lobbystack/contracts";
import { businesses, enqueueOutbox, providerEvents, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { recordPartnerPolarEvent } from "@lobbystack/domain";
import type { SelfHostedSupportProduct } from "@lobbystack/shared";
import { verifyPolarWebhookSignature } from "@lobbystack/providers";
import { getAppDatabase, getDispatcherDatabase, getWorkerDatabase } from "@/lib/api-helpers";
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

// A webhook we cannot attribute to a business or a partner is dropped with a
// 200, which is correct for Polar but leaves no trace of a subscription that
// never applied. This log line is the only signal that a billing event went
// missing. It is not a product event: product_events rows need a business,
// and this has none.
function recordUnresolvedWebhook(
  input: { eventType: string; reason: "no_reference" | "unknown_business" | "unknown_partner"; reference?: string },
): void {
  console.error(JSON.stringify({
    event: "ops.billing.webhook_unresolved",
    provider: "polar",
    eventType: input.eventType,
    reason: input.reason,
    ...(input.reference ? { [input.reason === "unknown_partner" ? "partnerReference" : "businessReference"]: input.reference } : {}),
  }));
}

// A self-hosted support plan sells to whoever pays at its checkout link, so
// no account learns of the sale. This line is how the team hears of one, once
// per subscription, to welcome the buyer and set up their support.
function recordSupportPlanPurchase(input: { plan: SelfHostedSupportProduct; subscriptionId?: unknown; customerId?: unknown }): void {
  console.info(JSON.stringify({
    event: "ops.billing.support_plan_purchased",
    provider: "polar",
    audience: input.plan.audience,
    tier: input.plan.tier,
    billingInterval: input.plan.billingInterval,
    ...(typeof input.subscriptionId === "string" ? { subscriptionId: input.subscriptionId } : {}),
    ...(typeof input.customerId === "string" ? { customerId: input.customerId } : {}),
  }));
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
    const { supportPlan } = normalized;
    if (supportPlan && event.data.type === "subscription.created") {
      recordSupportPlanPurchase({ plan: supportPlan, subscriptionId: normalized.payload.subscriptionId, customerId: normalized.payload.customerId });
    }
    // A support plan still routes to the account its customer names: the
    // account's own subscription may have moved to it in the portal, and
    // reconcile ends the hosted plan or tier then. A support plan that names no
    // account is an ordinary sale, so it isn't logged as unresolved.
    // A partner's tier: its events belong to no business, so they're stored for the partner.
    if (normalized.partnerId) {
      const outcome = await recordPartnerPolarEvent({ db: getAppDatabase().db }, { partnerId: normalized.partnerId, providerEventId: event.data.id, eventType: event.data.type, payload: normalized.payload });
      if (outcome === "unknown_partner") {
        if (!supportPlan) recordUnresolvedWebhook({ eventType: event.data.type, reason: "unknown_partner", reference: `partner:${normalized.partnerId}` });
        return NextResponse.json({ accepted: true, ignored: true });
      }
      return NextResponse.json({ accepted: true, duplicate: outcome === "duplicate", eventId: event.data.id });
    }
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
      if (!supportPlan) recordUnresolvedWebhook({
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
      if (!supportPlan) recordUnresolvedWebhook({
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
