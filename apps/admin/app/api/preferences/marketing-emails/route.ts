import { NextResponse } from "next/server";

import { marketingEmailsSubscribed, setMarketingEmailsSubscribed } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";
import { signedInRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

/** Whether the signed-in person gets the host's marketing emails: the welcome and the plan reminders. */
export const GET = signedInRoute(async ({ userId }) => {
  return NextResponse.json({ subscribed: await marketingEmailsSubscribed(getAuthDatabase().db, userId) ?? true });
});

export const PATCH = signedInRoute(async ({ userId, body }) => {
  const { subscribed } = body;
  if (typeof subscribed !== "boolean") return jsonError("subscribed must be true or false.", 400);
  const result = await setMarketingEmailsSubscribed(getAuthDatabase().db, { userId, subscribed });
  return NextResponse.json(result ?? { subscribed });
});
