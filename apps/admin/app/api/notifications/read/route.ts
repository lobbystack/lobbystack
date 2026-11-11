import { NextResponse } from "next/server";

import { markBusinessNotificationsRead } from "@lobbystack/domain";
import { isUuid } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

const MAX_IDS = 100;

/** Marks notifications read for the signed-in person: { ids } names them, { all: true } reads every one they see. */
export const POST = operatorRoute(async ({ access, body, businessId, domain, userId }) => {
  const all = body.all === true;
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!all && (!ids.length || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && isUuid(id)))) {
    return jsonError(`Send all: true, or ids with 1 to ${MAX_IDS} notification ids.`, 400);
  }
  const marked = await markBusinessNotificationsRead(domain, { userId, businessId, reader: access, ...(all ? { all } : { ids: ids as string[] }) });
  return NextResponse.json({ marked });
});
