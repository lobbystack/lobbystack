import { NextResponse } from "next/server";

import { deleteContact, getContactDetail, setContactSmsManualBlock } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await context.params;
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => await getContactDetail(createDomainContext(), { userId: session.user.id, businessId, contactId })));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request);
    const blocked = typeof body === "object" && body !== null ? (body as { smsBlocked?: unknown }).smsBlocked : undefined;
    if (typeof blocked !== "boolean") return jsonError("smsBlocked must be a boolean.", 400);
    const { contactId } = await context.params;
    const updated = await setContactSmsManualBlock(createDomainContext(), { userId: session.user.id, businessId, contactId, blocked });
    return updated ? NextResponse.json({ contactId, smsBlocked: blocked }) : jsonError("Contact not found.", 404);
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const { contactId } = await context.params;
    const deleted = await deleteContact(createDomainContext(), { userId: session.user.id, businessId, contactId });
    return deleted ? NextResponse.json({ ok: true, behavior: "deleted" }) : jsonError("Contact not found.", 404);
  } catch (error) { return asApiResponse(error); }
}
