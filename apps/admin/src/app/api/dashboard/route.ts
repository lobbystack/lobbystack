import { NextRequest } from "next/server";

import { getAnalyticsOverview, getDashboardSummary } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
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
    const [summary, analytics] = await Promise.all([
      getDashboardSummary({ businessId }),
      getAnalyticsOverview({ businessId, since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }),
    ]);
    return jsonResponse({ summary, analytics });
  } catch (error) {
    return errorResponse(error);
  }
}
