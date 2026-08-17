import { NextResponse } from "next/server";

import { getWidgetChatAllowance, loadLatestBusinessSnapshot, registerWidgetVisitor } from "@lobbystack/domain";

import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetAccess } from "@/lib/widget-access";
import { isValidUuid, requestIpHash, touchWidgetKeyLastUsed } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const widgetKey = url.searchParams.get("key");
    const visitorId = url.searchParams.get("visitorId") ?? "";
    const access = await resolveWidgetAccess(request, widgetKey);
    if (!access.ok) return access.response;
    const { session } = access;
    const customerOrigin = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, ...(visitorId ? { visitorId } : {}), ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "config" }, { consume: true });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });

    const context = createWorkerDomainContext();
    if (isValidUuid(visitorId)) {
      await registerWidgetVisitor(context, { businessId: session.businessId, visitorId, metadata: { userAgent: request.headers.get("user-agent") ?? undefined, pageUrl: customerOrigin ? new URL(customerOrigin).pathname : undefined } });
    }
    await touchWidgetKeyLastUsed({ businessId: session.businessId, widgetKeyId: session.widgetKeyId });

    const [snapshot, billing] = await Promise.all([
      loadLatestBusinessSnapshot(context, { businessId: session.businessId }),
      getWidgetChatAllowance(context, { businessId: session.businessId }),
    ]);

    return NextResponse.json({
      key: session.widgetKeyId,
      business: { id: session.businessId, name: session.businessName, defaultLocale: session.defaultLocale },
      config: session.config,
      billing: { chatAllowed: billing.allowed, plan: billing.plan },
      greeting: session.config.greeting ?? snapshot?.greeting ?? undefined,
      snapshotPresent: snapshot !== null,
    });
  } catch (error) {
    return asApiResponse(error);
  }
}
