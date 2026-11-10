import { NextResponse } from "next/server";

import { deleteContact, getContactDetail, setContactSmsManualBlock, updateContactDetails } from "@lobbystack/domain";
import { apiContactUpdateSchema } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute<{ contactId: string }>(async ({ userId, businessId, domain }, { contactId }) => NextResponse.json(await getContactDetail(domain, { userId, businessId, contactId })));

export const PATCH = operatorRoute<{ contactId: string }>(async ({ userId, businessId, body, domain }, { contactId }) => {
  if ("name" in body || "email" in body) {
    const details = apiContactUpdateSchema.pick({ name: true, email: true }).safeParse({ ...("name" in body ? { name: body.name } : {}), ...("email" in body ? { email: body.email } : {}) });
    if (!details.success) return jsonError(details.error.issues[0]?.message ?? "The contact details are not valid.", 400);
    const saved = await updateContactDetails(domain, { userId, businessId, contactId, ...details.data });
    return saved ? NextResponse.json(saved) : jsonError("Contact not found.", 404);
  }
  const blocked = body.smsBlocked;
  if (typeof blocked !== "boolean") return jsonError("smsBlocked must be a boolean.", 400);
  const updated = await setContactSmsManualBlock(domain, { userId, businessId, contactId, blocked });
  return updated ? NextResponse.json({ contactId, smsBlocked: blocked }) : jsonError("Contact not found.", 404);
});

export const DELETE = operatorRoute<{ contactId: string }>(async ({ userId, businessId, domain }, { contactId }) => {
  const deleted = await deleteContact(domain, { userId, businessId, contactId });
  return deleted ? NextResponse.json({ ok: true, behavior: "deleted" }) : jsonError("Contact not found.", 404);
});
