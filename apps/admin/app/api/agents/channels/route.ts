import { NextResponse } from "next/server";
import { z } from "zod";

import { moveChannel } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const moveSchema = z.object({ kind: z.enum(["phone_number", "widget_key", "instagram_account"]), id: z.uuid(), agentId: z.uuid() });

/** Points a number, widget or Instagram account at another agent. */
export const PUT = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const input = moveSchema.parse(body);
  await moveChannel(domain, { userId, businessId, kind: input.kind, channelId: input.id, agentId: input.agentId });
  return NextResponse.json({ ok: true });
});
