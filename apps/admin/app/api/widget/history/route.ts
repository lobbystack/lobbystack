import { NextResponse } from "next/server";

import { getOrCreateWidgetConversation, loadWidgetChatHistory, registerWidgetVisitor } from "@lobbystack/domain";

import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetSessionAccess } from "@/lib/widget-access";
import { isValidUuid, requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    const visitorId = session.visitorId ?? "";
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, ...(visitorId ? { visitorId } : {}), ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "history" }, { consume: true });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });

    const context = createWorkerDomainContext();
    if (!isValidUuid(visitorId)) return NextResponse.json({ messages: [] });
    await registerWidgetVisitor(context, { businessId: session.businessId, visitorId, metadata: { userAgent: request.headers.get("user-agent") ?? undefined } });
    const { conversationId } = await getOrCreateWidgetConversation(context, { businessId: session.businessId, widgetVisitorId: visitorId });
    const rows = await loadWidgetChatHistory(context, { businessId: session.businessId, conversationId });
    return NextResponse.json({ conversationId, messages: rows.map((row) => ({ id: row.id, role: row.direction === "outbound" ? "assistant" : "user", content: row.body, createdAt: row.createdAt.toISOString() })) });
  } catch (error) {
    return asApiResponse(error);
  }
}
