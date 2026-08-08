import { NextRequest } from "next/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await request.json();
    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
