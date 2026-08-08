import { NextRequest } from "next/server";

import { getBillingAccount } from "@lobbystack/domain/server";

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
    const billing = await getBillingAccount({ businessId });
    return jsonResponse({ billing });
  } catch (error) {
    return errorResponse(error);
  }
}
