import { NextResponse } from "next/server";

import { businessHasPhoneNumber, getCachedBusinessSnapshot, getWebVoiceBillingAllowance, getWidgetChatAllowance, snapshotForAgent } from "@lobbystack/domain";

import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetSessionAccess } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    const visitorId = session.visitorId ?? "";
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, ...(visitorId ? { visitorId } : {}), ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "config" });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });

    // The session request already saved the visitor and the key's last use.
    const context = createWorkerDomainContext();
    const [snapshot, chatBilling, voiceBilling] = await Promise.all([
      getCachedBusinessSnapshot(context, { businessId: session.businessId }),
      getWidgetChatAllowance(context, { businessId: session.businessId }),
      getWebVoiceBillingAllowance(context, { businessId: session.businessId }),
    ]);

    // Only for what the widget shows, so this public route never refreshes a snapshot.
    const agentSnapshot = snapshot && (snapshotForAgent(snapshot, session.agentId) ?? snapshot);

    return NextResponse.json({
      key: session.widgetKeyId,
      business: { id: session.businessId, name: session.businessName, defaultLocale: session.defaultLocale },
      config: session.config,
      billing: { chatAllowed: chatBilling.allowed, plan: chatBilling.plan, voiceAllowed: voiceBilling.allowed },
      greeting: session.config.greeting ?? agentSnapshot?.greeting ?? undefined,
      snapshotPresent: snapshot !== null,
      businessSlug: session.businessSlug,
      voiceEnabled: snapshot !== null && businessHasPhoneNumber(snapshot),
    });
  } catch (error) {
    return asApiResponse(error);
  }
}
