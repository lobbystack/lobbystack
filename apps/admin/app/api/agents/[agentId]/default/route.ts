import { NextResponse } from "next/server";
import { z } from "zod";

import { setDefaultAgent } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Makes this agent the business's default. */
export const POST = operatorRoute<{ agentId: string }>(async ({ userId, businessId, domain }, params) => {
  await setDefaultAgent(domain, { userId, businessId, agentId: z.uuid().parse(params.agentId) });
  return NextResponse.json({ ok: true });
});
