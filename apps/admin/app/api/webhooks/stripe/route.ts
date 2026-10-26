import { NextResponse } from "next/server";

import { recordStripeConnectEvent } from "@lobbystack/domain";
import type { StripeConnectEvent } from "@lobbystack/providers/stripe/stripeConnect";
import { getAppDatabase } from "@/lib/api-helpers";
import { getStripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The Connect webhook: Stripe sends it events that happen on partners'
// connected accounts. Each verified event is stored once and applied here.
// Account updates and disconnections name no business. Checkout,
// subscription and invoice events reconcile the business's subscription,
// read back from Stripe, so they can arrive in any order.

// An event on an account no partner has, about a subscription that names
// none of that partner's businesses, or about one that pays for a package
// its business isn't on, is dropped with a 200, which Stripe needs, so this
// log line is the only trace of it. It is not a product event: product_events
// rows need a business, and the first two have none.
function recordUnresolvedWebhook(event: StripeConnectEvent, reason: "unknown_account" | "unknown_business" | "other_package"): void {
  console.error(JSON.stringify({
    event: "ops.billing.webhook_unresolved",
    provider: "stripe",
    eventType: event.type,
    reason,
    ...(event.accountId ? { accountId: event.accountId } : {}),
    ...(reason !== "unknown_account" && event.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
  }));
}

export async function POST(request: Request) {
  const stripe = getStripeConnect();
  // Without Stripe Connect there is no signing secret to check a delivery against.
  if (!stripe) return new NextResponse("Unauthorized", { status: 401 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.text();
  let event: StripeConnectEvent;
  try {
    event = stripe.verifyWebhook(body, signature);
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const outcome = await recordStripeConnectEvent({ db: getAppDatabase().db, stripeConnect: stripe }, event);
    if (!outcome.duplicate && !outcome.partnerId) recordUnresolvedWebhook(event, "unknown_account");
    else if (!outcome.duplicate && outcome.businessId === null) recordUnresolvedWebhook(event, "unknown_business");
    else if (!outcome.duplicate && outcome.otherPackage) recordUnresolvedWebhook(event, "other_package");
    return NextResponse.json({ accepted: true, duplicate: outcome.duplicate, eventId: event.id });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
