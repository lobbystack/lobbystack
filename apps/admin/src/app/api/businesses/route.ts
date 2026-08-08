import { NextRequest } from "next/server";

import { createBusinessRequestSchema } from "@lobbystack/contracts";
import { createBusiness, listBusinessesForUser } from "@lobbystack/domain/server";

import { errorResponse, jsonResponse, parseJsonBody } from "@/lib/api-helpers";
import { requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const businesses = await listBusinessesForUser({ userId: session.userId });
    return jsonResponse({ businesses });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = createBusinessRequestSchema.parse(await parseJsonBody(request));
    const businessId = await createBusiness({ userId: session.userId, values: body });
    return jsonResponse({ businessId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
