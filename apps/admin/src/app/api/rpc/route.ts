import { NextRequest } from "next/server";

import { errorResponse, jsonResponse } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";
import { dispatchRpc } from "@/lib/rpc-handlers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { path?: string; args?: Record<string, unknown> };
    if (!body.path) {
      return jsonResponse({ error: "Missing path" }, { status: 400 });
    }
    const result = await dispatchRpc(body.path, body.args ?? {});
    return jsonResponse({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
