import { NextResponse } from "next/server";
import { z } from "zod";

import { listInboxItems } from "@lobbystack/domain";
import { asApiResponse, jsonError, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  channel: z.enum(["call", "chat", "text"]).optional(),
  agentId: z.string().uuid().optional(),
  search: z.string().max(120).optional(),
});

/** Calls, website chats and texts in one list, newest first. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      channel: params.get("channel") || undefined,
      agentId: params.get("agentId") || undefined,
      search: params.get("search") || undefined,
    });
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => ({
      items: await listInboxItems(createDomainContext(), { userId: session.user.id, businessId, ...(query.channel ? { channel: query.channel } : {}), ...(query.agentId ? { agentId: query.agentId } : {}), ...(query.search ? { search: query.search } : {}) }),
    })));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Invalid inbox filter.", 400, "invalid_request");
    return asApiResponse(error);
  }
}
