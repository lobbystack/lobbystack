import { NextRequest } from "next/server";

import { sendSmsReplyRequestSchema } from "@lobbystack/contracts";
import { listConversationSummaries, sendSmsReply } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse, parseJsonBody } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return jsonResponse({ error: "businessId is required" }, { status: 400 });
    }
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const conversations = await listConversationSummaries({ businessId });
    return jsonResponse({ conversations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = sendSmsReplyRequestSchema.parse(await parseJsonBody(request));
    await requireBusinessAccess({ businessId: body.businessId, userId: session.userId });
    const result = await sendSmsReply({
      values: body,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
