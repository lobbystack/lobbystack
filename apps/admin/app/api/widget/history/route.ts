import { NextResponse } from "next/server";

import { findCurrentWidgetConversationId, loadWidgetChatView } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";

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
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, ...(visitorId ? { visitorId } : {}), ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "history" });
    if (!rate.allowed) return NextResponse.json({ error: "Rate limit reached.", code: rate.code }, { status: rate.status });

    const context = createWorkerDomainContext();
    if (!isUuid(visitorId)) return NextResponse.json({ messages: [] });
    // Reading never starts a chat: the visitor's first message does, so one who only looks leaves none behind.
    const conversationId = await findCurrentWidgetConversationId(context, { businessId: session.businessId, widgetVisitorId: visitorId });
    if (!conversationId) return NextResponse.json({ messages: [] });
    const view = await loadWidgetChatView(context, { businessId: session.businessId, conversationId, liveChatOn: session.config.liveChat?.enabled === true });
    return NextResponse.json({
      conversationId,
      automationState: view.automationState,
      waitingForTeam: view.waitingForTeam,
      teamMemberName: view.teamMemberName,
      // A team member's message carries their first name, when they have one.
      messages: view.messages.map((row) => ({
        id: row.id,
        role: row.direction === "outbound" ? "assistant" : "user",
        content: row.body,
        createdAt: row.createdAt.toISOString(),
        ...(row.fromTeam ? { fromTeam: true, teamMemberName: row.teamMemberName } : {}),
      })),
    });
  } catch (error) {
    return asApiResponse(error);
  }
}
