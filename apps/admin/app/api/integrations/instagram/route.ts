import { NextResponse } from "next/server";

import { disconnectInstagramAccount, getInstagramAccount } from "@lobbystack/domain";
import { createDomainContext } from "@/lib/domain-context";
import { instagramConfigured } from "@/lib/instagram-oauth";
import { operatorRoute } from "@/lib/operator-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ userId, businessId }) => {
  const account = await getInstagramAccount(createDomainContext(), { userId, businessId });
  return NextResponse.json({
    configured: instagramConfigured(),
    account: account ? { username: account.username, status: account.status, connectedAt: account.connectedAt.toISOString() } : null,
  });
});

export const DELETE = operatorRoute(async ({ userId, businessId }) => {
  const disconnected = await disconnectInstagramAccount(createDomainContext(), { userId, businessId });
  return NextResponse.json({ disconnected });
});
