import { NextResponse } from "next/server";

import { listUserBusinesses } from "@lobbystack/domain";
import { signedInRoute } from "@/lib/operator-request";
import { requestBrandScope } from "@/lib/request-brand";

export const dynamic = "force-dynamic";

export const GET = signedInRoute(async ({ request, session, userId, domain }) => NextResponse.json({
  user: session.user,
  session: { id: session.session.id, expiresAt: session.session.expiresAt.toISOString() },
  businesses: await listUserBusinesses(domain.db, userId, requestBrandScope(request.headers)),
}));
