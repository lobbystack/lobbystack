import { NextResponse } from "next/server";

import { getCachedBusinessSnapshot, getWebVoiceBillingAllowance, getWidgetChatAllowance, registerWidgetVisitor } from "@lobbystack/domain";

import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetSessionAccess } from "@/lib/widget-access";
import { requestIpHash, touchWidgetKeyLastUsed } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";
import { webCallEndpoint } from "@/lib/web-call-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    const visitorId = session.visitorId ?? "";
    const customerOrigin = session.origin ?? "";
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, ...(visitorId ? { visitorId } : {}), ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "config" }, { consume: true });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });

    const context = createWorkerDomainContext();
    if (visitorId) await registerWidgetVisitor(context, { businessId: session.businessId, visitorId, metadata: { userAgent: request.headers.get("user-agent") ?? undefined, ...(customerOrigin ? { pageUrl: customerOrigin } : {}) } });
    await touchWidgetKeyLastUsed({ businessId: session.businessId, widgetKeyId: session.widgetKeyId });

    const [snapshot, chatBilling, voiceBilling] = await Promise.all([
      getCachedBusinessSnapshot(context, { businessId: session.businessId }),
      getWidgetChatAllowance(context, { businessId: session.businessId }),
      getWebVoiceBillingAllowance(context, { businessId: session.businessId }),
    ]);

    return NextResponse.json({
      key: session.widgetKeyId,
      business: { id: session.businessId, name: session.businessName, defaultLocale: session.defaultLocale },
      config: session.config,
      billing: { chatAllowed: chatBilling.allowed, plan: chatBilling.plan, voiceAllowed: voiceBilling.allowed },
      greeting: session.config.greeting ?? snapshot?.greeting ?? undefined,
      snapshotPresent: snapshot !== null,
      businessSlug: session.businessSlug,
      webCallBaseUrl: webCallEndpoint,
      voiceEnabled: Boolean(snapshot?.contactChannels?.phoneNumber),
    });
  } catch (error) {
    return asApiResponse(error);
  }
}
