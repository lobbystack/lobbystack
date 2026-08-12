import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { resendWebhookSchema } from "@lobbystack/contracts";
import { enqueueOutbox, providerEvents, withBusinessTransaction, withDispatcherTransaction } from "@lobbystack/db";
import { verifyResendWebhookSignature } from "@lobbystack/providers";
import { getAppDatabase, getDispatcherDatabase, getWorkerDatabase } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: "Resend webhooks are not configured." }, { status: 503 });
    const body = await request.text();
    const headers = { id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "" };
    if (!verifyResendWebhookSignature(body, headers, secret)) return new NextResponse("Unauthorized", { status: 401 });
    const parsed = resendWebhookSchema.safeParse(JSON.parse(body) as unknown);
    if (!parsed.success) return NextResponse.json({ error: "Invalid Resend webhook." }, { status: 400 });
    const emailId = stringField(parsed.data.data.email_id) ?? stringField(parsed.data.data.emailId);
    const businessResult = emailId ? await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_email_provider_id(${emailId}) as business_id`) : null;
    const businessId = businessResult?.rows[0]?.business_id;
    const normalizedPayload = { ...(emailId ? { emailId } : {}), eventType: parsed.data.type, ...(parsed.data.created_at ? { createdAt: parsed.data.created_at } : {}), ...(stringField(parsed.data.data.reason) ? { reason: stringField(parsed.data.data.reason) } : {}) };
    const persist = async (tx: Parameters<Parameters<ReturnType<typeof getWorkerDatabase>["db"]["transaction"]>[0]>[0]) => {
      const [stored] = await tx.insert(providerEvents).values({ provider: "resend", providerEventId: headers.id, eventType: parsed.data.type, ...(businessId ? { businessId } : {}), payload: normalizedPayload }).onConflictDoNothing().returning({ id: providerEvents.id });
      if (stored && businessId) await enqueueOutbox(tx, { topic: "email.reconcileDelivery", businessId, aggregateType: "provider_event", aggregateId: stored.id, dedupeKey: `provider-event:${headers.id}:email`, payload: { providerEventId: stored.id } });
      return Boolean(stored);
    };
    const inserted = businessId ? await withBusinessTransaction(getWorkerDatabase().db, { businessId, actorType: "worker" }, persist) : await withDispatcherTransaction(getDispatcherDatabase().db, persist);
    return NextResponse.json({ accepted: true, duplicate: !inserted, eventId: headers.id });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
