import { NextResponse } from "next/server";

import { ContactPhoneTakenError, createContact, listContacts } from "@lobbystack/domain";
import { apiContactCreateSchema } from "@lobbystack/shared";
import { jsonError } from "@/lib/api-helpers";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  return NextResponse.json(await listContacts(domain, { userId, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) }));
});

/**
 * An operator adds a contact by hand: a name, and a phone or an email. The
 * domain requires an owner or admin, as editing a contact does. A phone
 * another contact has answers 409 contact_exists with that contact's id.
 */
export const POST = operatorRoute(async ({ userId, businessId, body, domain }) => {
  const fields = Object.fromEntries(["name", "phone", "email"].flatMap((key) => typeof body[key] === "string" && body[key].trim() ? [[key, body[key].trim()]] : []));
  if (!fields.name) return jsonError("name is required.", 400, "invalid_request");
  const parsed = apiContactCreateSchema.safeParse(fields);
  if (!parsed.success || !parsed.data.name) return jsonError(parsed.error?.issues[0]?.message ?? "The contact details are not valid.", 400, "invalid_request");
  try {
    const { contactId } = await createContact(domain, { userId, businessId, name: parsed.data.name, ...(parsed.data.phone ? { phone: parsed.data.phone } : {}), ...(parsed.data.email ? { email: parsed.data.email } : {}) });
    return NextResponse.json({ contactId }, { status: 201 });
  } catch (error) {
    if (error instanceof ContactPhoneTakenError) return NextResponse.json({ error: "A contact with this phone number already exists.", code: error.code, ...(error.contactId ? { contactId: error.contactId } : {}) }, { status: 409 });
    throw error;
  }
});
