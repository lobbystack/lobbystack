import { NextResponse } from "next/server";

import { listBusinessNotifications } from "@lobbystack/domain";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** The bell's list for the signed-in person in the business: action required first, each marked read or unread for them. */
export const GET = operatorRoute(async ({ access, businessId, domain, userId }) => {
  const notifications = await listBusinessNotifications(domain, { userId, businessId, reader: access });
  return NextResponse.json({ notifications });
});
