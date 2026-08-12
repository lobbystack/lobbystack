import { NextResponse } from "next/server";

import { polarWebhookSchema } from "@lobbystack/contracts";
import { enqueueOutbox, providerEvents, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { verifyPolarWebhookSignature } from "@lobbystack/providers";
import { getDispatcherDatabase, getWorkerDatabase } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSignature(body: string, headers: Headers): boolean {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
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

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (!validSignature(body, request.headers)) return new NextResponse("Unauthorized", { status: 401 });
    const event = polarWebhookSchema.safeParse(JSON.parse(body) as unknown);
    if (!event.success) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    const businessId = typeof event.data.data.businessId === "string" ? event.data.data.businessId : undefined;
    const persist = async (tx: Parameters<Parameters<ReturnType<typeof getWorkerDatabase>["db"]["transaction"]>[0]>[0]) => {
      const [stored] = await tx.insert(providerEvents).values({ provider: "polar", providerEventId: event.data.id, eventType: event.data.type, ...(businessId ? { businessId } : {}), payload: event.data.data }).onConflictDoNothing().returning({ id: providerEvents.id });
      if (stored && businessId) {
        await enqueueOutbox(tx, { topic: "billing.reconcile", businessId, aggregateType: "provider_event", aggregateId: stored.id, dedupeKey: `provider-event:${event.data.id}:billing`, payload: { providerEventId: stored.id } });
      }
      return Boolean(stored);
    };
    const inserted = businessId
      ? await withBusinessTransaction(getWorkerDatabase().db, { businessId, actorType: "worker" }, persist)
      : await withDispatcherTransaction(getDispatcherDatabase().db, persist);
    return NextResponse.json({ accepted: true, duplicate: !inserted, eventId: event.data.id });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
