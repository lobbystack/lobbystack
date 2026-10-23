import { NextResponse } from "next/server";

import { disconnectInstagramAccount, getInstagramAccount } from "@lobbystack/domain";
import { createDomainContext } from "@/lib/domain-context";
import { instagramConfigured } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every member learns whether Instagram is offered, so the card stays hidden
// until it is. Only owners and admins see the connected account.
export const GET = operatorRoute(async ({ userId, businessId }) => {
  const configured = instagramConfigured();
  const account = configured
    ? await getInstagramAccount(createDomainContext(), { userId, businessId }).catch((error: unknown) => {
      if ((error as { status?: number }).status === 403) return null;
      throw error;
    })
    : null;
  return NextResponse.json({
    configured,
    account: account ? { username: account.username, status: account.status, connectedAt: account.connectedAt.toISOString() } : null,
  });
});

export const DELETE = operatorRoute(async ({ userId, businessId }) => {
  const disconnected = await disconnectInstagramAccount(createDomainContext(), { userId, businessId });
  return NextResponse.json({ disconnected });
});
