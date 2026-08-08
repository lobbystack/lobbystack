import { NextRequest } from "next/server";

import { getContactDetail } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    const contactId = request.nextUrl.searchParams.get("contactId");
    if (!businessId || !contactId) {
      return jsonResponse({ error: "businessId and contactId are required" }, { status: 400 });
    }
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const contact = await getContactDetail({ businessId, contactId });
    return jsonResponse({ contact });
  } catch (error) {
    return errorResponse(error);
  }
}
