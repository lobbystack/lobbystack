import { NextResponse } from "next/server";

import { deleteContact, getContactDetail, setContactSmsManualBlock } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ contactId: string }>(async ({ userId, businessId, domain }, { contactId }) => NextResponse.json(await getContactDetail(domain, { userId, businessId, contactId })));

export const PATCH = operatorRoute<{ contactId: string }>(async ({ userId, businessId, body, domain }, { contactId }) => {
  const blocked = body.smsBlocked;
  if (typeof blocked !== "boolean") return jsonError("smsBlocked must be a boolean.", 400);
  const updated = await setContactSmsManualBlock(domain, { userId, businessId, contactId, blocked });
  return updated ? NextResponse.json({ contactId, smsBlocked: blocked }) : jsonError("Contact not found.", 404);
});

export const DELETE = operatorRoute<{ contactId: string }>(async ({ userId, businessId, domain }, { contactId }) => {
  const deleted = await deleteContact(domain, { userId, businessId, contactId });
  return deleted ? NextResponse.json({ ok: true, behavior: "deleted" }) : jsonError("Contact not found.", 404);
});
