import { NextResponse } from "next/server";
import { z } from "zod";

import { listWebsitePages } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const documentId = z.uuid();
const agentId = z.uuid().optional();

/** A website's pages, for its dialog. With ?agentId, whether each shared page is on for that agent. */
export const GET = operatorRoute<{ documentId: string }>(async ({ request, userId, businessId, domain }, params) => {
  const agent = agentId.parse(new URL(request.url).searchParams.get("agentId") ?? undefined);
  return NextResponse.json(await listWebsitePages(domain, { userId, businessId, documentId: documentId.parse(params.documentId), ...(agent ? { agentId: agent } : {}) }));
});
