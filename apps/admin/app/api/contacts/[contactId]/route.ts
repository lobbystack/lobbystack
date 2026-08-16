import { NextResponse } from "next/server";

import { anonymizeContact, getContactDetail, setContactSmsManualBlock } from "@lobbystack/domain";
import { asApiResponse, businessIdFromRequest, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const { contactId } = await context.params;
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    return NextResponse.json(await getContactDetail(createDomainContext(), { userId: session.user.id, businessId, contactId }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const body = await readJson(request);
    const blocked = typeof body === "object" && body !== null ? (body as { smsBlocked?: unknown }).smsBlocked : undefined;
    if (typeof blocked !== "boolean") return NextResponse.json({ error: "smsBlocked must be a boolean." }, { status: 400 });
    const { contactId } = await context.params;
    const updated = await setContactSmsManualBlock(createDomainContext(), { userId: session.user.id, businessId, contactId, blocked });
    return updated ? NextResponse.json({ contactId, smsBlocked: blocked }) : NextResponse.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ contactId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const { contactId } = await context.params;
    const deleted = await anonymizeContact(createDomainContext(), { userId: session.user.id, businessId, contactId });
    return deleted ? NextResponse.json({ ok: true, behavior: "anonymized" }) : NextResponse.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) { return asApiResponse(error); }
}
