import { NextResponse } from "next/server";

import { disconnectInstagramAccount, getInstagramAccount } from "@lobbystack/domain";
import { createDomainContext } from "@/lib/domain-context";
import { instagramConfigured } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every member sees whether Instagram is offered, so the card stays hidden
// until it is, which account the receptionist answers, and as which agent.
// The account's id lets an agent's channels move it to another agent.
export const GET = operatorRoute(async ({ userId, businessId }) => {
  const configured = instagramConfigured();
  const account = configured ? await getInstagramAccount(createDomainContext(), { userId, businessId }) : null;
  return NextResponse.json({
    configured,
    account: account ? { id: account.id, username: account.username, status: account.status, connectedAt: account.connectedAt.toISOString(), agentId: account.agentId } : null,
  });
});

export const DELETE = operatorRoute(async ({ userId, businessId }) => {
  const disconnected = await disconnectInstagramAccount(createDomainContext(), { userId, businessId });
  return NextResponse.json({ disconnected });
});
