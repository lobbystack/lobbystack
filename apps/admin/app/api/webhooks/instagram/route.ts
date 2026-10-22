import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { receiveInstagramMessage, resolveBusinessByInstagramAccount } from "@lobbystack/domain";
import { verifyInstagramWebhookSignature } from "@lobbystack/providers";
import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; is_unsupported?: boolean };
};
type WebhookPayload = { object?: string; entry?: Array<{ id?: string; messaging?: MessagingEvent[] }> };

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Meta's subscription check: echo the challenge when the verify token matches. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
  const token = url.searchParams.get("hub.verify_token") ?? "";
  if (!expected || url.searchParams.get("hub.mode") !== "subscribe" || !sameText(token, expected)) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) return new NextResponse("Instagram isn't set up on this server.", { status: 503 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });
  if (!verifyInstagramWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) return new NextResponse("Invalid signature", { status: 401 });
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  if (payload.object !== "instagram") return NextResponse.json({ received: true });
  const context = createWorkerDomainContext();
  try {
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const message = event.message;
        const senderId = event.sender?.id;
        const accountId = event.recipient?.id ?? entry.id;
        // Echoes are the account's own messages, including the assistant's replies.
        if (!message?.mid || !message.text?.trim() || message.is_echo || message.is_deleted || message.is_unsupported || !senderId || !accountId) continue;
        if (senderId === accountId) continue;
        const businessId = await resolveBusinessByInstagramAccount(context, accountId);
        if (!businessId) continue;
        await receiveInstagramMessage(context, {
          businessId,
          senderId,
          providerMessageId: message.mid,
          text: message.text,
          sentAt: typeof event.timestamp === "number" ? new Date(event.timestamp) : new Date(),
        });
      }
    }
  } catch (error) {
    // A 5xx makes Meta redeliver; messages already stored are deduplicated.
    return asApiResponse(error);
  }
  return NextResponse.json({ received: true });
}
